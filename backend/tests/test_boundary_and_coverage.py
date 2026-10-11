import pytest
from app.schemas.batch import (
    BatchCreate,
    EvidenceDocument,
    ExtractedField,
    EwasteCategory,
    VerificationStatus,
    RiskLevel,
    DocumentType,
    Severity,
)
from app.verification.rules import (
    normalize_to_kg,
    evaluate_mass_balance,
    evaluate_timeline_plausibility,
    evaluate_evidence_completeness,
)
from app.verification.engine import run_verification
from app.verification.policies import DEFAULT_VERIFICATION_POLICY, VerificationPolicy

def test_exact_tolerance_boundary_cases():
    """
    Tests exact boundary floating-point thresholds:
    - 2.000% exactly -> within tolerance
    - 1.999% -> within tolerance
    - 2.001% -> exceeds tolerance
    """
    claimed = 10000.0

    # 1.999% loss -> 199.9 kg deficit -> received = 9800.1 kg
    _, loss_pct_under, within_under, _ = evaluate_mass_balance(
        claimed_kg=claimed,
        transported_kg=claimed,
        received_kg=9800.1,
        processed_kg=9800.1,
        tolerance_percent=2.0
    )
    assert within_under is True
    assert round(loss_pct_under, 3) <= 2.0

    # 2.000% loss exactly -> 200.0 kg deficit -> received = 9800.0 kg
    _, loss_pct_exact, within_exact, _ = evaluate_mass_balance(
        claimed_kg=claimed,
        transported_kg=claimed,
        received_kg=9800.0,
        processed_kg=9800.0,
        tolerance_percent=2.0
    )
    assert within_exact is True
    assert round(loss_pct_exact, 2) == 2.00

    # 2.001% loss -> 200.1 kg deficit -> received = 9799.9 kg
    _, loss_pct_over, within_over, findings_over = evaluate_mass_balance(
        claimed_kg=claimed,
        transported_kg=claimed,
        received_kg=9799.9,
        processed_kg=9799.9,
        tolerance_percent=2.0
    )
    assert within_over is False
    assert any(f.rule_id == "MB-002" for f in findings_over)

def test_severe_deficit_threshold_boundary():
    """
    Tests boundary between standard discrepancy (MB-002 Warning) and severe deficit (MB-003 Critical):
    Threshold is 30.0%.
    """
    claimed = 10000.0

    # 30.00% loss (3000 kg deficit) -> Warning MB-002
    _, _, _, findings_30 = evaluate_mass_balance(
        claimed_kg=claimed,
        transported_kg=claimed,
        received_kg=7000.0,
        processed_kg=7000.0,
        tolerance_percent=2.0
    )
    assert any(f.rule_id == "MB-002" and f.severity == Severity.WARNING for f in findings_30)
    assert not any(f.rule_id == "MB-003" for f in findings_30)

    # 30.01% loss (3001 kg deficit) -> Critical MB-003
    _, _, _, findings_30_plus = evaluate_mass_balance(
        claimed_kg=claimed,
        transported_kg=claimed,
        received_kg=6999.0,
        processed_kg=6999.0,
        tolerance_percent=2.0
    )
    assert any(f.rule_id == "MB-003" and f.severity == Severity.CRITICAL for f in findings_30_plus)

def test_category_specific_policy_tolerances():
    """
    Verifies that policy-driven tolerances automatically apply based on e-waste category:
    - Batteries: 1.5%
    - Large Appliances: 5.0%
    """
    policy = DEFAULT_VERIFICATION_POLICY

    # Batteries with 1.8% loss (claimed 10,000 kg, received 9,820 kg)
    # Under default 2.0% it would pass, but under battery policy (1.5%) it MUST fail tolerance!
    batch_battery = BatchCreate(
        batch_number="BATCH-BAT-001",
        category=EwasteCategory.BATTERIES,
        claimed_quantity=10000.0,
        unit="kg",
        recycler_name="Battery Recycling EU",
        recycler_registration_id="REG-BAT-01",
        collection_date="2025-04-01",
        processing_date="2025-04-03",
        origin_location="Berlin",
        destination_location="Leipzig",
    )
    doc_bat = [
        EvidenceDocument(
            id="d1",
            batch_id="b-bat",
            title="Weighbridge Record",
            document_type=DocumentType.WEIGHBRIDGE_RECORD,
            file_name="WBR-BAT.pdf",
            upload_timestamp="2025-04-01T00:00:00Z",
            extracted_fields=[
                ExtractedField(id="f1", document_id="d1", field_name="net_weight", label="Net Weight", value=9820, unit="kg", confidence=0.98, page_number=1)
            ]
        ),
        EvidenceDocument(
            id="d2",
            batch_id="b-bat",
            title="Transport Waybill",
            document_type=DocumentType.TRANSPORT_WAYBILL,
            file_name="WB-BAT.pdf",
            upload_timestamp="2025-04-01T00:00:00Z",
            extracted_fields=[
                ExtractedField(id="f2", document_id="d2", field_name="manifest_weight", label="Waybill Weight", value=10000, unit="kg", confidence=0.98, page_number=1)
            ]
        ),
        EvidenceDocument(
            id="d3",
            batch_id="b-bat",
            title="Recycling Certificate",
            document_type=DocumentType.RECYCLING_CERTIFICATE,
            file_name="CERT-BAT.pdf",
            upload_timestamp="2025-04-01T00:00:00Z",
            extracted_fields=[]
        )
    ]
    status, mb, risk, _, _ = run_verification(batch_battery, doc_bat, policy=policy)
    assert mb.tolerance_percentage == 1.5
    assert mb.is_within_tolerance is False
    assert status == VerificationStatus.REVIEW_REQUIRED

    # Large Appliances with 4.5% loss (claimed 10,000 kg, received 9,550 kg)
    # Under large appliance policy (5.0%), this conforms!
    batch_large = BatchCreate(
        batch_number="BATCH-LARGE-001",
        category=EwasteCategory.LARGE_APPLIANCES,
        claimed_quantity=10000.0,
        unit="kg",
        recycler_name="Heavy Metal Circular",
        recycler_registration_id="REG-HVY-01",
        collection_date="2025-04-01",
        processing_date="2025-04-03",
        origin_location="Dusseldorf",
        destination_location="Essen",
    )
    doc_large = [
        EvidenceDocument(
            id="dl1",
            batch_id="b-lg",
            title="Weighbridge Record",
            document_type=DocumentType.WEIGHBRIDGE_RECORD,
            file_name="WBR-LG.pdf",
            upload_timestamp="2025-04-01T00:00:00Z",
            extracted_fields=[
                ExtractedField(id="fl1", document_id="dl1", field_name="net_weight", label="Net Weight", value=9550, unit="kg", confidence=0.98, page_number=1)
            ]
        ),
        EvidenceDocument(
            id="dl2",
            batch_id="b-lg",
            title="Transport Waybill",
            document_type=DocumentType.TRANSPORT_WAYBILL,
            file_name="WB-LG.pdf",
            upload_timestamp="2025-04-01T00:00:00Z",
            extracted_fields=[
                ExtractedField(id="fl2", document_id="dl2", field_name="manifest_weight", label="Waybill Weight", value=10000, unit="kg", confidence=0.98, page_number=1)
            ]
        )
    ]
    status_lg, mb_lg, risk_lg, _, _ = run_verification(batch_large, doc_large, policy=policy)
    assert mb_lg.tolerance_percentage == 5.0
    assert mb_lg.is_within_tolerance is True
    assert status_lg == VerificationStatus.SUPPORTED

def test_high_risk_score_does_not_automatically_reject():
    """
    CRITICAL REQUIREMENT: A high risk score alone must NEVER automatically reject a batch.
    It must be assigned REVIEW_REQUIRED until explicit rejection criteria or an auditor decision is recorded.
    """
    batch_suspect = BatchCreate(
        batch_number="BATCH-HIGH-RISK-01",
        category=EwasteCategory.CONSUMER_ELECTRONICS,
        claimed_quantity=50000.0,
        unit="kg",
        recycler_name="Suspect Operator Inc",
        recycler_registration_id="REG-UNCONFIRMED",
        collection_date="2025-04-10",
        processing_date="2025-03-01", # Impossible timeline (-40 days)
        origin_location="Rome",
        destination_location="Naples",
    )
    docs_suspect = [
        EvidenceDocument(
            id="ds1",
            batch_id="b-susp",
            title="Weighbridge Record",
            document_type=DocumentType.WEIGHBRIDGE_RECORD,
            file_name="WBR-SUSP.pdf",
            upload_timestamp="2025-04-10T00:00:00Z",
            extracted_fields=[
                # Massive 70% discrepancy
                ExtractedField(id="fs1", document_id="ds1", field_name="net_weight", label="Net Weight", value=15000, unit="kg", confidence=0.98, page_number=1)
            ]
        ),
        EvidenceDocument(
            id="ds2",
            batch_id="b-susp",
            title="Transport Waybill",
            document_type=DocumentType.TRANSPORT_WAYBILL,
            file_name="WB-SUSP.pdf",
            upload_timestamp="2025-04-10T00:00:00Z",
            extracted_fields=[
                # Serial collision
                ExtractedField(id="fs2", document_id="ds2", field_name="waybill_number", label="Serial", value="WB-2024-9901", confidence=0.98, page_number=1),
                # Entity mismatch
                ExtractedField(id="fs3", document_id="ds2", field_name="entity_name", label="Entity", value="Shadow Metal Traders", confidence=0.98, page_number=1),
            ]
        )
    ]
    status, mb, risk, _, findings = run_verification(batch_suspect, docs_suspect)

    # Score is high risk
    assert risk.risk_level == RiskLevel.HIGH
    assert risk.overall_score >= 80

    # BUT status is REVIEW_REQUIRED, NOT REJECTED!
    assert status == VerificationStatus.REVIEW_REQUIRED
    assert status != VerificationStatus.REJECTED

def test_unit_normalization_edge_cases():
    """Tests various canonical and colloquial unit formats."""
    val_kg, err = normalize_to_kg(10.0, "kg")
    assert val_kg == 10.0 and err is None

    val_ton, err = normalize_to_kg(2.5, "metric_ton")
    assert val_ton == 2500.0 and err is None

    val_tonne, err = normalize_to_kg(1.0, "tonne")
    assert val_tonne == 1000.0 and err is None

    val_lbs, err = normalize_to_kg(2204.62, "lbs")
    assert round(val_lbs, 0) == 1000.0 and err is None

    val_bad, err = normalize_to_kg(100.0, "gallons")
    assert err is not None
