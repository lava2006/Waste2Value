"""Shared, deterministic seed scenarios (A clean, B borderline, C high-risk) used by every repository."""
from datetime import datetime
from typing import List
from app.schemas.batch import BatchCreate, BatchResponse, EvidenceDocument, EwasteCategory
from app.verification.engine import run_verification
from app.passports.canonical import create_circularity_passport


def build_seed_batches() -> List[BatchResponse]:
    out: List[BatchResponse] = []
    now_iso = datetime.utcnow().isoformat() + "Z"

    # Scenario A: Clean
    b1_input = BatchCreate(
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
    docs_1 = [
        EvidenceDocument(
            id="doc-101",
            batch_id="batch-001",
            title="Recycling Certificate",
            document_type="recycling_certificate",
            file_name="CERT-2025-0891.pdf",
            upload_timestamp=now_iso,
            extracted_fields=[
                {"id": "f1", "document_id": "doc-101", "field_name": "certified_weight", "label": "Certified Weight", "value": 4920, "unit": "kg", "confidence": 0.99, "page_number": 1, "extraction_source": "seed_demo"}
            ]
        ),
        EvidenceDocument(
            id="doc-102",
            batch_id="batch-001",
            title="Transport Waybill",
            document_type="transport_waybill",
            file_name="WB-2025-4421.pdf",
            upload_timestamp=now_iso,
            extracted_fields=[
                {"id": "f2", "document_id": "doc-102", "field_name": "manifest_weight", "label": "Waybill Mass", "value": 5000, "unit": "kg", "confidence": 0.98, "page_number": 1, "extraction_source": "seed_demo"}
            ]
        ),
        EvidenceDocument(
            id="doc-103",
            batch_id="batch-001",
            title="Weighbridge Ticket",
            document_type="weighbridge_record",
            file_name="WBR-2025-9912.png",
            upload_timestamp=now_iso,
            extracted_fields=[
                {"id": "f3", "document_id": "doc-103", "field_name": "net_weight", "label": "Intake Weight", "value": 4960, "unit": "kg", "confidence": 0.99, "page_number": 1, "extraction_source": "seed_demo"}
            ]
        )
    ]
    s1, mb1, r1, m1, f1 = run_verification(b1_input, docs_1)
    b1 = BatchResponse(
        id="batch-001",
        batch_number=b1_input.batch_number,
        category=b1_input.category,
        claimed_quantity=b1_input.claimed_quantity,
        unit=b1_input.unit,
        recycler_name=b1_input.recycler_name,
        recycler_registration_id=b1_input.recycler_registration_id,
        collection_date=b1_input.collection_date,
        processing_date=b1_input.processing_date,
        origin_location=b1_input.origin_location,
        destination_location=b1_input.destination_location,
        status=s1,
        mass_balance=mb1,
        risk_score=r1,
        material_estimate=m1,
        documents=docs_1,
        findings=f1,
        created_at=now_iso,
        updated_at=now_iso,
    )
    ok, msg, p1 = create_circularity_passport(b1, passport_id="W2V-CP-0001")
    if ok:
        b1.passport = p1
    out.append(b1)

    # Scenario B: Borderline
    b2_input = BatchCreate(
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
    docs_2 = [
        EvidenceDocument(
            id="doc-201",
            batch_id="batch-002",
            title="Waybill Manifest",
            document_type="transport_waybill",
            file_name="WB-2025-8819.pdf",
            upload_timestamp=now_iso,
            extracted_fields=[
                {"id": "f21", "document_id": "doc-201", "field_name": "manifest_weight", "label": "Waybill Mass", "value": 12000, "unit": "kg", "confidence": 0.95, "page_number": 1, "extraction_source": "seed_demo"}
            ]
        ),
        EvidenceDocument(
            id="doc-202",
            batch_id="batch-002",
            title="Scale Intake Ticket",
            document_type="weighbridge_record",
            file_name="WBR-2025-1104.pdf",
            upload_timestamp=now_iso,
            extracted_fields=[
                {"id": "f22", "document_id": "doc-202", "field_name": "net_weight", "label": "Weighbridge Mass", "value": 8500, "unit": "kg", "confidence": 0.98, "page_number": 1, "is_discrepant": True, "extraction_source": "seed_demo"}
            ]
        )
    ]
    s2, mb2, r2, m2, f2 = run_verification(b2_input, docs_2)
    b2 = BatchResponse(
        id="batch-002",
        batch_number=b2_input.batch_number,
        category=b2_input.category,
        claimed_quantity=b2_input.claimed_quantity,
        unit=b2_input.unit,
        recycler_name=b2_input.recycler_name,
        recycler_registration_id=b2_input.recycler_registration_id,
        collection_date=b2_input.collection_date,
        processing_date=b2_input.processing_date,
        origin_location=b2_input.origin_location,
        destination_location=b2_input.destination_location,
        status=s2,
        mass_balance=mb2,
        risk_score=r2,
        material_estimate=m2,
        documents=docs_2,
        findings=f2,
        created_at=now_iso,
        updated_at=now_iso,
    )
    out.append(b2)

    # Scenario C: High-Risk
    b3_input = BatchCreate(
        batch_number="BATCH-2025-003",
        category=EwasteCategory.LARGE_APPLIANCES,
        claimed_quantity=25000.0,
        unit="kg",
        recycler_name="Apex Metal Recovery Inc",
        recycler_registration_id="REG-2022-UNCONFIRMED",
        collection_date="2025-03-25",
        processing_date="2025-02-14",
        origin_location="Milan Hub, Italy",
        destination_location="Apex Yard, Brescia",
    )
    docs_3 = [
        EvidenceDocument(
            id="doc-301",
            batch_id="batch-003",
            title="Suspect Manifest",
            document_type="transport_waybill",
            file_name="WB-2024-9901-SUSPECT.pdf",
            upload_timestamp=now_iso,
            extracted_fields=[
                {"id": "f31", "document_id": "doc-301", "field_name": "waybill_number", "label": "Waybill Serial", "value": "WB-2024-9901", "confidence": 0.96, "page_number": 1, "extraction_source": "seed_demo"},
                {"id": "f32", "document_id": "doc-301", "field_name": "entity_name", "label": "Entity", "value": "Apex Logistics LLC", "confidence": 0.94, "page_number": 1, "extraction_source": "seed_demo"}
            ]
        ),
        EvidenceDocument(
            id="doc-302",
            batch_id="batch-003",
            title="Scale Record",
            document_type="weighbridge_record",
            file_name="SCALE-TICKET-FEB14.jpg",
            upload_timestamp=now_iso,
            extracted_fields=[
                {"id": "f33", "document_id": "doc-302", "field_name": "net_weight", "label": "Scale Weight", "value": 11200, "unit": "kg", "confidence": 0.97, "page_number": 1, "extraction_source": "seed_demo"}
            ]
        )
    ]
    s3, mb3, r3, m3, f3 = run_verification(b3_input, docs_3)
    b3 = BatchResponse(
        id="batch-003",
        batch_number=b3_input.batch_number,
        category=b3_input.category,
        claimed_quantity=b3_input.claimed_quantity,
        unit=b3_input.unit,
        recycler_name=b3_input.recycler_name,
        recycler_registration_id=b3_input.recycler_registration_id,
        collection_date=b3_input.collection_date,
        processing_date=b3_input.processing_date,
        origin_location=b3_input.origin_location,
        destination_location=b3_input.destination_location,
        status=s3,
        mass_balance=mb3,
        risk_score=r3,
        material_estimate=m3,
        documents=docs_3,
        findings=f3,
        created_at=now_iso,
        updated_at=now_iso,
    )
    out.append(b3)
    return out
