from datetime import datetime
from typing import List, Tuple
from app.schemas.batch import (
    RiskScore,
    RiskScoreBreakdown,
    RiskLevel,
    VerificationFinding,
    Severity,
)

def calculate_risk_score(
    findings: List[VerificationFinding],
    extraction_conf: float = 95.0,
    completeness: float = 100.0,
    consistency: float = 95.0,
) -> RiskScore:
    """
    Explainable Risk Scoring Algorithm (0-100 scale, lower is lower risk).
    Accumulates penalty points for critical and warning findings.
    """
    num_critical = sum(1 for f in findings if f.severity == Severity.CRITICAL)
    num_warning = sum(1 for f in findings if f.severity == Severity.WARNING)

    # Operational penalty: Critical findings contribute high penalty, Warnings contribute moderate penalty
    operational_risk_penalty = (num_critical * 50.0) + (num_warning * 25.0)
    operational_risk = min(100.0, operational_risk_penalty)

    # Deficits from perfect scores
    consistency_deficit = 100.0 - consistency
    completeness_deficit = 100.0 - completeness
    conf_deficit = 100.0 - extraction_conf

    # Base weighted score
    base_score = (
        consistency_deficit * 0.25 +
        completeness_deficit * 0.15 +
        conf_deficit * 0.05 +
        operational_risk * 0.55
    )

    # Enforce standard compliance tiers:
    # Any Critical finding -> High Risk (score > 70)
    # Any Warning finding without Critical -> Medium Risk (score between 26 and 70)
    # Clean without Critical or Warning -> Low Risk (score <= 25)
    if num_critical > 0:
        overall_score = max(75, min(99, int(round(base_score + 25.0 * num_critical))))
    elif num_warning > 0:
        overall_score = max(35, min(70, int(round(base_score + 15.0 * num_warning))))
    else:
        overall_score = max(5, min(25, int(round(base_score))))

    if overall_score <= 25:
        risk_level = RiskLevel.LOW
        summary = "All documentary evidence is consistent and verified within allowable processing tolerances."
    elif overall_score <= 70:
        risk_level = RiskLevel.MEDIUM
        summary = "Requires human compliance auditor review due to moderate quantity variance or incomplete records."
    else:
        risk_level = RiskLevel.HIGH
        summary = "Critical failure across multiple verification rules. Significant mass-balance deficit or timeline conflict detected."

    return RiskScore(
        overall_score=overall_score,
        risk_level=risk_level,
        policy_version="v1.2-synthetic",
        summary_explanation=summary,
        calculated_at=datetime.utcnow().isoformat() + "Z",
        breakdown=RiskScoreBreakdown(
            extraction_confidence=extraction_conf,
            evidence_completeness=completeness,
            cross_document_consistency=consistency,
            operational_risk=operational_risk,
        ),
    )
