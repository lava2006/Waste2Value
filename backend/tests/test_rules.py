import pytest
from app.verification.rules import (
    normalize_to_kg,
    evaluate_mass_balance,
    evaluate_timeline_plausibility,
    evaluate_recycler_consistency,
    evaluate_duplicate_evidence,
    evaluate_evidence_completeness,
)
from app.schemas.batch import EvidenceDocument, ExtractedField, Severity, DocumentType

def test_unit_normalization():
    # kg
    val, err = normalize_to_kg(5000, "kg")
    assert val == 5000
    assert err is None

    # metric ton -> kg
    val, err = normalize_to_kg(5, "metric_ton")
    assert val == 5000
    assert err is None

    # pounds -> kg
    val, err = normalize_to_kg(2204.62, "lbs")
    assert round(val, 0) == 1000
    assert err is None

    # unsupported unit
    val, err = normalize_to_kg(100, "gallons")
    assert err is not None

def test_mass_balance_within_tolerance():
    supported_kg, loss_pct, within_tol, findings = evaluate_mass_balance(
        claimed_kg=5000,
        transported_kg=5000,
        received_kg=4920,
        processed_kg=4920,
        tolerance_percent=2.0
    )
    assert within_tol is True
    assert round(loss_pct, 1) == 1.6
    assert supported_kg == 4920
    assert any(f.severity == Severity.INFO for f in findings)

def test_mass_balance_severe_deficit():
    supported_kg, loss_pct, within_tol, findings = evaluate_mass_balance(
        claimed_kg=25000,
        transported_kg=25000,
        received_kg=11200,
        processed_kg=11200,
        tolerance_percent=5.0
    )
    assert within_tol is False
    assert loss_pct > 50.0
    assert any(f.severity == Severity.CRITICAL for f in findings)

def test_timeline_plausibility():
    # Normal timeline (collection <= processing)
    findings = evaluate_timeline_plausibility(
        collection_date_str="2025-03-10",
        processing_date_str="2025-03-14",
        documents=[]
    )
    assert len(findings) == 0

    # Impossible timeline (processing before collection)
    findings = evaluate_timeline_plausibility(
        collection_date_str="2025-03-25",
        processing_date_str="2025-02-14",
        documents=[]
    )
    assert len(findings) == 1
    assert findings[0].severity == Severity.CRITICAL
    assert findings[0].rule_id == "TL-001"

def test_recycler_consistency():
    doc = EvidenceDocument(
        id="d1",
        batch_id="b1",
        title="Invoice",
        document_type=DocumentType.PROCESSING_INVOICE,
        file_name="inv.pdf",
        upload_timestamp="2025-03-10T00:00:00Z",
        extracted_fields=[
            ExtractedField(
                id="f1",
                document_id="d1",
                field_name="entity_name",
                label="Entity",
                value="Apex Logistics LLC"
            )
        ]
    )

    findings = evaluate_recycler_consistency(
        claimed_recycler_name="Apex Metal Recovery Inc",
        claimed_license="REG-100",
        documents=[doc]
    )
    assert len(findings) == 1
    assert findings[0].severity == Severity.CRITICAL
    assert findings[0].rule_id == "ID-001"

def test_duplicate_evidence():
    doc = EvidenceDocument(
        id="d1",
        batch_id="b1",
        title="Waybill",
        document_type=DocumentType.TRANSPORT_WAYBILL,
        file_name="wb.pdf",
        upload_timestamp="2025-03-10T00:00:00Z",
        extracted_fields=[
            ExtractedField(
                id="f1",
                document_id="d1",
                field_name="waybill_number",
                label="Waybill Serial",
                value="WB-2024-9901" # known collision
            )
        ]
    )

    findings = evaluate_duplicate_evidence(
        documents=[doc],
        known_serials=["WB-2024-9901"]
    )
    assert len(findings) == 1
    assert findings[0].severity == Severity.WARNING
    assert findings[0].rule_id == "DP-001"
