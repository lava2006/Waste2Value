import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.schemas.batch import EwasteCategory, DocumentType

client = TestClient(app)

@pytest.fixture(autouse=True)
def clean_db():
    from app.api.routes import repo
    repo.reset_db()

def test_root_and_health():
    res = client.get("/")
    assert res.status_code == 200
    data = res.json()
    assert "Waste2Value" in data["service"]

    health_res = client.get("/api/health")
    assert health_res.status_code == 200
    h_data = health_res.json()
    assert h_data["status"] == "healthy"

def test_list_and_get_batches():
    res = client.get("/api/batches")
    assert res.status_code == 200
    batches = res.json()
    assert len(batches) >= 3

    # Check that Scenario A exists
    b1 = next((b for b in batches if b["batch_number"] == "BATCH-2025-001"), None)
    assert b1 is not None
    assert b1["status"] == "SUPPORTED"
    assert b1["claimed_quantity"] == 5000.0

    # Get by ID
    get_res = client.get(f"/api/batches/{b1['id']}")
    assert get_res.status_code == 200
    assert get_res.json()["batch_number"] == "BATCH-2025-001"

def test_create_and_verify_new_batch():
    batch_payload = {
        "batch_number": "BATCH-TEST-9999",
        "category": "it_telecom",
        "claimed_quantity": 4000.0,
        "unit": "kg",
        "recycler_name": "SolarSun Circular Systems",
        "recycler_registration_id": "REG-2024-SOLAR-01",
        "collection_date": "2025-04-01",
        "processing_date": "2025-04-05",
        "origin_location": "Freiburg Solar Park",
        "destination_location": "Stuttgart PV Center",
        "notes": "Automated API Test Consignment"
    }

    create_res = client.post("/api/batches", json=batch_payload)
    assert create_res.status_code == 201
    created = create_res.json()
    b_id = created["id"]
    assert created["batch_number"] == "BATCH-TEST-9999"

    # Add evidence document
    doc_payload = {
        "id": f"doc-test-{b_id}",
        "batch_id": b_id,
        "title": "Weighbridge Delivery Ticket",
        "document_type": "weighbridge_record",
        "file_name": "WB-SOLAR-9999.pdf",
        "upload_timestamp": "2025-04-01T12:00:00Z",
        "extracted_fields": [
            {
                "id": f"f-{b_id}-1",
                "document_id": f"doc-test-{b_id}",
                "field_name": "net_weight",
                "label": "Net Weight",
                "value": "3950",
                "unit": "kg",
                "confidence": 0.98,
                "page_number": 1
            }
        ]
    }
    doc_res = client.post(f"/api/batches/{b_id}/documents", json=doc_payload)
    assert doc_res.status_code == 201

    # Verify batch
    verify_res = client.post(f"/api/batches/{b_id}/verify")
    assert verify_res.status_code == 200
    v_data = verify_res.json()
    assert v_data["batch_id"] == b_id
    assert v_data["mass_balance"]["discrepancy_kg"] == 50.0

def test_passport_lifecycle_and_public_verification():
    # Scenario A should be eligible for passport issuance
    b1_res = client.get("/api/batches/batch-001")
    assert b1_res.status_code == 200

    issue_res = client.post("/api/batches/batch-001/passport")
    assert issue_res.status_code == 200
    passport = issue_res.json()
    p_id = passport["passport_id"]
    assert p_id.startswith("PASSPORT-") or p_id.startswith("W2V-CP-")
    assert len(passport["sha256_hash"]) == 64
    assert passport["signature_status"] in ["VALID_AWS_KMS_SIGNATURE", "DEMO_SIMULATED_KMS_SIGNATURE"]

    # Public verification
    pub_res = client.get(f"/api/verify/{p_id}")
    assert pub_res.status_code == 200
    pub_data = pub_res.json()
    assert pub_data["passport_id"] == p_id
    assert pub_data["integrity_status"] == "VALID"
    assert pub_data["revoked"] is False
    assert "kms_key_arn" in pub_data
    assert "cryptographic_guarantees" in pub_data

    # Issue on Borderline Batch (batch-002) must fail
    bad_res = client.post("/api/batches/batch-002/passport")
    assert bad_res.status_code == 400
    assert "REVIEW_REQUIRED" in bad_res.json()["detail"] or "Must be 'SUPPORTED'" in bad_res.json()["detail"]

    # Revoke passport
    rev_res = client.post(f"/api/passports/{p_id}/revoke", json={"reason": "Auditor identified post-closure discrepancy."})
    assert rev_res.status_code == 200

    # Public verify should now reflect REVOKED
    pub_rev_res = client.get(f"/api/verify/{p_id}")
    assert pub_rev_res.status_code == 200
    assert pub_rev_res.json()["integrity_status"] == "REVOKED"
    assert pub_rev_res.json()["revoked"] is True

def test_auditor_decision_workflow():
    # Scenario C has discrepancies; automated status is REVIEW_REQUIRED
    b3_res = client.get("/api/batches/batch-003")
    assert b3_res.status_code == 200
    b3 = b3_res.json()
    assert b3["status"] == "REVIEW_REQUIRED"

    # Authorized compliance auditor issues explicit documented REJECTION
    decision_payload = {
        "decision": "REJECTED",
        "reason": "Auditor confirmed fraudulent waybill serial collision and negative chronological timeline (-39 days).",
        "auditor_id": "AUDITOR-EU-882"
    }
    dec_res = client.post("/api/batches/batch-003/decision", json=decision_payload)
    assert dec_res.status_code == 200
    updated_b3 = dec_res.json()
    assert updated_b3["status"] == "REJECTED"
    assert updated_b3["auditor_decision"]["auditor_id"] == "AUDITOR-EU-882"
    assert updated_b3["explicit_rejection_reason"] is not None

