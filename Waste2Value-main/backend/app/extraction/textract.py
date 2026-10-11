import os
import re
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from app.extraction.base import BaseExtractionProvider
from app.schemas.batch import (
    EvidenceDocument,
    DocumentType,
    ExtractedField,
    BoundingBox,
)

# ---------------------------------------------------------------------------------------
# Pure parsing helpers (unit-tested without AWS)
# ---------------------------------------------------------------------------------------

# (substring patterns on the normalized key) -> canonical field_name consumed by the rules engine
CANONICAL_KEYS: List[Tuple[Tuple[str, ...], str]] = [
    (("certified weight", "processed weight", "certified mass", "processed mass", "input mass"), "certified_weight"),
    (("net weight", "net intake", "net mass", "weighbridge", "scale weight", "net"), "net_weight"),
    (("manifest weight", "declared weight", "gross cargo", "shipped weight", "declared mass", "gross weight"), "manifest_weight"),
    (("waybill",), "waybill_number"),
    (("certificate no", "certificate number", "certificate id", "cert no"), "certificate_number"),
    (("ticket",), "ticket_number"),
    (("recycler", "operator", "facility name", "consignee", "entity", "company"), "entity_name"),
    (("date",), "document_date"),
]

WEIGHT_FIELDS = {"certified_weight", "net_weight", "manifest_weight"}
_UNIT_PATTERN = re.compile(r"(kgs?|kilograms?|metric\s*tons?|tonnes?|tons?|lbs?|pounds?|t)\b", re.IGNORECASE)
_NUMBER_PATTERN = re.compile(r"\d[\d.,]*")


def normalize_key(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().rstrip(":").lower())


def canonical_field_name(key_text: str) -> str:
    key = normalize_key(key_text)
    for patterns, name in CANONICAL_KEYS:
        if any(p in key for p in patterns):
            return name
    slug = re.sub(r"[^a-z0-9]+", "_", key).strip("_")
    return slug or "field"


def parse_number(text: str) -> Optional[float]:
    m = _NUMBER_PATTERN.search(text)
    if not m:
        return None
    raw = m.group(0).rstrip(".,")
    if "," in raw and "." in raw:
        decimal = "," if raw.rfind(",") > raw.rfind(".") else "."
        thousands = "." if decimal == "," else ","
        raw = raw.replace(thousands, "").replace(decimal, ".")
    elif "," in raw:
        parts = raw.split(",")
        raw = "".join(parts) if all(len(p) == 3 for p in parts[1:]) else raw.replace(",", ".")
    try:
        return float(raw)
    except ValueError:
        return None


def parse_unit(text: str) -> Optional[str]:
    m = _UNIT_PATTERN.search(text)
    if not m:
        return None
    u = m.group(1).lower().replace(" ", "")
    if u.startswith("kg") or u.startswith("kilogram"):
        return "kg"
    if u in ("t",) or u.startswith("ton") or u.startswith("metricton"):
        return "metric_ton"
    if u.startswith("lb") or u.startswith("pound"):
        return "lb"
    return None


def _block_text(block: Dict[str, Any], by_id: Dict[str, Dict[str, Any]]) -> str:
    words: List[str] = []
    for rel in block.get("Relationships", []) or []:
        if rel.get("Type") == "CHILD":
            for cid in rel.get("Ids", []):
                child = by_id.get(cid)
                if not child:
                    continue
                if child.get("BlockType") == "WORD":
                    words.append(child.get("Text", ""))
                elif child.get("BlockType") == "SELECTION_ELEMENT" and child.get("SelectionStatus") == "SELECTED":
                    words.append("X")
    return " ".join(words).strip()


def parse_textract_blocks(blocks: List[Dict[str, Any]], doc_id: str) -> Tuple[List[ExtractedField], str]:
    """Resolve KEY -> VALUE pairs (with confidence + real geometry) from an AnalyzeDocument response."""
    by_id = {b["Id"]: b for b in blocks if "Id" in b}
    lines = [b.get("Text", "") for b in blocks if b.get("BlockType") == "LINE"]
    fields: List[ExtractedField] = []
    seen: Dict[str, int] = {}

    for block in blocks:
        if block.get("BlockType") != "KEY_VALUE_SET" or "KEY" not in (block.get("EntityTypes") or []):
            continue
        key_text = _block_text(block, by_id)
        if not key_text:
            continue
        value_block = None
        for rel in block.get("Relationships", []) or []:
            if rel.get("Type") == "VALUE":
                value_block = by_id.get(rel["Ids"][0]) if rel.get("Ids") else None
        value_text = _block_text(value_block, by_id) if value_block else ""
        if not value_text:
            continue

        name = canonical_field_name(key_text)
        unit: Optional[str] = None
        value: Any = value_text
        if name in WEIGHT_FIELDS:
            number = parse_number(value_text)
            if number is None:
                continue  # an unreadable weight must not become a number
            value = number
            unit = parse_unit(value_text) or parse_unit(key_text) or "kg"
        seen[name] = seen.get(name, 0) + 1
        if seen[name] > 1:
            name = f"{name}_{seen[name]}"

        geom = (value_block or block).get("Geometry", {}).get("BoundingBox")
        box = (
            BoundingBox(
                top=round(geom["Top"] * 100, 1),
                left=round(geom["Left"] * 100, 1),
                width=round(geom["Width"] * 100, 1),
                height=round(geom["Height"] * 100, 1),
            )
            if geom
            else None
        )
        confidence = min(block.get("Confidence", 90.0), (value_block or block).get("Confidence", 90.0)) / 100.0
        fields.append(
            ExtractedField(
                id=f"f-{doc_id}-{len(fields) + 1}",
                document_id=doc_id,
                field_name=name,
                label=key_text.rstrip(":"),
                value=value,
                unit=unit,
                confidence=round(confidence, 3),
                page_number=(value_block or block).get("Page", 1),
                bounding_box=box,
                extraction_source="textract",
            )
        )

    snippet = " | ".join(lines[:6]) if lines else "Amazon Textract found no text."
    return fields, snippet


# ---------------------------------------------------------------------------------------
# Provider
# ---------------------------------------------------------------------------------------
class TextractExtractionProvider(BaseExtractionProvider):
    """
    Live Amazon Textract provider (AnalyzeDocument, FORMS). Raises explicit errors when AWS
    is unavailable; there is no silent demo fallback.
    """

    def __init__(self, region_name: Optional[str] = None):
        self.region_name = region_name or os.getenv("AWS_REGION", os.getenv("AWS_DEFAULT_REGION", "us-east-1"))
        self._client = None
        try:
            import boto3

            self._client = boto3.client("textract", region_name=self.region_name)
        except Exception as exc:
            raise RuntimeError(f"Amazon Textract client could not be created: {exc}") from exc

    def _analyze(self, document: Dict[str, Any], label: str) -> List[Dict[str, Any]]:
        try:
            response = self._client.analyze_document(Document=document, FeatureTypes=["FORMS"])
        except Exception as exc:
            raise RuntimeError(f"Amazon Textract call failed for '{label}': {exc}") from exc
        return response.get("Blocks", [])

    def extract_document(
        self,
        file_name: str,
        file_bytes: Optional[bytes] = None,
        document_type: Optional[DocumentType] = None,
        batch_id: Optional[str] = None,
    ) -> EvidenceDocument:
        if not file_bytes:
            raise ValueError(f"file_bytes are required for Amazon Textract analysis of '{file_name}'.")
        blocks = self._analyze({"Bytes": file_bytes}, file_name)
        return self._to_document(blocks, file_name, document_type, batch_id, len(file_bytes), None)

    def extract_from_s3(
        self,
        bucket: str,
        key: str,
        file_name: str,
        document_type: Optional[DocumentType] = None,
        batch_id: Optional[str] = None,
        doc_id: Optional[str] = None,
    ) -> EvidenceDocument:
        blocks = self._analyze({"S3Object": {"Bucket": bucket, "Name": key}}, file_name)
        return self._to_document(blocks, file_name, document_type, batch_id, None, doc_id)

    def _to_document(
        self,
        blocks: List[Dict[str, Any]],
        file_name: str,
        document_type: Optional[DocumentType],
        batch_id: Optional[str],
        size_bytes: Optional[int],
        doc_id: Optional[str],
    ) -> EvidenceDocument:
        doc_id = doc_id or f"doc-{uuid.uuid4().hex[:10]}"
        fields, snippet = parse_textract_blocks(blocks, doc_id)
        return EvidenceDocument(
            id=doc_id,
            batch_id=batch_id or "batch-live",
            title=f"Textract: {file_name}",
            document_type=document_type or DocumentType.OTHER,
            file_name=file_name,
            file_size=f"{size_bytes / 1024:.1f} KB" if size_bytes else "stored in S3",
            upload_timestamp=datetime.utcnow().isoformat() + "Z",
            status="extracted",
            content_stored=size_bytes is None,
            extracted_text_snippet=snippet,
            extracted_fields=fields,
        )
