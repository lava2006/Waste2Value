"""
Regression tests for lifecycle-quantity honesty, deterministic findings, independent
passport states, audited corrections and public-verification integrity.
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.batch import (
    BatchCreate,
    EvidenceDocument,
    ExtractedField,
    EwasteCategory,
    DocumentType,
    VerificationStatus,
)
from app.verification.engine import run_verification

client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_db():
    from app.api.routes import repo

    repo.reset_db()


def _batch_input(**overrides):
    base = dict(
        batch_number="BATCH-LC-001",
        category=EwasteCategory.IT_TELECOM,
        claimed_quantity=5000.0,
        unit="kg",
        recycler_name="GreenTech Circular Ltd",
        recycler_registration_id="REG-2024-ENV-8841",
        collection_date="2025-03-10",
        processing_date="2025-03-14",
        origin_location="Munich",
        destination_location="Leipzig",
    )
    base.update(overrides)
    return BatchCreate(**base)


def _doc(doc_id, doc_type, field_name, value, unit="kg", file_name=None):
    return EvidenceDocument(
        id=doc_id,
        batch_id="b",
        title=doc_type.value,
        document_type=doc_type,
        file_name=file_name or f"{doc_id}.pdf",
        upload_timestamp="2025-03-10T00:00:00Z",
        extracted_fields=[
            ExtractedField(
                id=f"{doc_id}-f1",
                document_id=doc_id,
                field_name=field_name,
                label=field_name,
                value=value,
                unit=unit,
            )
        ],
    )


# ---------------------------------------------------------------- lifecycle quantities
def test_no_documents_leaves_every_downstream_stage_unknown():
    status, mb, _risk, mat, findings = run_verification(_batch_input(), [])
    assert mb.claimed_kg == 5000.0
    assert mb.transported_kg is None
    assert mb.received_kg is None
    assert mb.processed_kg is None
    assert mb.recovered_kg is None
    assert mb.evidence_supported_kg is None
    assert mb.discrepancy_kg is None
    assert status == VerificationStatus.REVIEW_REQUIRED
    assert any(f.rule_id == "MB-000" for f in findings)
    # Unknown mass must not be valued as if it were the claim.
    assert mat.is_available is False
    assert mat.basis_kg is None


def test_weighbridge_receipt_does_not_imply_processed_or_recovered():
    docs = [_doc("d1", DocumentType.WEIGHBRIDGE_RECORD, "net_weight", 4920)]
    _status, mb, *_ = run_verification(_batch_input(), docs)
    assert mb.received_kg == 4920.0
    assert mb.processed_kg is None
    assert mb.recovered_kg is None
    assert mb.transported_kg is None
    assert mb.evidence_supported_kg == 4920.0


def test_processed_quantity_only_comes_from_processing_evidence():
    docs = [
        _doc("d1", DocumentType.WEIGHBRIDGE_RECORD, "net_weight", 4960),
        _doc("d2", DocumentType.RECYCLING_CERTIFICATE, "certified_weight", 4920),
    ]
    _status, mb, *_ = run_verification(_batch_input(), docs)
    assert (mb.received_kg, mb.processed_kg) == (4960.0, 4920.0)
    assert mb.evidence_supported_kg == 4920.0  # lowest documented downstream stage


def test_unsupported_unit_on_extracted_field_is_flagged_not_used():
    docs = [_doc("d1", DocumentType.WEIGHBRIDGE_RECORD, "net_weight", 5000, unit="gallons")]
    _status, mb, _r, _m, findings = run_verification(_batch_input(), docs)
    assert mb.received_kg is None
    assert any(f.rule_id == "UN-001" for f in findings)


def test_finding_ids_are_deterministic_and_unique():
    docs = [
        _doc("dx", DocumentType.TRANSPORT_WAYBILL, "waybill_number", "WB-2024-9901"),
        _doc("dy", DocumentType.WEIGHBRIDGE_RECORD, "net_weight", 11200),
    ]
    docs[0].extracted_fields.append(
        ExtractedField(id="dx-f2", document_id="dx", field_name="entity_name", label="Entity", value="Other LLC")
    )
    ids_a = [f.id for f in run_verification(_batch_input(), docs)[4]]
    ids_b = [f.id for f in run_verification(_batch_input(), docs)[4]]
    assert ids_a == ids_b
    assert len(ids_a) == len(set(ids_a))


# ---------------------------------------------------------------- input validation
@pytest.mark.parametrize(
    "override",
    [
        {"claimed_quantity": 0},
        {"claimed_quantity": -5},
        {"unit": "gallons"},
        {"collection_date": "not-a-date"},
        {"recycler_name": "   "},
    ],
)
def test_invalid_batch_input_rejected_with_422(override):
    payload = {
        "batch_number": "BATCH-VAL-1",
        "category": "it_telecom",
        "claimed_quantity": 100,
        "unit": "kg",
        "recycler_name": "R",
        "recycler_registration_id": "REG-1",
        "collection_date": "2025-01-01",
        "processing_date": "2025-01-02",
        "origin_location": "A",
        "destination_location": "B",
    }
    payload.update(override)
    assert client.post("/api/batches", json=payload).status_code == 422


def test_pending_processing_date_is_valid_input():
    payload = {
        "batch_number": "BATCH-PEND-1",
        "category": "it_telecom",
        "claimed_quantity": 100,
        "unit": "kg",
        "recycler_name": "R",
        "recycler_registration_id": "REG-1",
        "collection_date": "2025-01-01",
        "processing_date": "",
        "origin_location": "A",
        "destination_location": "B",
    }
    res = client.post("/api/batches", json=payload)
    assert res.status_code == 201
    assert res.json()["mass_balance"]["received_kg"] is None


def test_patching_dates_triggers_reverification():
    created = client.post(
        "/api/batches",
        json={
            "batch_number": "BATCH-PATCH-1",
            "category": "it_telecom",
            "claimed_quantity": 100,
            "unit": "kg",
            "recycler_name": "R",
            "recycler_registration_id": "REG-1",
            "collection_date": "2025-01-10",
            "processing_date": "2025-01-12",
            "origin_location": "A",
            "destination_location": "B",
        },
    ).json()
    assert not any(f["rule_id"] == "TL-001" for f in created["findings"])
    patched = client.patch(f"/api/batches/{created['id']}", json={"processing_date": "2025-01-01"}).json()
    assert any(f["rule_id"] == "TL-001" for f in patched["findings"])


# ---------------------------------------------------------------- passport lifecycle independence
def test_revocation_does_not_change_documentary_status_or_integrity():
    before = client.get("/api/batches/batch-001").json()
    assert before["status"] == "SUPPORTED"
    pid = before["passport"]["passport_id"]

    pre = client.get(f"/api/verify/{pid}").json()
    assert pre["payload_integrity"]["status"] == "VALID"
    assert pre["lifecycle_status"] == "ACTIVE"

    rev = client.post(f"/api/passports/{pid}/revoke", json={"reason": "post-closure discrepancy"})
    assert rev.status_code == 200
    assert rev.json()["documentary_status_unchanged"] == "SUPPORTED"

    after = client.get("/api/batches/batch-001").json()
    assert after["status"] == "SUPPORTED"
    assert after["passport"]["revoked"] is True
    assert after["passport"]["integrity_status"] == "VALID"

    post = client.get(f"/api/verify/{pid}").json()
    assert post["payload_integrity"]["status"] == "VALID"  # intact payload, still revoked
    assert post["lifecycle_status"] == "REVOKED"
    assert post["documentary_status"] == "SUPPORTED"
    assert post["revoked_at"]


def test_repeated_and_blank_revocations_are_rejected():
    pid = "W2V-CP-0001"
    assert client.post(f"/api/passports/{pid}/revoke", json={"reason": "  "}).status_code == 422
    assert client.post(f"/api/passports/{pid}/revoke", json={"reason": "first"}).status_code == 200
    assert client.post(f"/api/passports/{pid}/revoke", json={"reason": "second"}).status_code == 409
    assert client.post("/api/passports/W2V-CP-NOPE/revoke", json={"reason": "x"}).status_code == 404


def test_revoked_passport_is_not_silently_reissued():
    client.post("/api/passports/W2V-CP-0001/revoke", json={"reason": "revoked"})
    assert client.post("/api/batches/batch-001/passport").status_code == 409


def test_signature_is_never_reported_valid_when_simulated():
    res = client.get("/api/verify/W2V-CP-0001").json()
    assert res["signature"]["status"] == "SIMULATED"
    assert res["signature"]["status"] != "VALID"


def test_seed_passport_hash_matches_recomputed_payload():
    res = client.get("/api/verify/W2V-CP-0001").json()
    assert res["payload_integrity"]["stored_sha256"] == res["payload_integrity"]["recomputed_sha256"]


def test_stored_passport_modification_is_detected():
    from app.api.routes import repo

    passport = repo.get_passport("W2V-CP-0001")
    passport.evidence_supported_kg = passport.evidence_supported_kg + 500
    repo.save_passport(passport)
    res = client.get("/api/verify/W2V-CP-0001").json()
    assert res["payload_integrity"]["status"] == "INVALID"


def test_tamper_demo_never_mutates_the_issued_passport():
    before = client.get("/api/verify/W2V-CP-0001").json()
    demo = client.post("/api/verify/W2V-CP-0001/tamper-demo").json()
    assert demo["demonstration"] is True
    assert demo["persisted"] is False
    assert demo["integrity_check"] == "INVALID"
    assert demo["altered_payload_sha256"] != demo["stored_sha256"]
    after = client.get("/api/verify/W2V-CP-0001").json()
    assert after["payload_integrity"]["status"] == "VALID"
    assert after["sha256_hash"] == before["sha256_hash"]


def test_unknown_passport_public_verify():
    res = client.get("/api/verify/DOES-NOT-EXIST")
    assert res.status_code == 200
    assert res.json()["verification_status"] == "NOT_FOUND"


def test_issued_passport_ids_do_not_collide():
    from app.api.routes import repo
    from app.passports.canonical import create_circularity_passport

    batch = repo.get_batch("batch-001")
    ids = {create_circularity_passport(batch)[2].passport_id for _ in range(20)}
    assert len(ids) == 20


# ---------------------------------------------------------------- audit decisions & corrections
def test_decision_endpoint_rejects_non_decision_statuses():
    for bad in ("REVOKED", "PROCESSING", "NOT_VERIFIED"):
        res = client.post("/api/batches/batch-002/decision", json={"decision": bad, "reason": "x"})
        assert res.status_code == 422
    assert client.post("/api/batches/batch-002/decision", json={"decision": "REJECTED", "reason": "  "}).status_code == 422


def test_explicit_decision_survives_reverification():
    client.post("/api/batches/batch-003/decision", json={"decision": "REJECTED", "reason": "fraud confirmed"})
    report = client.post("/api/batches/batch-003/verify").json()
    assert report["status"] == "REJECTED"
    batch = client.get("/api/batches/batch-003").json()
    assert batch["status"] == "REJECTED"
    # historical findings are still reported alongside the decision
    assert batch["findings"]


def _first_correctable(batch_id="batch-002"):
    batch = client.get(f"/api/batches/{batch_id}").json()
    doc = next(d for d in batch["documents"] if d["extracted_fields"])
    return batch, doc, doc["extracted_fields"][0]


def test_field_correction_preserves_original_and_reverifies():
    batch, doc, field = _first_correctable("batch-002")
    original = field["value"]
    res = client.patch(
        f"/api/documents/{doc['id']}/fields",
        json={"field_id": field["id"], "corrected_value": 11900.0, "reason": "checked against scale slip", "auditor_id": "A-1"},
    )
    assert res.status_code == 200
    fixed = next(f for f in res.json()["extracted_fields"] if f["id"] == field["id"])
    assert fixed["is_corrected"] is True
    assert fixed["original_value"] == original
    assert fixed["correction_reason"] == "checked against scale slip"
    assert fixed["corrected_by"] == "A-1"
    assert fixed["corrected_at"]

    # a second correction keeps the very first extracted value
    res2 = client.patch(
        f"/api/documents/{doc['id']}/fields",
        json={"field_id": field["id"], "corrected_value": 11950.0, "reason": "second pass"},
    )
    again = next(f for f in res2.json()["extracted_fields"] if f["id"] == field["id"])
    assert again["original_value"] == original

    after = client.get("/api/batches/batch-002").json()
    assert any(t["action"] == "Verification Re-run" for t in after["timeline"])
    assert any("Field Value Corrected" in t["action"] for t in after["timeline"])


def test_blank_correction_reason_rejected_and_reextraction_blocked_after_correction():
    _batch, doc, field = _first_correctable("batch-002")
    bad = client.patch(f"/api/documents/{doc['id']}/fields", json={"field_id": field["id"], "corrected_value": 1, "reason": " "})
    assert bad.status_code == 422
    ok = client.patch(f"/api/documents/{doc['id']}/fields", json={"field_id": field["id"], "corrected_value": 1, "reason": "why"})
    assert ok.status_code == 200
    assert client.post(f"/api/documents/{doc['id']}/extract").status_code == 409


def test_duplicate_document_id_rejected():
    batch = client.get("/api/batches/batch-001").json()
    existing = batch["documents"][0]
    assert client.post("/api/batches/batch-001/documents", json=existing).status_code == 409


def test_estimate_endpoint_does_not_substitute_claim_for_unknown_mass():
    payload = {
        "batch_number": "BATCH-EST-1",
        "category": "it_telecom",
        "claimed_quantity": 9000,
        "unit": "kg",
        "recycler_name": "R",
        "recycler_registration_id": "REG-1",
        "collection_date": "2025-01-01",
        "processing_date": "2025-01-05",
        "origin_location": "A",
        "destination_location": "B",
    }
    created = client.post("/api/batches", json=payload).json()
    est = client.post(f"/api/batches/{created['id']}/estimate").json()
    assert est["is_available"] is False
    assert est["basis_kg"] is None
