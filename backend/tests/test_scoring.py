import pytest
from app.scoring.scorer import calculate_risk_score
from app.schemas.batch import VerificationFinding, Severity, RiskLevel

def test_risk_score_low_risk():
    info_finding = VerificationFinding(
        id="f1",
        rule_id="MB-001",
        rule_name="Mass Balance",
        severity=Severity.INFO,
        title="Tolerance Accepted",
        description="Within tolerance",
        recommended_action="None",
        created_at="2025-03-10T00:00:00Z"
    )
    score = calculate_risk_score(
        findings=[info_finding],
        extraction_conf=96.0,
        completeness=100.0,
        consistency=95.0
    )
    assert score.overall_score <= 25
    assert score.risk_level == RiskLevel.LOW
    assert "consistent and verified" in score.summary_explanation

def test_risk_score_reproducibility():
    """Ensure identical inputs always produce the exact same score."""
    finding = VerificationFinding(
        id="f1",
        rule_id="MB-002",
        rule_name="Mass Balance Deficit",
        severity=Severity.WARNING,
        title="Shortfall",
        description="Moderate shortfall",
        recommended_action="Review",
        created_at="2025-03-10T00:00:00Z"
    )
    score1 = calculate_risk_score(findings=[finding], extraction_conf=90.0, completeness=70.0, consistency=60.0)
    score2 = calculate_risk_score(findings=[finding], extraction_conf=90.0, completeness=70.0, consistency=60.0)

    assert score1.overall_score == score2.overall_score
    assert score1.risk_level == score2.risk_level

def test_risk_score_critical_penalty():
    crit_finding = VerificationFinding(
        id="f1",
        rule_id="MB-003",
        rule_name="Severe Deficit",
        severity=Severity.CRITICAL,
        title="Critical Deficit",
        description="Severe shortfall",
        recommended_action="Reject",
        created_at="2025-03-10T00:00:00Z"
    )
    score = calculate_risk_score(
        findings=[crit_finding],
        extraction_conf=80.0,
        completeness=40.0,
        consistency=30.0
    )
    assert score.overall_score > 70
    assert score.risk_level == RiskLevel.HIGH
    assert score.breakdown.operational_risk >= 35.0
