"""
Amazon Nova (Bedrock Converse) document reader, used for PDFs that Rekognition cannot read.

The model returns text, not geometry or OCR confidence, so every field it produces is marked
`extraction_source="nova_vision"` with confidence 0.0 (meaning "not an OCR confidence") and the
UI presents it as an AI-read value that must be confirmed or corrected. Unreadable weights are
dropped, never zeroed.
"""
import json
import os
import re
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from app.extraction.textract import WEIGHT_FIELDS, canonical_field_name, parse_number, parse_unit
from app.schemas.batch import DocumentType, EvidenceDocument, ExtractedField

DEFAULT_VISION_MODEL = "us.amazon.nova-lite-v1:0"
MAX_DOCUMENT_BYTES = 4_500_000  # Converse document/image payload limit

PROMPT = (
    "Extract the labelled key-value fields from this e-waste recycling document (waybill, weighbridge "
    "ticket or recycling certificate). Use ONLY text that appears in the document; never guess or "
    "compute values. Reply with a single JSON object: {\"fields\": [{\"key\": string, \"value\": string}]}. "
    "Keep weights exactly as printed, including their unit. No prose outside the JSON."
)


def _parse_json(text: str) -> List[Dict[str, Any]]:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\s*|\s*```$", "", text)
    start = min([i for i in (text.find("{"), text.find("[")) if i >= 0], default=-1)
    if start < 0:
        raise ValueError("The model did not return JSON.")
    data = json.JSONDecoder().raw_decode(text[start:])[0]
    items = data.get("fields", []) if isinstance(data, dict) else data
    return [i for i in items if isinstance(i, dict) and i.get("key") and str(i.get("value", "")).strip()]


def fields_from_pairs(pairs: List[Dict[str, Any]], doc_id: str) -> List[ExtractedField]:
    fields: List[ExtractedField] = []
    seen: Dict[str, int] = {}
    for p in pairs:
        key, value = str(p["key"]).strip().rstrip(":"), str(p["value"]).strip()
        name = canonical_field_name(key)
        unit: Optional[str] = None
        parsed: Any = value
        if name in WEIGHT_FIELDS:
            number = parse_number(value)
            if number is None:
                continue
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
                label=key,
                value=parsed,
                unit=unit,
                confidence=0.0,
                page_number=1,
                extraction_source="nova_vision",
            )
        )
    return fields


class NovaVisionExtractionProvider:
    def __init__(self, model_id: Optional[str] = None, region_name: Optional[str] = None):
        self.model_id = model_id or os.getenv("EXTRACTION_VISION_MODEL_ID") or DEFAULT_VISION_MODEL
        region = region_name or os.getenv("AWS_REGION", os.getenv("AWS_DEFAULT_REGION", "us-east-1"))
        try:
            import boto3

            self._bedrock = boto3.client("bedrock-runtime", region_name=region)
            self._s3 = boto3.client("s3", region_name=region)
        except Exception as exc:
            raise RuntimeError(f"Amazon Bedrock client could not be created: {exc}") from exc

    def extract_from_s3(
        self,
        bucket: str,
        key: str,
        file_name: str,
        document_type: Optional[DocumentType] = None,
        batch_id: Optional[str] = None,
        doc_id: Optional[str] = None,
    ) -> EvidenceDocument:
        lower = file_name.lower()
        if not lower.endswith((".pdf", ".png", ".jpg", ".jpeg")):
            raise ValueError("Unsupported file type for AI document reading.")
        try:
            body = self._s3.get_object(Bucket=bucket, Key=key)["Body"].read()
        except Exception as exc:
            raise RuntimeError(f"Could not read '{file_name}' from evidence storage: {exc}") from exc
        if len(body) > MAX_DOCUMENT_BYTES:
            raise ValueError("The file is larger than the 4.5 MB limit for AI document reading.")
        if lower.endswith(".pdf"):
            block = {"document": {"format": "pdf", "name": re.sub(r"[^A-Za-z0-9 \-\(\)\[\]]", " ", os.path.splitext(file_name)[0])[:60] or "document", "source": {"bytes": body}}}
        else:
            block = {"image": {"format": "png" if lower.endswith(".png") else "jpeg", "source": {"bytes": body}}}
        try:
            res = self._bedrock.converse(
                modelId=self.model_id,
                messages=[{"role": "user", "content": [block, {"text": PROMPT}]}],
                inferenceConfig={"maxTokens": 800, "temperature": 0},
            )
            pairs = _parse_json(res["output"]["message"]["content"][0]["text"])
        except Exception as exc:
            raise RuntimeError(f"Amazon Nova document reading failed for '{file_name}' ({self.model_id}): {exc}") from exc
        doc_id = doc_id or f"doc-{uuid.uuid4().hex[:10]}"
        return EvidenceDocument(
            id=doc_id,
            batch_id=batch_id or "batch-live",
            title=f"AI-read: {file_name}",
            document_type=document_type or DocumentType.OTHER,
            file_name=file_name,
            file_size="stored in S3",
            upload_timestamp=datetime.utcnow().isoformat() + "Z",
            status="extracted",
            content_stored=True,
            extracted_text_snippet=f"Fields read by {self.model_id}; no OCR confidence or regions are available.",
            extracted_fields=fields_from_pairs(pairs, doc_id),
        )
