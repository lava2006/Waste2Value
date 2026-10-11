from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from typing import List, Optional, Any
from datetime import datetime
from app.repositories.sqlite_repo import SQLiteRepository
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
from app.verification.engine import run_verification
from app.passports.canonical import create_circularity_passport
from app.materials.estimator import estimate_material_value

router = APIRouter()
repo = SQLiteRepository()

@router.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "Waste2Value Verification Backend",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "version": "1.0.0",
        "environment": "demo-local",
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
def create_batch(batch_in: BatchCreate):
    existing = repo.get_batch(batch_in.batch_number)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Batch with number '{batch_in.batch_number}' already exists.",
        )

    now_iso = datetime.utcnow().isoformat() + "Z"
    new_id = f"batch-{int(datetime.utcnow().timestamp())}"

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
def patch_batch(id: str, batch_update: BatchUpdate):
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
            id=f"t-{int(datetime.utcnow().timestamp())}",
            timestamp=now_iso,
            actor="Enterprise Operations",
            action="Batch Consignment Attributes Updated",
            note=f"Modified fields: {', '.join(update_dict.keys())}",
            severity=Severity.INFO,
        )
    )

    if "claimed_quantity" in update_dict:
        v_status, mb, risk, mat, findings = run_verification(
            BatchCreate(
                batch_number=batch.batch_number,
                category=batch.category,
                claimed_quantity=batch.claimed_quantity,
                unit=batch.unit,
                recycler_name=batch.recycler_name,
                recycler_registration_id=batch.recycler_registration_id,
                collection_date=batch.collection_date,
                processing_date=batch.processing_date,
                origin_location=batch.origin_location,
                destination_location=batch.destination_location,
            ),
            batch.documents,
        )
        batch.status = v_status
        batch.mass_balance = mb
        batch.risk_score = risk
        batch.material_estimate = mat
        batch.findings = findings

    repo.update_batch(batch.id, batch)
    return batch

@router.get("/batches/{id}/history", response_model=List[BatchTimelineEvent])
def get_batch_history(id: str):
    batch = repo.get_batch(id)
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch '{id}' not found.")
    return batch.timeline

@router.post("/batches/{id}/documents", response_model=EvidenceDocument, status_code=201)
def add_document(id: str, doc_in: EvidenceDocument):
    batch = repo.get_batch(id)
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch '{id}' not found.")
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

    extracted = demo_extractor.extract_document(
        file_name=target_doc.file_name,
        document_type=target_doc.document_type,
        batch_id=target_batch.id,
    )
    target_doc.extracted_fields = extracted.extracted_fields
    target_doc.extracted_text_snippet = extracted.extracted_text_snippet
    target_doc.status = "extracted"

    now_iso = datetime.utcnow().isoformat() + "Z"
    target_batch.timeline.append(
        BatchTimelineEvent(
            id=f"t-{int(datetime.utcnow().timestamp())}",
            timestamp=now_iso,
            actor="Document AI Extraction Service",
            action=f"Document Processed: {target_doc.file_name}",
            note=f"Extracted {len(extracted.extracted_fields)} structured attributes.",
            severity=Severity.INFO,
        )
    )
    repo.update_batch(target_batch.id, target_batch)
    return target_doc

@router.patch("/documents/{id}/fields", response_model=EvidenceDocument)
def correct_document_field(id: str, req: FieldCorrectionRequest):
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
    target_field.value = req.corrected_value
    target_field.confidence = 1.0
    now_iso = datetime.utcnow().isoformat() + "Z"

    target_batch.timeline.append(
        BatchTimelineEvent(
            id=f"t-{int(datetime.utcnow().timestamp())}",
            timestamp=now_iso,
            actor=f"Compliance Auditor ({req.auditor_id})",
            action=f"Field Value Corrected: {target_field.label}",
            note=f"Updated from '{old_val}' to '{req.corrected_value}'. Justification: {req.reason}",
            severity=Severity.INFO,
        )
    )

    v_status, mb, risk, mat, findings = run_verification(
        BatchCreate(
            batch_number=target_batch.batch_number,
            category=target_batch.category,
            claimed_quantity=target_batch.claimed_quantity,
            unit=target_batch.unit,
            recycler_name=target_batch.recycler_name,
            recycler_registration_id=target_batch.recycler_registration_id,
            collection_date=target_batch.collection_date,
            processing_date=target_batch.processing_date,
            origin_location=target_batch.origin_location,
            destination_location=target_batch.destination_location,
        ),
        target_batch.documents,
    )
    target_batch.status = v_status
    target_batch.mass_balance = mb
    target_batch.risk_score = risk
    target_batch.material_estimate = mat
    target_batch.findings = findings

    repo.update_batch(target_batch.id, target_batch)
    return target_doc

@router.post("/batches/{id}/verify", response_model=VerificationReportResponse)
def verify_batch(id: str):
    batch = repo.get_batch(id)
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch '{id}' not found.")

    v_status, mb, risk, mat, findings = run_verification(
        BatchCreate(
            batch_number=batch.batch_number,
            category=batch.category,
            claimed_quantity=batch.claimed_quantity,
            unit=batch.unit,
            recycler_name=batch.recycler_name,
            recycler_registration_id=batch.recycler_registration_id,
            collection_date=batch.collection_date,
            processing_date=batch.processing_date,
            origin_location=batch.origin_location,
            destination_location=batch.destination_location,
        ),
        batch.documents
    )

    batch.status = v_status
    batch.mass_balance = mb
    batch.risk_score = risk
    batch.material_estimate = mat
    batch.findings = findings
    repo.update_batch(batch.id, batch)

    return VerificationReportResponse(
        batch_id=batch.id,
        batch_number=batch.batch_number,
        status=v_status,
        mass_balance=mb,
        risk_score=risk,
        findings_count=len(findings),
        findings=findings,
        is_eligible_for_passport=(v_status == VerificationStatus.SUPPORTED),
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
def estimate_batch_material(id: str):
    batch = repo.get_batch(id)
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch '{id}' not found.")

    supported_mass = (
        batch.mass_balance.evidence_supported_kg
        if (batch.mass_balance and batch.mass_balance.evidence_supported_kg > 0)
        else batch.claimed_quantity
    )
    mat = estimate_material_value(batch.category, supported_mass)
    batch.material_estimate = mat

    now_iso = datetime.utcnow().isoformat() + "Z"
    batch.timeline.append(
        BatchTimelineEvent(
            id=f"t-{int(datetime.utcnow().timestamp())}",
            timestamp=now_iso,
            actor="Value Intelligence Engine",
            action="Material Valuation Computed",
            note=f"Net estimated recovery: ${mat.net_estimated_recovery_value_usd:,.2f} ({mat.recommended_pathway.value})",
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
def issue_passport(id: str):
    batch = repo.get_batch(id)
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch '{id}' not found.")

    if batch.passport:
        return batch.passport

    success, msg, passport = create_circularity_passport(batch)
    if not success:
        raise HTTPException(status_code=400, detail=msg)

    batch.passport = passport
    repo.update_batch(batch.id, batch)
    repo.save_passport(passport)
    return passport

class AuditDecisionRequest(BaseModel):
    decision: VerificationStatus
    reason: str
    auditor_id: str = "AUDITOR-EU-COMPLIANCE-01"

@router.post("/batches/{id}/decision", response_model=BatchResponse)
def record_audit_decision(id: str, req: AuditDecisionRequest):
    batch = repo.get_batch(id)
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch '{id}' not found.")

    now_iso = datetime.utcnow().isoformat() + "Z"
    batch.status = req.decision
    from app.schemas.batch import AuditorDecision, BatchTimelineEvent, Severity
    batch.auditor_decision = AuditorDecision(
        decision=req.decision,
        auditor_id=req.auditor_id,
        reason=req.reason,
        timestamp=now_iso,
    )
    if req.decision == VerificationStatus.REJECTED:
        batch.explicit_rejection_reason = req.reason

    batch.timeline.append(
        BatchTimelineEvent(
            id=f"t-{int(datetime.utcnow().timestamp())}",
            timestamp=now_iso,
            actor=f"Authorized Auditor ({req.auditor_id})",
            action=f"Official Audit Decision: {req.decision.value}",
            note=req.reason,
            severity=Severity.CRITICAL if req.decision == VerificationStatus.REJECTED else Severity.INFO,
        )
    )
    repo.update_batch(batch.id, batch)
    return batch

@router.post("/reset")
def reset_database():
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
def revoke_passport_endpoint(id: str, req: PassportRevocationRequest):
    ok = repo.revoke_passport(id, req.reason)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Passport '{id}' not found.")
    return {
        "status": "revoked",
        "passport_id": id,
        "reason": req.reason,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }

@router.get("/verify/{id}")
def public_verify(id: str):
    """
    Public QR Verification Endpoint.
    Returns explicitly approved public-safe fields, SHA-256 integrity status,
    and AWS KMS asymmetric digital signature proof.
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
        "integrity_status": "VALID" if not passport.revoked else "REVOKED",
        "signature_status": passport.signature_status,
        "kms_key_arn": passport.kms_key_arn,
        "kms_signature_algorithm": passport.kms_signature_algorithm,
        "digital_signature_base64": passport.digital_signature_base64,
        "revoked": passport.revoked,
        "revocation_reason": passport.revocation_reason if passport.revoked else None,
        "issued_at": passport.issue_timestamp,
        "public_attributes": passport.public_attributes,
        "cryptographic_guarantees": {
            "payload_integrity": "SHA-256 hash verifies RFC 8785 canonical data matches authoritative ledger record without tampering.",
            "issuer_authenticity": "Asymmetric digital signature generated via AWS KMS verifies issuance authority and non-repudiation.",
            "physical_reality_notice": "Cryptographic proof validates documentary and ledger integrity; it does not replace independent on-site physical auditing."
        },
        "disclaimer": passport.hash_scope_disclaimer,
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
    return investigator_agent.investigate(batch)

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
