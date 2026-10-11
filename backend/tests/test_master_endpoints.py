import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.repositories.dynamodb_repo import DynamoDBRepository
from app.passports.kms_signer import KMSSigner
from app.schemas.batch import (
    BatchCreate,
    BatchResponse,
    EvidenceDocument,
    DocumentType,
    ExtractedField,
    EwasteCategory,
    VerificationStatus,
    RiskScore,
    RiskScoreBreakdown,
    RiskLevel,
    MassBalance,
    MaterialEstimate,
    CircularPathway,
)

client = TestClient(app)

def test_root_health_and_ready():
    """Verify both root-level and api-level health and ready probes."""
    r_health_root = client.get("/health")
    assert r_health_root.status_code == 200
    assert r_health_root.json()["status"] == "healthy"

    r_ready_root = client.get("/ready")
    assert r_ready_root.status_code == 200
    assert r_ready_root.json()["status"] == "ready"

    r_health_api = client.get("/api/health")
    assert r_health_api.status_code == 200
    assert r_health_api.json()["status"] == "healthy"

    r_ready_api = client.get("/api/ready")
    assert r_ready_api.status_code == 200
    assert r_ready_api.json()["status"] == "ready"

def test_batch_patch_metadata():
    """Verify PATCH /api/batches/{id} updates notes and records timeline audit."""
    batches = client.get("/api/batches").json()
    assert len(batches) > 0
    target_id = batches[0]["id"]

    patch_res = client.patch(
        f"/api/batches/{target_id}",
        json={"notes": "Audited and verified by ISO compliance team."},
    )
    assert patch_res.status_code == 200
    updated = patch_res.json()
    assert updated["notes"] == "Audited and verified by ISO compliance team."

    # Verify timeline event added
    history_res = client.get(f"/api/batches/{target_id}/history")
    assert history_res.status_code == 200
    timeline = history_res.json()
    assert any("Batch Consignment Attributes Updated" in t["action"] for t in timeline)

def test_document_lookup_and_extraction():
    """Verify GET /api/documents/{id} and POST /api/documents/{id}/extract."""
    batches = client.get("/api/batches").json()
    doc_id = None
    for b in batches:
        if b["documents"]:
            doc_id = b["documents"][0]["id"]
            break
    assert doc_id is not None

    # GET document
    doc_res = client.get(f"/api/documents/{doc_id}")
    assert doc_res.status_code == 200
    doc = doc_res.json()
    assert doc["id"] == doc_id
    assert doc["file_name"] != ""

    # POST extract document
    extract_res = client.post(f"/api/documents/{doc_id}/extract")
    assert extract_res.status_code == 200
    extracted = extract_res.json()
    assert extracted["status"] == "extracted"
    assert len(extracted["extracted_fields"]) > 0

def test_field_audit_correction():
    """Verify PATCH /api/documents/{id}/fields updates value, logs audit event, and re-verifies."""
    batches = client.get("/api/batches").json()
    target_doc = None
    target_field = None
    for b in batches:
        for d in b["documents"]:
            if d["extracted_fields"]:
                target_doc = d
                target_field = d["extracted_fields"][0]
                break
        if target_doc:
            break
    assert target_doc is not None
    assert target_field is not None

    correct_res = client.patch(
        f"/api/documents/{target_doc['id']}/fields",
        json={
            "field_id": target_field["id"],
            "corrected_value": 4999.0,
            "reason": "Auditor verified original physical scale certificate stamp.",
            "auditor_id": "CHIEF-AUDITOR-99",
        },
    )
    assert correct_res.status_code == 200
    updated_doc = correct_res.json()
    matched = [f for f in updated_doc["extracted_fields"] if f["id"] == target_field["id"]][0]
    assert matched["value"] == 4999.0
    assert matched["confidence"] == 1.0

def test_batch_material_estimation():
    """Verify POST /api/batches/{id}/estimate and GET /api/batches/{id}/estimate."""
    batches = client.get("/api/batches").json()
    target_id = batches[0]["id"]

    est_post = client.post(f"/api/batches/{target_id}/estimate")
    assert est_post.status_code == 200
    est_data = est_post.json()
    assert est_data["net_estimated_recovery_value_usd"] > 0
    assert len(est_data["fractions"]) > 0
    assert est_data["currency"] == "USD"

    est_get = client.get(f"/api/batches/{target_id}/estimate")
    assert est_get.status_code == 200
    assert est_get.json()["total_gross_value_usd"] == est_data["total_gross_value_usd"]

def test_passport_versions_endpoint():
    """Verify GET /api/passports/{id}/versions."""
    passports = [b["passport"] for b in client.get("/api/batches").json() if b.get("passport")]
    assert len(passports) > 0
    p_id = passports[0]["passport_id"]

    versions_res = client.get(f"/api/passports/{p_id}/versions")
    assert versions_res.status_code == 200
    versions = versions_res.json()
    assert len(versions) >= 1
    assert versions[0]["passport_id"] == p_id
    assert versions[0]["version"] == 1
    assert "sha256_hash" in versions[0]

def test_dynamodb_repository_isolation():
    """Verify DynamoDBRepository adheres to BaseRepository interface in isolation."""
    repo = DynamoDBRepository(table_name="test-table")
    now_iso = "2026-10-11T12:00:00Z"
    dummy_batch = BatchResponse(
        id="batch-test-ddb",
        batch_number="BATCH-DDB-001",
        category=EwasteCategory.IT_TELECOM,
        claimed_quantity=5000.0,
        unit="kg",
        recycler_name="DDB Recycler",
        recycler_registration_id="REG-DDB-1",
        collection_date="2026-10-01",
        processing_date="2026-10-02",
        origin_location="Berlin",
        destination_location="Hamburg",
        status=VerificationStatus.SUPPORTED,
        risk_score=RiskScore(
            overall_score=10,
            risk_level=RiskLevel.LOW,
            summary_explanation="Clean",
            breakdown=RiskScoreBreakdown(),
            calculated_at=now_iso,
        ),
        mass_balance=MassBalance(
            claimed_kg=5000.0,
            transported_kg=5000.0,
            received_kg=4980.0,
            processed_kg=4980.0,
            recovered_kg=4980.0,
            evidence_supported_kg=4980.0,
            discrepancy_kg=20.0,
            loss_percentage=0.4,
            tolerance_percentage=2.0,
            is_within_tolerance=True,
        ),
        material_estimate=MaterialEstimate(
            total_gross_value_usd=10000.0,
            modeled_processing_cost_usd=1000.0,
            net_estimated_recovery_value_usd=9000.0,
            currency="USD",
            recommended_pathway=CircularPathway.MATERIAL_RECOVERY,
            calculated_at=now_iso,
        ),
        created_at=now_iso,
        updated_at=now_iso,
    )

    # Test create and get
    created = repo.create_batch(dummy_batch)
    assert created.id == "batch-test-ddb"
    fetched = repo.get_batch("batch-test-ddb")
    assert fetched is not None
    assert fetched.batch_number == "BATCH-DDB-001"

    # Test list
    batches = repo.list_batches(category="it_telecom")
    assert len(batches) >= 1

    # Test update
    dummy_batch.notes = "Updated in DDB"
    repo.update_batch(dummy_batch.id, dummy_batch)
    refetched = repo.get_batch("batch-test-ddb")
    assert refetched.notes == "Updated in DDB"

def test_kms_signer_and_verification():
    """Verify KMSSigner generates and verifies signatures with tamper detection."""
    signer = KMSSigner()
    test_digest = "6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b"

    sig_b64, status, algo = signer.sign_digest(test_digest)
    assert sig_b64 != ""
    assert algo == "RSASSA_PSS_SHA_256"
    assert status in ["VALID_AWS_KMS_SIGNATURE", "DEMO_SIMULATED_KMS_SIGNATURE"]

    # Verify signature matches original digest
    verify_res = signer.verify_signature(test_digest, sig_b64)
    assert verify_res["valid"] is True

    # Tampered digest must fail verification
    tampered_digest = "0000000000000000000000000000000000000000000000000000000000000000"
    tampered_verify = signer.verify_signature(tampered_digest, sig_b64)
    assert tampered_verify["valid"] is False
