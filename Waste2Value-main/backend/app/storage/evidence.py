import os
import re
from typing import Any, Dict, Optional

MAX_EVIDENCE_BYTES = 10 * 1024 * 1024  # Textract synchronous limit for images / single-page PDFs
ALLOWED_TYPES = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
}
URL_TTL_SECONDS = 600


class EvidenceStorageError(RuntimeError):
    pass


def bucket_name() -> Optional[str]:
    return os.getenv("EVIDENCE_BUCKET") or None


def storage_enabled() -> bool:
    return bool(bucket_name())


def _client():
    import boto3

    return boto3.client("s3", region_name=os.getenv("AWS_REGION", os.getenv("AWS_DEFAULT_REGION", "us-east-1")))


def safe_name(file_name: str) -> str:
    base = os.path.basename(file_name).strip() or "file"
    return re.sub(r"[^A-Za-z0-9._-]+", "_", base)[:120]


def content_type_for(file_name: str) -> Optional[str]:
    return ALLOWED_TYPES.get(os.path.splitext(file_name.lower())[1])


def create_upload(batch_id: str, doc_id: str, file_name: str, size: int) -> Dict[str, Any]:
    """Presigned POST restricted to the declared content type and a size ceiling."""
    bucket = bucket_name()
    if not bucket:
        raise EvidenceStorageError("Evidence storage is not configured (EVIDENCE_BUCKET is unset).")
    ctype = content_type_for(file_name)
    if not ctype:
        raise EvidenceStorageError(f"Unsupported file type. Accepted: {', '.join(ALLOWED_TYPES)}")
    if size <= 0 or size > MAX_EVIDENCE_BYTES:
        raise EvidenceStorageError(f"File size must be between 1 byte and {MAX_EVIDENCE_BYTES // (1024 * 1024)} MB.")
    key = f"evidence/{safe_name(batch_id)}/{safe_name(doc_id)}/{safe_name(file_name)}"
    post = _client().generate_presigned_post(
        Bucket=bucket,
        Key=key,
        Fields={"Content-Type": ctype},
        Conditions=[{"Content-Type": ctype}, ["content-length-range", 1, MAX_EVIDENCE_BYTES]],
        ExpiresIn=URL_TTL_SECONDS,
    )
    return {"storage_key": key, "upload": post, "expires_in": URL_TTL_SECONDS, "max_bytes": MAX_EVIDENCE_BYTES}


def create_download_url(storage_key: str) -> str:
    bucket = bucket_name()
    if not bucket:
        raise EvidenceStorageError("Evidence storage is not configured (EVIDENCE_BUCKET is unset).")
    return _client().generate_presigned_url(
        "get_object", Params={"Bucket": bucket, "Key": storage_key}, ExpiresIn=URL_TTL_SECONDS
    )


def object_exists(storage_key: str) -> bool:
    bucket = bucket_name()
    if not bucket:
        return False
    try:
        _client().head_object(Bucket=bucket, Key=storage_key)
        return True
    except Exception:
        return False
