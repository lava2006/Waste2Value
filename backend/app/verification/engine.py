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

    # 1. Unit Normalization
    claimed_kg, unit_err = normalize_to_kg(batch_input.claimed_quantity, batch_input.unit)

    # Extract transported, received, and processed weights from attached documents
    transported_kg = claimed_kg
    received_kg = claimed_kg
    processed_kg = claimed_kg

    for doc in documents:
        for f in doc.extracted_fields:
            if f.field_name in ["net_weight", "weighbridge_intake", "scale_weight"]:
                try:
                    val = float(f.value)
                    norm_val, _ = normalize_to_kg(val, f.unit or "kg")
                    received_kg = norm_val
                except Exception:
                    pass
            elif f.field_name in ["manifest_weight", "declared_weight"]:
                try:
                    val = float(f.value)
                    norm_val, _ = normalize_to_kg(val, f.unit or "kg")
                    transported_kg = norm_val
                except Exception:
                    pass
            elif f.field_name in ["certified_weight", "processed_weight"]:
                try:
                    val = float(f.value)
                    norm_val, _ = normalize_to_kg(val, f.unit or "kg")
                    processed_kg = norm_val
                except Exception:
                    pass

    # 2-5. Mass Balance Reconciliation against policy tolerance
    ev_supported_kg, loss_pct, within_tol, mb_findings = evaluate_mass_balance(
        claimed_kg=claimed_kg,
        transported_kg=transported_kg,
        received_kg=received_kg,
        processed_kg=processed_kg,
        tolerance_percent=effective_tolerance,
        documents=documents,
    )
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
        if f.confidence is not None
    ]
    extraction_conf = round(sum(conf_values) / len(conf_values), 1) if conf_values else 95.0

    consistency_score = max(20.0, 100.0 - (loss_pct * 1.5))
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
        recovered_kg=ev_supported_kg,
        evidence_supported_kg=ev_supported_kg,
        discrepancy_kg=abs(claimed_kg - ev_supported_kg),
        loss_percentage=round(loss_pct, 1),
        tolerance_percentage=effective_tolerance,
        is_within_tolerance=within_tol,
    )

    material_estimate = estimate_material_value(
        category=batch_input.category,
        evidence_supported_kg=ev_supported_kg,
    )

    return status, mass_balance, risk_score, material_estimate, all_findings
