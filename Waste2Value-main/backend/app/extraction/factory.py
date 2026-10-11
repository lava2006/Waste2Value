import os
from typing import Optional
from app.schemas.batch import DocumentType, EvidenceDocument

STORAGE_EXTRACTORS = ("textract", "rekognition")


def extraction_mode() -> str:
    return os.getenv("EXTRACTION", "demo").lower()


def storage_extraction_enabled() -> bool:
    return extraction_mode() in STORAGE_EXTRACTORS


def provider_summary() -> dict:
    mode = extraction_mode()
    if mode == "textract":
        return {"provider": "amazon-textract", "live_aws": True}
    if mode == "rekognition":
        return {"provider": "amazon-rekognition+nova", "live_aws": True}
    return {"provider": "simulated", "live_aws": False}


def extract_from_storage(
    bucket: str,
    key: str,
    file_name: str,
    document_type: Optional[DocumentType] = None,
    batch_id: Optional[str] = None,
    doc_id: Optional[str] = None,
) -> EvidenceDocument:
    """
    Reads a stored evidence file with the configured AWS service. No silent fallback: an
    unsupported combination raises an explicit error.
      textract    -> Amazon Textract (FORMS)
      rekognition -> images: Amazon Rekognition DetectText (real OCR geometry/confidence)
                     PDFs:   Amazon Nova document reading (AI-read values, flagged as such)
    """
    mode = extraction_mode()
    lower = file_name.lower()
    if mode == "textract":
        from app.extraction.textract import TextractExtractionProvider

        return TextractExtractionProvider().extract_from_s3(bucket, key, file_name, document_type, batch_id, doc_id)
    if mode == "rekognition":
        if lower.endswith((".png", ".jpg", ".jpeg")):
            from app.extraction.rekognition import RekognitionExtractionProvider

            return RekognitionExtractionProvider().extract_from_s3(bucket, key, file_name, document_type, batch_id, doc_id)
        if lower.endswith(".pdf"):
            from app.extraction.nova_vision import NovaVisionExtractionProvider

            return NovaVisionExtractionProvider().extract_from_s3(bucket, key, file_name, document_type, batch_id, doc_id)
        raise ValueError("Unsupported file type for extraction (PDF, PNG or JPEG).")
    raise RuntimeError("Storage-based extraction is not enabled (EXTRACTION must be 'textract' or 'rekognition').")
