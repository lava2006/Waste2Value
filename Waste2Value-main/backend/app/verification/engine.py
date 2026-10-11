from datetime import datetime
from typing import List, Tuple, Optional
from app.schemas.batch import (
    BatchCreate,
    EvidenceDocument,
    VerificationStatus,
    VerificationFinding,
    MassBalance,
    RiskScore,
    MaterialEstimate,
    Severity,
    DocumentType,
)
from app.verification.rules import (
    normalize_to_kg,
    evaluate_mass_balance,
    evaluate_timeline_plausibility,
    evaluate_recycler_consistency,
    evaluate_duplicate_evidence,
    evaluate_evidence_completeness,
)
from app.verification.policies import DEFAULT_VERIFICATION_POLICY, VerificationPolicy
from app.scoring.scorer import calculate_risk_score
from app.materials.estimator import estimate_material_value

def run_verification(
    batch_input: BatchCreate,
    documents: List[EvidenceDocument],
    tolerance_percent: Optional[float] = None,
    policy: Optional[VerificationPolicy] = None,
    explicit_rejection_criteria_met: bool = False,
) -> Tuple[VerificationStatus, MassBalance, RiskScore, MaterialEstimate, List[VerificationFinding]]:
    """
    Executes policy-driven deterministic verification rules across the consignment dossier.
    Separates verification findings from overall status:
    - SUPPORTED: Complete documentary evidence conforming within policy tolerances.
    - REVIEW_REQUIRED: Discrepancies, missing evidence, timeline/identity flags, or high risk.
    - REJECTED: Strictly reserved for explicit rejection criteria or authorized audit decisions.
    """
    active_policy = policy or DEFAULT_VERIFICATION_POLICY
    effective_tolerance = (
        tolerance_percent
        if tolerance_percent is not None
        else active_policy.get_tolerance_for_category(batch_input.category)
    )

    all_findings: List[VerificationFinding] = []
    now_iso = datetime.utcnow().isoformat() + "Z"

    # 1. Unit Normalization
    claimed_kg, unit_err = normalize_to_kg(batch_input.claimed_quantity, batch_input.unit)

    # Extract lifecycle quantities from attached documents. A stage stays None (unknown)
    # unless a document actually states it; unknown is never defaulted to the claim.
    # Fields on the stage's canonical document type take priority over the same field
    # name on another document type.
    stage_fields = {
        "received": ({"net_weight", "weighbridge_intake", "scale_weight"}, DocumentType.WEIGHBRIDGE_RECORD),
        "transported": ({"manifest_weight", "declared_weight"}, DocumentType.TRANSPORT_WAYBILL),
        "processed": ({"certified_weight", "processed_weight"}, DocumentType.RECYCLING_CERTIFICATE),
    }
    stage_value: dict = {}
    stage_source: dict = {}
    for doc in documents:
        for f in doc.extracted_fields:
            for stage, (names, canonical_type) in stage_fields.items():
                if f.field_name not in names:
                    continue
                try:
                    val = float(f.value)
                except (TypeError, ValueError):
                    continue
                norm_val, unit_issue = normalize_to_kg(val, f.unit or "kg")
                if unit_issue:
                    all_findings.append(
                        VerificationFinding(
                            id=f"find-UN-001-{doc.id}-{f.id}",
                            rule_id="UN-001",
                            rule_name="Unit Normalization",
                            severity=Severity.WARNING,
                            title="Unsupported Unit on Extracted Quantity",
                            description=f"Field '{f.label}' in '{doc.file_name}' uses unit '{f.unit}'. {unit_issue} The value was not used for mass reconciliation.",
                            observed_value=f"{f.value} {f.unit}",
                            expected_value="kg, metric_ton, or lb",
                            source_document_id=doc.id,
                            source_document_name=doc.file_name,
                            source_field_id=f.id,
                            lifecycle_stage=stage,
                            recommended_action="Correct the unit on the extracted field or re-extract the document.",
                            created_at=now_iso,
                        )
                    )
                    continue
                is_canonical = doc.document_type == canonical_type
                prior = stage_source.get(stage)
                if prior is None or is_canonical or not prior[2]:
                    stage_value[stage] = norm_val
                    stage_source[stage] = (doc, f, is_canonical)

    transported_kg: Optional[float] = stage_value.get("transported")
    received_kg: Optional[float] = stage_value.get("received")
    processed_kg: Optional[float] = stage_value.get("processed")

    # 2-5. Mass Balance Reconciliation against policy tolerance. The reconciliation helper
    # needs numeric inputs, so each missing downstream stage borrows the other documented
    # one for the comparison only; the returned MassBalance keeps unknown stages as None.
    ev_supported_kg: Optional[float] = None
    if received_kg is None and processed_kg is None:
        loss_pct = 0.0
        within_tol = False
        all_findings.append(
            VerificationFinding(
                id="find-MB-000",
                rule_id="MB-000",
                rule_name="Mass-Balance Evidence Availability",
                severity=Severity.WARNING,
                title="Mass Balance Cannot Be Assessed: No Received or Processed Quantity Documented",
                description=(
                    f"The claim declares {claimed_kg:,.0f} kg but no weighbridge/scale record or processing "
                    "certificate states a received or processed quantity, so no quantity is evidence-supported."
                ),
                observed_value="Not recorded",
                expected_value=f"{claimed_kg:,.0f} kg (± {effective_tolerance}%) documented at intake",
                lifecycle_stage="received",
                recommended_action="Attach a weighbridge scale record for the received quantity.",
                created_at=now_iso,
            )
        )
    else:
        ev_supported_kg, loss_pct, within_tol, mb_findings = evaluate_mass_balance(
            claimed_kg=claimed_kg,
            transported_kg=transported_kg if transported_kg is not None else claimed_kg,
            received_kg=received_kg if received_kg is not None else processed_kg,
            processed_kg=processed_kg if processed_kg is not None else received_kg,
            tolerance_percent=effective_tolerance,
            documents=documents,
        )
        # Point mass findings at the document that evidences the limiting stage.
        limiting_stage = "processed" if (processed_kg is not None and (received_kg is None or processed_kg <= received_kg)) else "received"
        src = stage_source.get(limiting_stage) or stage_source.get("received") or stage_source.get("processed")
        for mf in mb_findings:
            mf.lifecycle_stage = limiting_stage
            if src:
                mf.source_document_id = mf.source_document_id or src[0].id
                mf.source_document_name = mf.source_document_name or src[0].file_name
                mf.source_field_id = mf.source_field_id or src[1].id
        all_findings.extend(mb_findings)

    # 6. Timeline Plausibility
    tl_findings = evaluate_timeline_plausibility(
        collection_date_str=batch_input.collection_date,
        processing_date_str=batch_input.processing_date,
        documents=documents,
    )
    all_findings.extend(tl_findings)

    # 7. Recycler Consistency
    rc_findings = evaluate_recycler_consistency(
        claimed_recycler_name=batch_input.recycler_name,
        claimed_license=batch_input.recycler_registration_id,
        documents=documents,
    )
    all_findings.extend(rc_findings)

    # 8. Duplicate Evidence
    dp_findings = evaluate_duplicate_evidence(documents=documents)
    all_findings.extend(dp_findings)

    # 9. Evidence Completeness against policy mandatory documents
    mandatory_docs = active_policy.get_mandatory_documents(batch_input.category)
    completeness_score, ec_findings = evaluate_evidence_completeness(
        documents=documents,
        required_types=mandatory_docs,
    )
    all_findings.extend(ec_findings)

    # 10. Extraction Uncertainty & Consistency Scoring
    conf_values = [
        (f.confidence * 100.0 if f.confidence <= 1.0 else f.confidence)
        for doc in documents
        for f in doc.extracted_fields
        # Manual entries and AI-read values carry no OCR confidence; they must not skew the average.
        if f.confidence is not None and f.extraction_source not in ("manual_entry", "nova_vision")
    ]
    extraction_conf = round(sum(conf_values) / len(conf_values), 1) if conf_values else 95.0

    consistency_score = max(20.0, 100.0 - (loss_pct * 1.5))
    for fnd in all_findings:
        fnd.policy_version = active_policy.policy_version
    if any(f.severity == Severity.CRITICAL for f in all_findings):
        consistency_score = min(consistency_score, 30.0)
    elif any(f.severity == Severity.WARNING for f in all_findings):
        consistency_score = min(consistency_score, 65.0)

    risk_score = calculate_risk_score(
        findings=all_findings,
        extraction_conf=extraction_conf,
        completeness=completeness_score,
        consistency=consistency_score,
    )

    # Status Determination:
    # A discrepancy or high risk score warrants human investigation -> REVIEW_REQUIRED.
    # REJECTED is strictly reserved for explicit rejection criteria or authorized decisions.
    has_critical = any(f.severity == Severity.CRITICAL for f in all_findings)
    has_warning = any(f.severity == Severity.WARNING for f in all_findings)

    if explicit_rejection_criteria_met:
        status = VerificationStatus.REJECTED
    elif has_critical or has_warning or not within_tol or completeness_score < 100.0:
        status = VerificationStatus.REVIEW_REQUIRED
    else:
        status = VerificationStatus.SUPPORTED

    mass_balance = MassBalance(
        claimed_kg=claimed_kg,
        transported_kg=transported_kg,
        received_kg=received_kg,
        processed_kg=processed_kg,
        recovered_kg=None,
        evidence_supported_kg=ev_supported_kg,
        discrepancy_kg=abs(claimed_kg - ev_supported_kg) if ev_supported_kg is not None else None,
        loss_percentage=round(loss_pct, 1) if ev_supported_kg is not None else None,
        tolerance_percentage=effective_tolerance,
        is_within_tolerance=within_tol,
    )

    material_estimate = estimate_material_value(
        category=batch_input.category,
        evidence_supported_kg=ev_supported_kg,
    )

    return status, mass_balance, risk_score, material_estimate, all_findings


def reverify_batch(batch, note_actor: str = "Deterministic Verification Engine", reason: str = "Evidence or batch attributes changed"):
    """
    Re-run verification for an existing BatchResponse and update it in place.

    An explicit authorized auditor decision is never silently overridden: when one exists,
    batch.status keeps the decision and the automated result is recorded on the timeline.
    Returns the automated verification status.
    """
    from app.schemas.batch import BatchTimelineEvent
    import uuid

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
    batch.mass_balance = mb
    batch.risk_score = risk
    batch.material_estimate = mat
    batch.findings = findings
    retained = None
    if batch.auditor_decision is not None:
        retained = batch.auditor_decision.decision
        batch.status = retained
    else:
        batch.status = v_status
    note = f"{reason}. Automated result: {v_status.value}."
    if retained is not None and retained != v_status:
        note += f" Authorized auditor decision {retained.value} retained pending re-review."
    batch.timeline.append(
        BatchTimelineEvent(
            id=f"t-{uuid.uuid4().hex[:10]}",
            timestamp=datetime.utcnow().isoformat() + "Z",
            actor=note_actor,
            action="Verification Re-run",
            note=note,
            severity=Severity.INFO,
        )
    )
    return v_status
