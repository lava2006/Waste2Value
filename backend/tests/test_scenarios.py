import pytest
from app.schemas.batch import (
    BatchCreate,
    EvidenceDocument,
    ExtractedField,
    EwasteCategory,
    VerificationStatus,
    RiskLevel,
    DocumentType,
)
from app.verification.engine import run_verification
from app.passports.canonical import create_circularity_passport
from app.schemas.batch import BatchResponse

def test_scenario_a_clean_batch():
    b_input = BatchCreate(
        batch_number="BATCH-2025-001",
        category=EwasteCategory.IT_TELECOM,
        claimed_quantity=5000.0,
        unit="kg",
        recycler_name="GreenTech Circular Ltd",
        recycler_registration_id="REG-2024-ENV-8841",
        collection_date="2025-03-10",
        processing_date="2025-03-14",
        origin_location="Munich IT Hub, Germany",
        destination_location="GreenTech Facility 4, Leipzig",
    )
    docs = [
        EvidenceDocument(
            id="doc-101",
            batch_id="b1",
            title="Recycling Certificate",
            document_type=DocumentType.RECYCLING_CERTIFICATE,
            file_name="CERT-2025-0891.pdf",
            upload_timestamp="2025-03-14T14:00:00Z",
            extracted_fields=[
                ExtractedField(id="f1", document_id="doc-101", field_name="certified_weight", label="Weight", value=4920, unit="kg", confidence=0.99, page_number=1)
            ]
        ),
        EvidenceDocument(
            id="doc-102",
            batch_id="b1",
            title="Transport Waybill",
            document_type=DocumentType.TRANSPORT_WAYBILL,
            file_name="WB-2025-4421.pdf",
            upload_timestamp="2025-03-10T09:00:00Z",
            extracted_fields=[
                ExtractedField(id="f2", document_id="doc-102", field_name="manifest_weight", label="Weight", value=5000, unit="kg", confidence=0.98, page_number=1)
            ]
        ),
        EvidenceDocument(
            id="doc-103",
            batch_id="b1",
            title="Weighbridge Ticket",
            document_type=DocumentType.WEIGHBRIDGE_RECORD,
            file_name="WBR-2025-9912.png",
            upload_timestamp="2025-03-11T11:00:00Z",
            extracted_fields=[
                ExtractedField(id="f3", document_id="doc-103", field_name="net_weight", label="Weight", value=4960, unit="kg", confidence=0.99, page_number=1)
            ]
        ),
    ]

    status, mb, risk, mat, findings = run_verification(b_input, docs, tolerance_percent=2.0)

    # Assertions
    assert status == VerificationStatus.SUPPORTED
    assert mb.is_within_tolerance is True
    assert mb.evidence_supported_kg == 4920.0
    assert risk.risk_level == RiskLevel.LOW
    assert mat.net_estimated_recovery_value_usd > 50000.0

    # Passport issuance eligibility
    b_resp = BatchResponse(
        id="batch-001",
        batch_number=b_input.batch_number,
        category=b_input.category,
        claimed_quantity=b_input.claimed_quantity,
        unit=b_input.unit,
        recycler_name=b_input.recycler_name,
        recycler_registration_id=b_input.recycler_registration_id,
        collection_date=b_input.collection_date,
        processing_date=b_input.processing_date,
        origin_location=b_input.origin_location,
        destination_location=b_input.destination_location,
        status=status,
        mass_balance=mb,
        risk_score=risk,
        material_estimate=mat,
        documents=docs,
        findings=findings,
        created_at="2025-03-10T00:00:00Z",
        updated_at="2025-03-14T00:00:00Z",
    )
    ok, msg, passport = create_circularity_passport(b_resp)
    assert ok is True
    assert passport is not None
    assert passport.integrity_status == "VALID"
    assert len(passport.sha256_hash) == 64

def test_scenario_b_borderline_batch():
    b_input = BatchCreate(
        batch_number="BATCH-2025-002",
        category=EwasteCategory.CONSUMER_ELECTRONICS,
        claimed_quantity=12000.0,
        unit="kg",
        recycler_name="EcoCycle Logistics & Refurbishment",
        recycler_registration_id="REG-2023-ENV-5510",
        collection_date="2025-03-18",
        processing_date="2025-03-24",
        origin_location="Rotterdam Port, Netherlands",
        destination_location="EcoCycle Facility B, Antwerp",
    )
    docs = [
        EvidenceDocument(
            id="doc-201",
            batch_id="b2",
            title="Transport Waybill",
            document_type=DocumentType.TRANSPORT_WAYBILL,
            file_name="WB-2025-8819.pdf",
            upload_timestamp="2025-03-18T10:00:00Z",
            extracted_fields=[
                ExtractedField(id="f21", document_id="doc-201", field_name="manifest_weight", label="Weight", value=12000, unit="kg", confidence=0.95, page_number=1)
            ]
        ),
        EvidenceDocument(
            id="doc-202",
            batch_id="b2",
            title="Weighbridge Ticket",
            document_type=DocumentType.WEIGHBRIDGE_RECORD,
            file_name="WBR-2025-1104.pdf",
            upload_timestamp="2025-03-19T13:00:00Z",
            extracted_fields=[
                ExtractedField(id="f22", document_id="doc-202", field_name="net_weight", label="Weight", value=8500, unit="kg", confidence=0.98, page_number=1, is_discrepant=True)
            ]
        ),
    ]

    status, mb, risk, mat, findings = run_verification(b_input, docs, tolerance_percent=3.0)

    # Assertions
    assert status == VerificationStatus.REVIEW_REQUIRED
    assert mb.is_within_tolerance is False
    assert mb.discrepancy_kg == 3500.0
    assert risk.risk_level == RiskLevel.MEDIUM
    assert any(f.rule_id == "MB-002" for f in findings)

    # Passport must be blocked
    b_resp = BatchResponse(
        id="batch-002",
        batch_number=b_input.batch_number,
        category=b_input.category,
        claimed_quantity=b_input.claimed_quantity,
        unit=b_input.unit,
        recycler_name=b_input.recycler_name,
        recycler_registration_id=b_input.recycler_registration_id,
        collection_date=b_input.collection_date,
        processing_date=b_input.processing_date,
        origin_location=b_input.origin_location,
        destination_location=b_input.destination_location,
        status=status,
        mass_balance=mb,
        risk_score=risk,
        material_estimate=mat,
        documents=docs,
        findings=findings,
        created_at="2025-03-18T00:00:00Z",
        updated_at="2025-03-24T00:00:00Z",
    )
    ok, msg, passport = create_circularity_passport(b_resp)
    assert ok is False
    assert passport is None
    assert "Must be 'SUPPORTED'" in msg

def test_scenario_c_high_risk_suspicious():
    b_input = BatchCreate(
        batch_number="BATCH-2025-003",
        category=EwasteCategory.LARGE_APPLIANCES,
        claimed_quantity=25000.0,
        unit="kg",
        recycler_name="Apex Metal Recovery Inc",
        recycler_registration_id="REG-2022-UNCONFIRMED",
        collection_date="2025-03-25",
        processing_date="2025-02-14", # 39 days BEFORE collection
        origin_location="Milan Distribution Hub, Italy",
        destination_location="Apex Yard, Brescia",
    )
    docs = [
        EvidenceDocument(
            id="doc-301",
            batch_id="b3",
            title="Suspect Manifest",
            document_type=DocumentType.TRANSPORT_WAYBILL,
            file_name="WB-2024-9901-SUSPECT.pdf",
            upload_timestamp="2025-03-25T11:00:00Z",
            extracted_fields=[
                ExtractedField(id="f31", document_id="doc-301", field_name="waybill_number", label="Waybill Serial", value="WB-2024-9901", confidence=0.96, page_number=1),
                ExtractedField(id="f32", document_id="doc-301", field_name="entity_name", label="Entity", value="Apex Logistics LLC", confidence=0.94, page_number=1)
            ]
        ),
        EvidenceDocument(
            id="doc-302",
            batch_id="b3",
            title="Scale Record",
            document_type=DocumentType.WEIGHBRIDGE_RECORD,
            file_name="SCALE-TICKET-FEB14.jpg",
            upload_timestamp="2025-03-25T11:05:00Z",
            extracted_fields=[
                ExtractedField(id="f33", document_id="doc-302", field_name="net_weight", label="Scale Weight", value=11200, unit="kg", confidence=0.97, page_number=1)
            ]
        ),
    ]

    status, mb, risk, mat, findings = run_verification(b_input, docs, tolerance_percent=5.0)

    # Assertions: High risk score and discrepancies trigger REVIEW_REQUIRED for investigation, not automatic REJECTED
    assert status == VerificationStatus.REVIEW_REQUIRED
    assert mb.discrepancy_kg == 13800.0
    assert risk.risk_level == RiskLevel.HIGH
    assert risk.overall_score > 70
    assert any(f.rule_id == "TL-001" for f in findings)
    assert any(f.rule_id == "ID-001" for f in findings)
    assert any(f.rule_id == "DP-001" for f in findings)

    # Explicit rejection criteria or authorized auditor decision triggers REJECTED
    rej_status, _, _, _, _ = run_verification(b_input, docs, tolerance_percent=5.0, explicit_rejection_criteria_met=True)
    assert rej_status == VerificationStatus.REJECTED
