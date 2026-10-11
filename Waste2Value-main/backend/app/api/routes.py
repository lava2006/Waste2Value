import os
from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel
from typing import List, Optional, Any
from datetime import datetime
from app.repositories.factory import get_repository
from app.schemas.batch import (
    BatchCreate,
    BatchResponse,
    BatchUpdate,
    EvidenceDocument,
    VerificationFinding,
    CircularityPassport,
    VerificationReportResponse,
    PassportRevocationRequest,
    VerificationStatus,
    FieldCorrectionRequest,
    PassportVersionItem,
    MaterialEstimate,
    BatchTimelineEvent,
    Severity,
)
import uuid
from app.verification.engine import run_verification, reverify_batch
from app.passports.canonical import create_circularity_passport, recompute_passport_hash, kms_signer
from app.materials.estimator import estimate_material_value
from app.storage import evidence as evidence_storage


def _event_id() -> str:
    return f"t-{uuid.uuid4().hex[:10]}"


def _authenticated_actor(request: Request) -> Optional[str]:
    """
    Verified identity from the API Gateway JWT authorizer (Cognito) when present.
    Returns None for unauthenticated/local requests, in which case callers keep the
    client-supplied (UNVERIFIED) label.
    """
    event = request.scope.get("aws.event") or {}
    claims = (((event.get("requestContext") or {}).get("authorizer") or {}).get("jwt") or {}).get("claims") or {}
    return claims.get("email") or claims.get("username") or claims.get("sub")


def _require_auth_if_configured(request: Request) -> Optional[str]:
    actor = _authenticated_actor(request)
    if os.getenv("REQUIRE_AUTH", "").lower() == "true" and not actor:
        raise HTTPException(status_code=401, detail="Authentication required.")
    return actor

router = APIRouter()
repo = get_repository()

@router.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "Waste2Value Verification Backend",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "version": "1.0.0",
        "environment": os.getenv("STAGE", "demo-local"),
    }

@router.get("/ready")
def ready_check():
    return {
        "status": "ready",
        "service": "Waste2Value Verification Backend",
        "database": "connected",
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }

@router.post("/batches", response_model=BatchResponse, status_code=status.HTTP_201_CREATED)
def create_batch(batch_in: BatchCreate, request: Request):
    _require_auth_if_configured(request)
    existing = repo.get_batch(batch_in.batch_number)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Batch with number '{batch_in.batch_number}' already exists.",
        )

    now_iso = datetime.utcnow().isoformat() + "Z"
    new_id = f"batch-{int(datetime.utcnow().timestamp())}-{uuid.uuid4().hex[:6]}"

    # Initial verification with empty docs
    v_status, mb, risk, mat, findings = run_verification(batch_in, [])

    new_batch = BatchResponse(
        id=new_id,
        batch_number=batch_in.batch_number,
        category=batch_in.category,
        claimed_quantity=batch_in.claimed_quantity,
        unit=batch_in.unit,
        recycler_name=batch_in.recycler_name,
        recycler_registration_id=batch_in.recycler_registration_id,
        collection_date=batch_in.collection_date,
        processing_date=batch_in.processing_date,
        origin_location=batch_in.origin_location,
        destination_location=batch_in.destination_location,
        status=v_status,
        mass_balance=mb,
        risk_score=risk,
        material_estimate=mat,
        documents=[],
        findings=findings,
        notes=batch_in.notes,
        created_at=now_iso,
        updated_at=now_iso,
    )

    return repo.create_batch(new_batch)

@router.get("/batches", response_model=List[BatchResponse])
def list_batches(
    category: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    risk_level: Optional[str] = Query(None),
):
    return repo.list_batches(category=category, status=status, risk_level=risk_level)

@router.get("/batches/{id}", response_model=BatchResponse)
def get_batch(id: str):
    batch = repo.get_batch(id)
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch '{id}' not found.")
    return batch

@router.patch("/batches/{id}", response_model=BatchResponse)
def patch_batch(id: str, batch_update: BatchUpdate, request: Request):
    _require_auth_if_configured(request)
    batch = repo.get_batch(id)
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch '{id}' not found.")

    update_dict = batch_update.model_dump(exclude_unset=True)
    if not update_dict:
        return batch

    for key, val in update_dict.items():
        if val is not None:
            setattr(batch, key, val)

    now_iso = datetime.utcnow().isoformat() + "Z"
    batch.updated_at = now_iso

    batch.timeline.append(
        BatchTimelineEvent(
            id=_event_id(),
            timestamp=now_iso,
            actor="Enterprise Operations",
            action="Batch Consignment Attributes Updated",
            note=f"Modified fields: {', '.join(update_dict.keys())}",
            severity=Severity.INFO,
        )
    )

    verification_fields = {
        "claimed_quantity", "unit", "collection_date", "processing_date",
        "recycler_name", "recycler_registration_id",
    }
    if verification_fields & set(update_dict.keys()):
        reverify_batch(batch, note_actor="Deterministic Verification Engine", reason="Batch attributes changed")

    repo.update_batch(batch.id, batch)
    return batch

@router.get("/batches/{id}/history", response_model=List[BatchTimelineEvent])
def get_batch_history(id: str):
    batch = repo.get_batch(id)
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch '{id}' not found.")
    return batch.timeline

@router.post("/batches/{id}/documents", response_model=EvidenceDocument, status_code=201)
def add_document(id: str, doc_in: EvidenceDocument, request: Request):
    _require_auth_if_configured(request)
    batch = repo.get_batch(id)
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch '{id}' not found.")
    if any(d.id == doc_in.id for d in batch.documents):
        raise HTTPException(status_code=409, detail=f"Document '{doc_in.id}' is already attached to this batch.")
    doc_in.batch_id = batch.id
    saved_doc = repo.add_document(batch.id, doc_in)
    return saved_doc

@router.get("/batches/{id}/documents", response_model=List[EvidenceDocument])
def list_documents(id: str):
    batch = repo.get_batch(id)
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch '{id}' not found.")
    return batch.documents

@router.get("/documents/{id}", response_model=EvidenceDocument)
def get_document_by_id(id: str):
    batches = repo.list_batches()
    for b in batches:
        for doc in b.documents:
            if doc.id == id:
                return doc
    raise HTTPException(status_code=404, detail=f"Evidence document '{id}' not found.")

@router.post("/documents/{id}/extract", response_model=EvidenceDocument)
def extract_document_by_id(id: str):
    batches = repo.list_batches()
    target_batch = None
    target_doc = None
    for b in batches:
        for doc in b.documents:
            if doc.id == id:
                target_batch = b
                target_doc = doc
                break
        if target_doc:
            break

    if not target_doc or not target_batch:
        raise HTTPException(status_code=404, detail=f"Document '{id}' not found.")

    if any(f.is_corrected for f in target_doc.extracted_fields):
        raise HTTPException(
            status_code=409,
            detail="This document contains audited field corrections; re-extraction would overwrite them.",
        )

    from app.extraction import factory as extraction_factory
    if extraction_factory.storage_extraction_enabled():
        if not target_doc.storage_key:
            raise HTTPException(status_code=409, detail="This document has no uploaded file in evidence storage, so it cannot be read by the OCR service.")
        try:
            extracted = extraction_factory.extract_from_storage(
                bucket=evidence_storage.bucket_name() or "",
                key=target_doc.storage_key,
                file_name=target_doc.file_name,
                document_type=target_doc.document_type,
                batch_id=target_batch.id,
                doc_id=target_doc.id,
            )
        except Exception as exc:
            target_doc.status = "failed"
            repo.update_batch(target_batch.id, target_batch)
            raise HTTPException(status_code=502, detail=str(exc))
    else:
        extracted = demo_extractor.extract_document(
            file_name=target_doc.file_name,
            document_type=target_doc.document_type,
            batch_id=target_batch.id,
        )
    # Keep manual-entry fallbacks that OCR did not produce; OCR values win on conflicts.
    produced = {f.field_name for f in extracted.extracted_fields}
    kept = [f for f in target_doc.extracted_fields if f.extraction_source == "manual_entry" and f.field_name not in produced]
    target_doc.extracted_fields = extracted.extracted_fields + kept
    target_doc.extracted_text_snippet = extracted.extracted_text_snippet
    target_doc.status = "extracted"

    now_iso = datetime.utcnow().isoformat() + "Z"
    target_batch.timeline.append(
        BatchTimelineEvent(
            id=_event_id(),
            timestamp=now_iso,
            actor="Document AI Extraction Service",
            action=f"Document Processed: {target_doc.file_name}",
            note=f"Extracted {len(extracted.extracted_fields)} structured attributes.",
            severity=Severity.INFO,
        )
    )
    reverify_batch(target_batch, note_actor="Document AI Extraction Service", reason=f"Re-verified after extraction of '{target_doc.file_name}'")
    repo.update_batch(target_batch.id, target_batch)
    return target_doc

@router.patch("/documents/{id}/fields", response_model=EvidenceDocument)
def correct_document_field(id: str, req: FieldCorrectionRequest, request: Request):
    verified = _require_auth_if_configured(request)
    if verified:
        req.auditor_id = verified
    batches = repo.list_batches()
    target_batch = None
    target_doc = None
    target_field = None
    for b in batches:
        for doc in b.documents:
            if doc.id == id:
                for f in doc.extracted_fields:
                    if f.id == req.field_id:
                        target_batch = b
                        target_doc = doc
                        target_field = f
                        break
                if target_doc:
                    break
        if target_doc:
            break

    if not target_doc or not target_field or not target_batch:
        raise HTTPException(
            status_code=404,
            detail=f"Document '{id}' or field '{req.field_id}' not found."
        )

    old_val = target_field.value
    now_iso = datetime.utcnow().isoformat() + "Z"
    if not target_field.is_corrected:
        target_field.original_value = old_val
    target_field.value = req.corrected_value
    target_field.confidence = 1.0
    target_field.is_corrected = True
    target_field.corrected_at = now_iso
    target_field.corrected_by = req.auditor_id
    target_field.correction_reason = req.reason

    passport_note = ""
    if target_batch.passport is not None:
        passport_note = f" Passport {target_batch.passport.passport_id} was issued before this correction and has not been re-issued."

    target_batch.timeline.append(
        BatchTimelineEvent(
            id=_event_id(),
            timestamp=now_iso,
            actor=(f"{req.auditor_id} (authenticated)" if verified else f"Auditor label '{req.auditor_id}' (client-supplied, unauthenticated)"),
            action=f"Field Value Corrected: {target_field.label}",
            note=f"Updated from '{old_val}' to '{req.corrected_value}'. Justification: {req.reason}.{passport_note}",
            severity=Severity.INFO,
        )
    )

    reverify_batch(target_batch, note_actor="Deterministic Verification Engine", reason=f"Re-verified after correction of '{target_field.label}'")

    repo.update_batch(target_batch.id, target_batch)
    return target_doc

@router.post("/batches/{id}/verify", response_model=VerificationReportResponse)
def verify_batch(id: str, request: Request):
    _require_auth_if_configured(request)
    batch = repo.get_batch(id)
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch '{id}' not found.")

    v_status = reverify_batch(batch, reason="Verification requested")
    mb, risk, mat, findings = batch.mass_balance, batch.risk_score, batch.material_estimate, batch.findings
    repo.update_batch(batch.id, batch)

    return VerificationReportResponse(
        batch_id=batch.id,
        batch_number=batch.batch_number,
        status=batch.status,
        mass_balance=mb,
        risk_score=risk,
        findings_count=len(findings),
        findings=findings,
        is_eligible_for_passport=(batch.status == VerificationStatus.SUPPORTED),
        material_estimate=mat,
        generated_at=datetime.utcnow().isoformat() + "Z",
    )

@router.get("/batches/{id}/findings", response_model=List[VerificationFinding])
def get_findings(id: str):
    batch = repo.get_batch(id)
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch '{id}' not found.")
    return batch.findings

@router.get("/batches/{id}/report", response_model=VerificationReportResponse)
def get_verification_report(id: str):
    batch = repo.get_batch(id)
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch '{id}' not found.")
    return VerificationReportResponse(
        batch_id=batch.id,
        batch_number=batch.batch_number,
        status=batch.status,
        mass_balance=batch.mass_balance,
        risk_score=batch.risk_score,
        findings_count=len(batch.findings),
        findings=batch.findings,
        is_eligible_for_passport=(batch.status == VerificationStatus.SUPPORTED),
        material_estimate=batch.material_estimate,
        generated_at=datetime.utcnow().isoformat() + "Z",
    )

@router.post("/batches/{id}/estimate", response_model=MaterialEstimate)
def estimate_batch_material(id: str, request: Request):
    _require_auth_if_configured(request)
    batch = repo.get_batch(id)
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch '{id}' not found.")

    supported_mass = batch.mass_balance.evidence_supported_kg if batch.mass_balance else None
    mat = estimate_material_value(batch.category, supported_mass)
    batch.material_estimate = mat

    now_iso = datetime.utcnow().isoformat() + "Z"
    batch.timeline.append(
        BatchTimelineEvent(
            id=_event_id(),
            timestamp=now_iso,
            actor="Value Intelligence Engine",
            action="Material Valuation Computed",
            note=(
                f"Net estimated recovery: ${mat.net_estimated_recovery_value_usd:,.2f} ({mat.recommended_pathway.value})"
                if mat.is_available
                else "Estimate unavailable: no evidence-supported quantity recorded."
            ),
            severity=Severity.INFO,
        )
    )
    repo.update_batch(batch.id, batch)
    return mat

@router.get("/batches/{id}/estimate", response_model=MaterialEstimate)
def get_batch_estimate(id: str):
    batch = repo.get_batch(id)
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch '{id}' not found.")
    return batch.material_estimate

@router.post("/batches/{id}/passport", response_model=CircularityPassport)
def issue_passport(id: str, request: Request):
    _require_auth_if_configured(request)
    batch = repo.get_batch(id)
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch '{id}' not found.")

    if batch.passport:
        if batch.passport.revoked:
            raise HTTPException(
                status_code=409,
                detail=f"Passport '{batch.passport.passport_id}' for this batch was revoked; re-issuance is not supported.",
            )
        return batch.passport

    success, msg, passport = create_circularity_passport(batch)
    if not success:
        raise HTTPException(status_code=400, detail=msg)

    batch.passport = passport
    batch.timeline.append(
        BatchTimelineEvent(
            id=_event_id(),
            timestamp=datetime.utcnow().isoformat() + "Z",
            actor="Passport Authority Service",
            action="Circularity Passport Issued",
            note=f"Issued {passport.passport_id} (SHA-256 {passport.sha256_hash[:12]}...). Signature state: {passport.signature_status}.",
            severity=Severity.INFO,
        )
    )
    repo.update_batch(batch.id, batch)
    repo.save_passport(passport)
    return passport

class AuditDecisionRequest(BaseModel):
    decision: VerificationStatus
    reason: str
    # Client-supplied label; the API has no authentication so this identity is NOT verified.
    auditor_id: str = "AUDITOR-EU-COMPLIANCE-01"

@router.post("/batches/{id}/decision", response_model=BatchResponse)
def record_audit_decision(id: str, req: AuditDecisionRequest, request: Request):
    verified = _require_auth_if_configured(request)
    if verified:
        req.auditor_id = verified
    batch = repo.get_batch(id)
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch '{id}' not found.")

    if req.decision not in (
        VerificationStatus.SUPPORTED, VerificationStatus.REVIEW_REQUIRED, VerificationStatus.REJECTED
    ):
        raise HTTPException(
            status_code=422,
            detail="An audit decision must be SUPPORTED, REVIEW_REQUIRED or REJECTED. Passport revocation is a separate action.",
        )
    if not req.reason or not req.reason.strip():
        raise HTTPException(status_code=422, detail="A decision justification is required.")

    now_iso = datetime.utcnow().isoformat() + "Z"
    batch.status = req.decision
    from app.schemas.batch import AuditorDecision
    batch.auditor_decision = AuditorDecision(
        decision=req.decision,
        auditor_id=req.auditor_id,
        reason=req.reason,
        timestamp=now_iso,
    )
    if req.decision == VerificationStatus.REJECTED:
        batch.explicit_rejection_reason = req.reason
    else:
        batch.explicit_rejection_reason = None

    batch.timeline.append(
        BatchTimelineEvent(
            id=_event_id(),
            timestamp=now_iso,
            actor=(f"{req.auditor_id} (authenticated)" if verified else f"Auditor label '{req.auditor_id}' (client-supplied, unauthenticated)"),
            action=f"Official Audit Decision: {req.decision.value}",
            note=req.reason,
            severity=Severity.CRITICAL if req.decision == VerificationStatus.REJECTED else Severity.INFO,
        )
    )
    repo.update_batch(batch.id, batch)
    return batch

@router.post("/reset")
def reset_database(request: Request):
    _require_auth_if_configured(request)
    repo.reset_db()
    return {"status": "success", "message": "Demo database reset to default authoritative scenarios."}

@router.get("/passports/{id}", response_model=CircularityPassport)
def get_passport(id: str):
    passport = repo.get_passport(id)
    if not passport:
        raise HTTPException(status_code=404, detail=f"Passport '{id}' not found.")
    return passport

@router.get("/passports/{id}/versions", response_model=List[PassportVersionItem])
def get_passport_versions(id: str):
    passport = repo.get_passport(id)
    if not passport:
        raise HTTPException(status_code=404, detail=f"Passport '{id}' not found.")
    return [
        PassportVersionItem(
            version=passport.version,
            passport_id=passport.passport_id,
            batch_number=passport.batch_number,
            issue_timestamp=passport.issue_timestamp,
            sha256_hash=passport.sha256_hash,
            integrity_status=passport.integrity_status,
            signature_status=passport.signature_status,
            revoked=passport.revoked,
            revocation_reason=passport.revocation_reason if passport.revoked else None,
        )
    ]

@router.post("/passports/{id}/revoke")
def revoke_passport_endpoint(id: str, req: PassportRevocationRequest, request: Request):
    verified = _require_auth_if_configured(request)
    try:
        ok = repo.revoke_passport(id, req.reason)
    except ValueError:
        raise HTTPException(status_code=409, detail=f"Passport '{id}' is already revoked.")
    if not ok:
        raise HTTPException(status_code=404, detail=f"Passport '{id}' not found.")

    passport = repo.get_passport(id)
    batch = repo.get_batch(passport.batch_id) if passport else None
    if batch:
        batch.timeline.append(
            BatchTimelineEvent(
                id=_event_id(),
                timestamp=datetime.utcnow().isoformat() + "Z",
                actor=(f"{verified} (authenticated)" if verified else "Passport Authority Service (unauthenticated request)"),
                action="Circularity Passport Revoked",
                note=f"Passport {id} revoked. Reason: {req.reason}. Documentary verification status unchanged ({batch.status.value}).",
                severity=Severity.CRITICAL,
            )
        )
        repo.update_batch(batch.id, batch)
    return {
        "status": "revoked",
        "passport_id": id,
        "reason": req.reason,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "documentary_status_unchanged": batch.status.value if batch else None,
    }

def _signature_state(passport) -> dict:
    """
    Independent assessment of issuer signature authenticity.
    SIMULATED means a deterministic local stand-in produced the value; it is NOT an issuer
    signature and must never be presented as valid.
    """
    status = passport.signature_status
    if status == "VALID_AWS_KMS_SIGNATURE" and passport.digital_signature_base64:
        check = kms_signer.verify_signature(passport.sha256_hash, passport.digital_signature_base64, passport.kms_key_arn)
        return {
            "status": "VALID" if check.get("valid") else "INVALID",
            "provider": check.get("provider", "AWS_KMS_LIVE"),
            "algorithm": passport.kms_signature_algorithm,
            "detail": check.get("error"),
        }
    if status == "DEMO_SIMULATED_KMS_SIGNATURE":
        return {
            "status": "SIMULATED",
            "provider": "DEMO_SIMULATED_KMS",
            "algorithm": passport.kms_signature_algorithm,
            "detail": "A deterministic local stand-in produced this value. It does not establish issuer identity.",
        }
    return {"status": "NOT_CONFIGURED", "provider": None, "algorithm": None, "detail": "No issuer signature was produced for this passport."}


@router.get("/verify/{id}")
def public_verify(id: str):
    """
    Public QR Verification Endpoint.
    Returns explicitly approved public-safe fields and four independent pillars:
    payload integrity (hash recomputed from stored passport fields), issuer signature state,
    documentary verification status, and passport lifecycle state.
    The legacy `integrity_status` key is kept for backward compatibility and conflates
    integrity with revocation; clients should read `payload_integrity` and `lifecycle_status`.
    """
    passport = repo.get_passport(id)
    if not passport:
        return {
            "passport_id": id,
            "verification_status": "NOT_FOUND",
            "integrity_status": "UNKNOWN",
            "revoked": False,
            "message": "No authoritative record matches this passport identifier.",
        }

    recomputed = recompute_passport_hash(passport)
    integrity_valid = recomputed == passport.sha256_hash
    batch = repo.get_batch(passport.batch_id)

    return {
        "passport_id": passport.passport_id,
        "version": passport.version,
        "batch_number": passport.batch_number,
        "category": passport.category.value,
        "recycler_name": passport.recycler_name,
        "evidence_supported_kg": passport.evidence_supported_kg,
        "estimated_value_usd": passport.estimated_value_usd,
        "recovery_rate_percent": passport.recovery_rate_percent,
        "sha256_hash": passport.sha256_hash,
        "verification_status": "FOUND",
        "payload_integrity": {
            "status": "VALID" if integrity_valid else "INVALID",
            "stored_sha256": passport.sha256_hash,
            "recomputed_sha256": recomputed,
        },
        "signature": _signature_state(passport),
        "documentary_status": batch.status.value if batch else None,
        "lifecycle_status": "REVOKED" if passport.revoked else "ACTIVE",
        "checked_at": datetime.utcnow().isoformat() + "Z",
        # Legacy field (see docstring).
        "integrity_status": ("REVOKED" if passport.revoked else ("VALID" if integrity_valid else "INVALID")),
        "signature_status": passport.signature_status,
        "kms_key_arn": passport.kms_key_arn,
        "kms_signature_algorithm": passport.kms_signature_algorithm,
        "digital_signature_base64": passport.digital_signature_base64,
        "revoked": passport.revoked,
        "revocation_reason": passport.revocation_reason if passport.revoked else None,
        "revoked_at": passport.revoked_at,
        "issued_at": passport.issue_timestamp,
        "public_attributes": passport.public_attributes,
        "cryptographic_guarantees": {
            "payload_integrity": "The SHA-256 hash is recomputed from the stored passport fields (RFC 8785-style canonical JSON) and compared with the hash recorded at issuance. A match shows the stored fields were not modified; it does not identify the issuer or prove physical recycling.",
            "issuer_authenticity": "Issuer authenticity is established only by a valid asymmetric signature from a configured key service. A simulated or missing signature establishes nothing about the issuer.",
            "physical_reality_notice": "Documentary and ledger integrity checks do not replace independent on-site physical auditing."
        },
        "disclaimer": passport.hash_scope_disclaimer,
    }


@router.post("/verify/{id}/tamper-demo")
def tamper_demo(id: str):
    """
    Demonstration only. Copies the passport payload in memory, alters one field, recomputes
    the hash and reports that it no longer matches. Nothing is written to storage; the
    issued passport is untouched and remains verifiable.
    """
    passport = repo.get_passport(id)
    if not passport:
        raise HTTPException(status_code=404, detail=f"Passport '{id}' not found.")
    from app.passports.canonical import passport_canonical_payload, serialize_canonical_passport, compute_passport_sha256
    payload = dict(passport_canonical_payload(passport))
    payload["evidence_supported_kg"] = float(payload["evidence_supported_kg"]) + 1.0
    altered_hash = compute_passport_sha256(serialize_canonical_passport(payload))
    return {
        "demonstration": True,
        "altered_field": "evidence_supported_kg",
        "original_value": passport.evidence_supported_kg,
        "altered_value": payload["evidence_supported_kg"],
        "stored_sha256": passport.sha256_hash,
        "altered_payload_sha256": altered_hash,
        "integrity_check": "INVALID" if altered_hash != passport.sha256_hash else "VALID",
        "persisted": False,
    }

class UploadUrlRequest(BaseModel):
    file_name: str
    size: int
    document_type: Optional[str] = None


@router.post("/batches/{id}/documents/upload-url")
def create_evidence_upload(id: str, req: UploadUrlRequest, request: Request):
    """Presigned S3 POST for a private evidence upload (type- and size-restricted)."""
    _require_auth_if_configured(request)
    batch = repo.get_batch(id)
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch '{id}' not found.")
    doc_id = f"doc-{uuid.uuid4().hex[:10]}"
    try:
        upload = evidence_storage.create_upload(batch.id, doc_id, req.file_name, req.size)
    except evidence_storage.EvidenceStorageError as exc:
        raise HTTPException(status_code=503 if not evidence_storage.storage_enabled() else 422, detail=str(exc))
    return {"doc_id": doc_id, **upload}


@router.get("/documents/{id}/content-url")
def get_evidence_content_url(id: str, request: Request):
    """Short-lived presigned GET so the UI can show the original uploaded file."""
    _require_auth_if_configured(request)
    for b in repo.list_batches():
        for doc in b.documents:
            if doc.id == id:
                if not doc.storage_key:
                    raise HTTPException(status_code=404, detail="This document has no stored file.")
                try:
                    return {"url": evidence_storage.create_download_url(doc.storage_key), "expires_in": evidence_storage.URL_TTL_SECONDS}
                except evidence_storage.EvidenceStorageError as exc:
                    raise HTTPException(status_code=503, detail=str(exc))
    raise HTTPException(status_code=404, detail=f"Evidence document '{id}' not found.")


@router.post("/batches/{id}/workflow", status_code=202)
def start_verification_workflow(id: str, request: Request):
    """Start the AWS Step Functions verification pipeline for a batch (Textract -> rules -> sign or notify)."""
    _require_auth_if_configured(request)
    arn = os.getenv("STATE_MACHINE_ARN")
    if not arn:
        raise HTTPException(status_code=503, detail="The AWS Step Functions workflow is not configured (STATE_MACHINE_ARN is unset).")
    batch = repo.get_batch(id)
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch '{id}' not found.")
    import boto3
    import json as _json

    try:
        res = boto3.client("stepfunctions").start_execution(
            stateMachineArn=arn,
            name=f"{batch.id}-{uuid.uuid4().hex[:8]}"[:80],
            input=_json.dumps({"batch_id": batch.id}),
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not start the workflow: {exc}")
    return {"execution_arn": res["executionArn"], "status": "RUNNING"}


@router.get("/workflow/status")
def workflow_status(execution_arn: str):
    arn = os.getenv("STATE_MACHINE_ARN")
    if not arn:
        raise HTTPException(status_code=503, detail="The AWS Step Functions workflow is not configured.")
    if not execution_arn.startswith(arn.replace(":stateMachine:", ":execution:") + ":"):
        raise HTTPException(status_code=422, detail="Execution does not belong to this workflow.")
    import boto3

    try:
        d = boto3.client("stepfunctions").describe_execution(executionArn=execution_arn)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not read the execution: {exc}")
    return {"status": d["status"], "started": d["startDate"].isoformat(), "stopped": d["stopDate"].isoformat() if d.get("stopDate") else None}


@router.get("/integrations")
def integrations_status():
    """Truthful runtime status of every integration, for the Settings page."""
    from app.passports.canonical import kms_signer as signer
    repo_kind = type(repo).__name__
    return {
        "environment": os.getenv("STAGE", "local"),
        "region": os.getenv("AWS_REGION", os.getenv("AWS_DEFAULT_REGION")),
        "repository": {"provider": "dynamodb" if repo_kind.startswith("Dynamo") else "sqlite", "live_aws": repo_kind.startswith("Dynamo")},
        "signing": {"provider": "aws-kms" if signer.is_live_kms_active else "simulated", "live_aws": bool(signer.is_live_kms_active)},
        "extraction": __import__("app.extraction.factory", fromlist=["provider_summary"]).provider_summary(),
        "ai": {"provider": "amazon-bedrock" if investigator_agent.use_bedrock else "deterministic-rules", "model": investigator_agent.model_id if investigator_agent.use_bedrock else None, "live_aws": bool(investigator_agent.use_bedrock)},
        "evidence_storage": {"provider": "amazon-s3" if evidence_storage.storage_enabled() else "none", "live_aws": evidence_storage.storage_enabled()},
        "orchestration": {"provider": "aws-step-functions" if os.getenv("STATE_MACHINE_ARN") else "none", "live_aws": bool(os.getenv("STATE_MACHINE_ARN"))},
        "authentication": {"provider": "amazon-cognito" if os.getenv("REQUIRE_AUTH", "").lower() == "true" else "none", "live_aws": os.getenv("REQUIRE_AUTH", "").lower() == "true", "required": os.getenv("REQUIRE_AUTH", "").lower() == "true"},
    }


from app.extraction.demo import DemoExtractionProvider
from app.investigation.agent import InvestigatorAgent, InvestigationReport
from app.investigation.multimodal import MultimodalPhotoAnalyzer, VisualInspectionResult
from app.schemas.batch import DocumentType, EwasteCategory

demo_extractor = DemoExtractionProvider()
investigator_agent = InvestigatorAgent()
photo_analyzer = MultimodalPhotoAnalyzer()

class DocumentExtractionRequest(BaseModel):
    file_name: str
    document_type: Optional[DocumentType] = None
    batch_id: Optional[str] = None

class PhotoAnalysisRequest(BaseModel):
    file_name: str
    claimed_category: EwasteCategory

@router.post("/extract", response_model=EvidenceDocument)
def extract_document_endpoint(req: DocumentExtractionRequest):
    """
    Document AI Extraction Endpoint (Amazon Textract simulated/live).
    Extracts structured fields, confidence metrics, and spatial bounding boxes.
    """
    return demo_extractor.extract_document(
        file_name=req.file_name,
        document_type=req.document_type,
        batch_id=req.batch_id,
    )

@router.get("/batches/{id}/investigation", response_model=InvestigationReport)
def get_investigation_report(id: str):
    """
    AI Investigator Agent Endpoint (Amazon Bedrock / Strands Agents).
    Produces grounded citations, auditor questions, and an explainable narrative.
    """
    batch = repo.get_batch(id)
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch '{id}' not found.")
    try:
        return investigator_agent.investigate(batch)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

@router.post("/analyze-photo", response_model=VisualInspectionResult)
def analyze_scrap_photo_endpoint(req: PhotoAnalysisRequest):
    """
    Multimodal Photo Analysis Endpoint.
    Detects visual stream mismatches, hazardous contamination (e.g. lithium batteries),
    and uncontained yard storage violations.
    """
    return photo_analyzer.analyze_photo(
        file_name=req.file_name,
        claimed_category=req.claimed_category,
    )
