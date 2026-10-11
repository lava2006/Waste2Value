"""
Step Functions task handler. The state machine (template.yaml) calls this Lambda for each step:

  ExtractEvidence -> EvaluateRules -> Choice(status) -> IssuePassport | NotifyAuditor

Every step reads/writes the same repository the API uses and appends a timeline event, so the
batch page shows exactly what the workflow did. No step fabricates results: failures raise and
the state machine records the execution as FAILED.
"""
import os
import uuid
from datetime import datetime
from typing import Any, Dict

from app.schemas.batch import BatchTimelineEvent, Severity, VerificationStatus
from app.verification.engine import reverify_batch


def _event(batch, actor: str, action: str, note: str, severity: Severity = Severity.INFO) -> None:
    batch.timeline.append(
        BatchTimelineEvent(
            id=f"t-{uuid.uuid4().hex[:10]}",
            timestamp=datetime.utcnow().isoformat() + "Z",
            actor=actor,
            action=action,
            note=note,
            severity=severity,
        )
    )


def _repo():
    from app.api.routes import repo

    return repo


def extract_evidence(batch_id: str) -> Dict[str, Any]:
    from app.extraction.factory import extract_from_storage
    from app.storage import evidence as storage

    repo = _repo()
    batch = repo.get_batch(batch_id)
    if not batch:
        raise ValueError(f"Batch '{batch_id}' not found")
    extracted = 0
    skipped = 0
    for doc in batch.documents:
        if not doc.storage_key or any(f.extraction_source in ("textract", "rekognition", "nova_vision") for f in doc.extracted_fields):
            skipped += 1
            continue
        result = extract_from_storage(
            bucket=storage.bucket_name() or "",
            key=doc.storage_key,
            file_name=doc.file_name,
            document_type=doc.document_type,
            batch_id=batch.id,
            doc_id=doc.id,
        )
        produced = {f.field_name for f in result.extracted_fields}
        kept = [f for f in doc.extracted_fields if f.extraction_source == "manual_entry" and f.field_name not in produced]
        doc.extracted_fields = result.extracted_fields + kept
        doc.extracted_text_snippet = result.extracted_text_snippet
        doc.status = "extracted"
        extracted += 1
    _event(batch, "AWS Step Functions / OCR (Amazon Rekognition, Nova or Textract)", "Evidence Extraction", f"Extracted {extracted} document(s); {skipped} skipped (already extracted or no stored file).")
    repo.update_batch(batch.id, batch)
    return {"batch_id": batch_id, "extracted": extracted, "skipped": skipped}


def evaluate_rules(batch_id: str) -> Dict[str, Any]:
    repo = _repo()
    batch = repo.get_batch(batch_id)
    if not batch:
        raise ValueError(f"Batch '{batch_id}' not found")
    automated = reverify_batch(batch, note_actor="AWS Step Functions / Verification Engine", reason="Workflow evaluation")
    repo.update_batch(batch.id, batch)
    return {"batch_id": batch_id, "status": batch.status.value, "automated_status": automated.value}


def issue_passport(batch_id: str) -> Dict[str, Any]:
    from app.passports.canonical import create_circularity_passport

    repo = _repo()
    batch = repo.get_batch(batch_id)
    if not batch:
        raise ValueError(f"Batch '{batch_id}' not found")
    if batch.passport:
        return {"batch_id": batch_id, "passport_id": batch.passport.passport_id, "issued": False}
    ok, msg, passport = create_circularity_passport(batch)
    if not ok:
        raise ValueError(msg)
    batch.passport = passport
    _event(batch, "AWS Step Functions / AWS KMS", "Circularity Passport Issued", f"Issued {passport.passport_id}. Signature state: {passport.signature_status}.")
    repo.update_batch(batch.id, batch)
    repo.save_passport(passport)
    return {"batch_id": batch_id, "passport_id": passport.passport_id, "issued": True, "signature_status": passport.signature_status}


def notify_auditor(batch_id: str) -> Dict[str, Any]:
    repo = _repo()
    batch = repo.get_batch(batch_id)
    if not batch:
        raise ValueError(f"Batch '{batch_id}' not found")
    topic = os.getenv("ALERT_TOPIC_ARN")
    published = False
    if topic:
        import boto3

        boto3.client("sns").publish(
            TopicArn=topic,
            Subject=f"Waste2Value: {batch.batch_number} needs auditor review",
            Message=(
                f"Batch {batch.batch_number} finished automated verification with status {batch.status.value} "
                f"and risk {batch.risk_score.risk_level.value} ({batch.risk_score.overall_score}/100).\n"
                + "\n".join(f"- [{f.severity.value}] {f.title}" for f in batch.findings if f.severity != Severity.INFO)
            ),
        )
        published = True
    _event(batch, "AWS Step Functions / Amazon SNS", "Auditor Notified", "Alert published to the auditor topic." if published else "No alert topic configured; no notification was sent.", Severity.WARNING)
    repo.update_batch(batch.id, batch)
    return {"batch_id": batch_id, "notified": published, "status": batch.status.value}


ACTIONS = {
    "EXTRACT_EVIDENCE": extract_evidence,
    "EVALUATE_RULES": evaluate_rules,
    "ISSUE_PASSPORT": issue_passport,
    "NOTIFY_AUDITOR": notify_auditor,
}


def handler(event, _context=None):
    action = event.get("Action")
    batch_id = event.get("batch_id")
    if action not in ACTIONS or not batch_id:
        raise ValueError(f"Unsupported workflow event: {event}")
    return ACTIONS[action](batch_id)
