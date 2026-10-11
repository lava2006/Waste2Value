import json
import hashlib
from datetime import datetime
from typing import Dict, Any, Optional, Tuple
import uuid
from app.schemas.batch import CircularityPassport, BatchResponse, VerificationStatus

def serialize_canonical_passport(payload: Dict[str, Any]) -> str:
    """
    Deterministic Canonical JSON Serialization (RFC 8785 compliant style):
    Alphabetical key sorting, compact separators without extra whitespace, UTF-8.
    """
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)

def compute_passport_sha256(canonical_json: str) -> str:
    """Computes SHA-256 hex digest of the canonical string."""
    return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()

from app.passports.kms_signer import KMSSigner

kms_signer = KMSSigner()

def passport_canonical_payload(passport: CircularityPassport) -> Dict[str, Any]:
    """Rebuild the exact payload that was hashed at issuance from stored passport fields."""
    return {
        "passport_id": passport.passport_id,
        "version": passport.version,
        "batch_id": passport.batch_id,
        "batch_number": passport.batch_number,
        "recycler_name": passport.recycler_name,
        "recycler_license": passport.recycler_license,
        "category": passport.category.value,
        "claimed_kg": passport.claimed_kg,
        "evidence_supported_kg": passport.evidence_supported_kg,
        "estimated_value_usd": passport.estimated_value_usd,
        "issued_at": passport.issue_timestamp,
    }

def recompute_passport_hash(passport: CircularityPassport) -> str:
    return compute_passport_sha256(serialize_canonical_passport(passport_canonical_payload(passport)))

def create_circularity_passport(
    batch: BatchResponse,
    issuer_name: str = "Waste2Value Authoritative Verification Engine v1",
    passport_id: Optional[str] = None,
) -> Tuple[bool, str, CircularityPassport]:
    """
    Issues an authoritative Circularity Passport for a batch.
    Enforces that the batch status must be SUPPORTED.
    Calculates canonical payload, RFC 8785 SHA-256 hash, and AWS KMS asymmetric signature.
    """
    if batch.status != VerificationStatus.SUPPORTED:
        return (
            False,
            f"Cannot issue passport. Batch status is '{batch.status.value}'. Must be 'SUPPORTED'.",
            None
        )

    if batch.mass_balance.evidence_supported_kg is None or not batch.claimed_quantity:
        return (False, "Cannot issue passport. No evidence-supported quantity is recorded for this batch.", None)

    passport_id = passport_id or f"W2V-CP-{uuid.uuid4().hex[:8].upper()}"
    now_iso = datetime.utcnow().isoformat() + "Z"

    canonical_payload = {
        "passport_id": passport_id,
        "version": 1,
        "batch_id": batch.id,
        "batch_number": batch.batch_number,
        "recycler_name": batch.recycler_name,
        "recycler_license": batch.recycler_registration_id,
        "category": batch.category.value,
        "claimed_kg": batch.claimed_quantity,
        "evidence_supported_kg": batch.mass_balance.evidence_supported_kg,
        "estimated_value_usd": batch.material_estimate.net_estimated_recovery_value_usd,
        "issued_at": now_iso,
    }

    canonical_str = serialize_canonical_passport(canonical_payload)
    sha256_hash = compute_passport_sha256(canonical_str)
    digital_signature, sig_status, sig_algo = kms_signer.sign_digest(sha256_hash)

    passport = CircularityPassport(
        passport_id=passport_id,
        version=1,
        batch_id=batch.id,
        batch_number=batch.batch_number,
        qr_code_url=f"/verify/{passport_id}",
        verification_url=f"/verify/{passport_id}",
        issue_timestamp=now_iso,
        issuer_name=issuer_name,
        recycler_name=batch.recycler_name,
        recycler_license=batch.recycler_registration_id,
        facility_location=batch.destination_location,
        category=batch.category,
        claimed_kg=batch.claimed_quantity,
        evidence_supported_kg=batch.mass_balance.evidence_supported_kg,
        recovery_rate_percent=round((batch.mass_balance.evidence_supported_kg / batch.claimed_quantity) * 100, 1),
        estimated_value_usd=batch.material_estimate.net_estimated_recovery_value_usd,
        sha256_hash=sha256_hash,
        integrity_status="VALID",
        signature_status=sig_status,
        kms_key_arn=kms_signer.key_arn,
        kms_signature_algorithm=sig_algo,
        digital_signature_base64=digital_signature,
        revoked=False,
        recovery_pathway=batch.material_estimate.recommended_pathway,
        public_attributes={
            "co2_avoided_kg": int(batch.mass_balance.evidence_supported_kg * 2.84),
            "primary_recovered_material": batch.material_estimate.fractions[0].material_name if batch.material_estimate.fractions else "Mixed Metals",
            "circularity_score": max(70, min(99, 100 - int(batch.risk_score.overall_score * 0.4))),
            "audit_status": "EVIDENCE_SUPPORTED",
            "signing_authority": "AWS Key Management Service (eu-central-1)",
        },
    )

    return True, f"Circularity Passport {passport_id} issued successfully.", passport
