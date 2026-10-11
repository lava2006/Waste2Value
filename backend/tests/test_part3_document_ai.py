import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.schemas.batch import DocumentType, EwasteCategory, Severity
from app.extraction.demo import DemoExtractionProvider
from app.investigation.agent import InvestigatorAgent
from app.investigation.multimodal import MultimodalPhotoAnalyzer
from app.repositories.sqlite_repo import SQLiteRepository

client = TestClient(app)

def test_demo_extraction_provider():
    extractor = DemoExtractionProvider()

    # Extract Waybill
    doc_wb = extractor.extract_document(
        file_name="WB-2025-4421.pdf",
        document_type=DocumentType.TRANSPORT_WAYBILL,
        batch_id="batch-001",
    )
    assert doc_wb.document_type == DocumentType.TRANSPORT_WAYBILL
    assert len(doc_wb.extracted_fields) >= 3
    # Check bounding box
    f_wb = next(f for f in doc_wb.extracted_fields if f.field_name == "waybill_number")
    assert f_wb.bounding_box is not None
    assert f_wb.bounding_box.top > 0
    assert f_wb.confidence >= 0.95

    # Extract Weighbridge Record
    doc_scale = extractor.extract_document(
        file_name="WBR-2025-9912.png",
        document_type=DocumentType.WEIGHBRIDGE_RECORD,
        batch_id="batch-001",
    )
    assert doc_scale.document_type == DocumentType.WEIGHBRIDGE_RECORD
    f_net = next(f for f in doc_scale.extracted_fields if f.field_name == "net_weight")
    assert f_net.value == 4960.0

def test_investigator_agent_grounded_reporting():
    repo = SQLiteRepository()
    b1 = repo.get_batch("batch-001")
    assert b1 is not None

    agent = InvestigatorAgent()
    report1 = agent.investigate(b1)
    assert report1.overall_status == b1.status
    assert "ELIGIBLE" in report1.passport_recommendation
    assert "100% documentary reconciliation" in report1.executive_summary

    # Investigate Scenario B (borderline)
    b2 = repo.get_batch("batch-002")
    assert b2 is not None
    report2 = agent.investigate(b2)
    assert "PAUSED" in report2.passport_recommendation
    assert len(report2.auditor_questions) > 0
    q = report2.auditor_questions[0]
    assert "Weighmaster" in q.target_entity
    assert "3,500" in q.question or "deficit" in q.rationale.lower()

def test_multimodal_photo_analyzer():
    analyzer = MultimodalPhotoAnalyzer()

    # Clean matching photo
    res_clean = analyzer.analyze_photo(
        file_name="server_rack_delivery.jpg",
        claimed_category=EwasteCategory.IT_TELECOM,
    )
    assert res_clean.category_match is True
    assert res_clean.contamination_detected is False

    # Hazard: Lithium batteries in large appliances lot
    res_hazard = analyzer.analyze_photo(
        file_name="battery_cell_hazard.jpg",
        claimed_category=EwasteCategory.LARGE_APPLIANCES,
    )
    assert res_hazard.category_match is False
    assert res_hazard.contamination_detected is True
    assert any(f.rule_id == "VIS-001" and f.severity == Severity.CRITICAL for f in res_hazard.findings)

def test_part3_api_endpoints():
    # Test /api/extract
    ext_res = client.post("/api/extract", json={
        "file_name": "WB-2025-4421.pdf",
        "document_type": "transport_waybill",
        "batch_id": "batch-001"
    })
    assert ext_res.status_code == 200
    ext_data = ext_res.json()
    assert ext_data["file_name"] == "WB-2025-4421.pdf"
    assert len(ext_data["extracted_fields"]) >= 3

    # Test /api/batches/{id}/investigation
    inv_res = client.get("/api/batches/batch-001/investigation")
    assert inv_res.status_code == 200
    inv_data = inv_res.json()
    assert inv_data["batch_number"] == "BATCH-2025-001"
    assert "ELIGIBLE" in inv_data["passport_recommendation"]

    # Test /api/analyze-photo
    photo_res = client.post("/api/analyze-photo", json={
        "file_name": "lithium_battery_cells_scrap.jpg",
        "claimed_category": "large_appliances"
    })
    assert photo_res.status_code == 200
    photo_data = photo_res.json()
    assert photo_data["contamination_detected"] is True
    assert photo_data["category_match"] is False
