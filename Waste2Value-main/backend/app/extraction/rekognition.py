"""
Amazon Rekognition DetectText OCR provider (images: PNG / JPEG).

Rekognition returns recognized text lines with a confidence and a real bounding box. It does not
understand forms, so "Key: Value" lines (or a "Key:" line followed by its value line) are paired
deterministically and mapped onto the rules engine's canonical field names. Nothing is inferred:
a weight that cannot be parsed as a number is dropped, never zeroed.
"""
import os
import re
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from app.extraction.textract import (
    WEIGHT_FIELDS,
    canonical_field_name,
    parse_number,
    parse_unit,
)
from app.schemas.batch import BoundingBox, DocumentType, EvidenceDocument, ExtractedField

_PAIR = re.compile(r"^(?P<k>[A-Za-z][^:]{1,48}?)\s*:\s*(?P<v>\S.*)$")
_KEY_ONLY = re.compile(r"^(?P<k>[A-Za-z][^:]{1,48}?)\s*:\s*$")


def _box(det: Dict[str, Any]) -> Optional[BoundingBox]:
    g = (det.get("Geometry") or {}).get("BoundingBox")
    if not g:
        return None
    return BoundingBox(
        top=round(g["Top"] * 100, 1),
        left=round(g["Left"] * 100, 1),
        width=round(g["Width"] * 100, 1),
        height=round(g["Height"] * 100, 1),
    )


def parse_rekognition_lines(detections: List[Dict[str, Any]], doc_id: str) -> Tuple[List[ExtractedField], str]:
    lines = [d for d in detections if d.get("Type") == "LINE" and str(d.get("DetectedText", "")).strip()]
    # reading order: top to bottom, then left to right
    lines.sort(key=lambda d: (round(d["Geometry"]["BoundingBox"]["Top"], 2), d["Geometry"]["BoundingBox"]["Left"]))
    fields: List[ExtractedField] = []
    seen: Dict[str, int] = {}

    def add(key: str, value: str, det: Dict[str, Any], conf: float) -> None:
        name = canonical_field_name(key)
        unit: Optional[str] = None
        parsed: Any = value.strip()
        if name in WEIGHT_FIELDS:
            number = parse_number(value)
            if number is None:
                return
            parsed = number
            unit = parse_unit(value) or parse_unit(key) or "kg"
        seen[name] = seen.get(name, 0) + 1
        if seen[name] > 1:
            name = f"{name}_{seen[name]}"
        fields.append(
            ExtractedField(
                id=f"f-{doc_id}-{len(fields) + 1}",
                document_id=doc_id,
                field_name=name,
                label=key.strip(),
                value=parsed,
                unit=unit,
                confidence=round(conf / 100.0, 3),
                page_number=1,
                bounding_box=_box(det),
                extraction_source="rekognition",
            )
        )

    i = 0
    while i < len(lines):
        text = str(lines[i]["DetectedText"]).strip()
        pair = _PAIR.match(text)
        if pair:
            add(pair.group("k"), pair.group("v"), lines[i], float(lines[i].get("Confidence", 90)))
        elif _KEY_ONLY.match(text) and i + 1 < len(lines):
            nxt = lines[i + 1]
            conf = min(float(lines[i].get("Confidence", 90)), float(nxt.get("Confidence", 90)))
            add(_KEY_ONLY.match(text).group("k"), str(nxt["DetectedText"]), nxt, conf)  # type: ignore[union-attr]
            i += 1
        i += 1

    snippet = " | ".join(str(d["DetectedText"]) for d in lines[:6]) or "Amazon Rekognition found no text."
    return fields, snippet


class RekognitionExtractionProvider:
    SUPPORTED = (".png", ".jpg", ".jpeg")

    def __init__(self, region_name: Optional[str] = None):
        self.region_name = region_name or os.getenv("AWS_REGION", os.getenv("AWS_DEFAULT_REGION", "us-east-1"))
        try:
            import boto3

            self._client = boto3.client("rekognition", region_name=self.region_name)
        except Exception as exc:
            raise RuntimeError(f"Amazon Rekognition client could not be created: {exc}") from exc

    def extract_from_s3(
        self,
        bucket: str,
        key: str,
        file_name: str,
        document_type: Optional[DocumentType] = None,
        batch_id: Optional[str] = None,
        doc_id: Optional[str] = None,
    ) -> EvidenceDocument:
        if not file_name.lower().endswith(self.SUPPORTED):
            raise ValueError("Amazon Rekognition reads PNG and JPEG images only.")
        try:
            res = self._client.detect_text(Image={"S3Object": {"Bucket": bucket, "Name": key}})
        except Exception as exc:
            raise RuntimeError(f"Amazon Rekognition call failed for '{file_name}': {exc}") from exc
        doc_id = doc_id or f"doc-{uuid.uuid4().hex[:10]}"
        fields, snippet = parse_rekognition_lines(res.get("TextDetections", []), doc_id)
        return EvidenceDocument(
            id=doc_id,
            batch_id=batch_id or "batch-live",
            title=f"OCR: {file_name}",
            document_type=document_type or DocumentType.OTHER,
            file_name=file_name,
            file_size="stored in S3",
            upload_timestamp=datetime.utcnow().isoformat() + "Z",
            status="extracted",
            content_stored=True,
            extracted_text_snippet=snippet,
            extracted_fields=fields,
        )
