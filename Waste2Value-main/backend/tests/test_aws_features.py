"""Textract parsing, S3 evidence storage, Bedrock investigator, auth gate and integrations status."""
import json

import boto3
import pytest
from fastapi.testclient import TestClient
from moto import mock_aws

import app.main  # noqa: F401  (import app first so module-level signers are built without fake test credentials)

from app.extraction.textract import (
    canonical_field_name,
    parse_number,
    parse_textract_blocks,
    parse_unit,
)


# ----------------------------------------------------------------------------- Textract parsing
def _word(i, text):
    return {"Id": i, "BlockType": "WORD", "Text": text}


def _kv(key_id, val_id, key_words, val_words, conf=97.0, box=None):
    box = box or {"Top": 0.4, "Left": 0.5, "Width": 0.2, "Height": 0.05}
    return [
        {"Id": key_id, "BlockType": "KEY_VALUE_SET", "EntityTypes": ["KEY"], "Confidence": conf,
         "Relationships": [{"Type": "VALUE", "Ids": [val_id]}, {"Type": "CHILD", "Ids": [w["Id"] for w in key_words]}]},
        {"Id": val_id, "BlockType": "KEY_VALUE_SET", "EntityTypes": ["VALUE"], "Confidence": conf - 3, "Page": 1,
         "Geometry": {"BoundingBox": box}, "Relationships": [{"Type": "CHILD", "Ids": [w["Id"] for w in val_words]}]},
    ] + key_words + val_words


def test_parses_weighbridge_ticket_with_real_geometry_and_confidence():
    kw = [_word("k1", "Net"), _word("k2", "Weight:")]
    vw = [_word("v1", "4,960"), _word("v2", "kg")]
    tk = [_word("k3", "Ticket"), _word("k4", "No")]
    tv = [_word("v3", "WBR-2025-9912")]
    blocks = _kv("K1", "V1", kw, vw) + _kv("K2", "V2", tk, tv) + [{"Id": "L1", "BlockType": "LINE", "Text": "SCALE TICKET"}]
    fields, snippet = parse_textract_blocks(blocks, "doc-x")
    by_name = {f.field_name: f for f in fields}
    assert by_name["net_weight"].value == 4960.0 and by_name["net_weight"].unit == "kg"
    assert by_name["net_weight"].extraction_source == "textract"
    assert by_name["net_weight"].bounding_box.left == 50.0
    assert by_name["net_weight"].confidence == pytest.approx(0.94, abs=0.001)  # min(key, value) confidence
    assert by_name["ticket_number"].value == "WBR-2025-9912"
    assert snippet == "SCALE TICKET"


def test_unreadable_weight_is_dropped_not_zeroed():
    blocks = _kv("K1", "V1", [_word("k1", "Net"), _word("k2", "Weight")], [_word("v1", "illegible")])
    fields, _ = parse_textract_blocks(blocks, "d")
    assert fields == []


def test_number_unit_and_key_mapping_helpers():
    assert parse_number("4,960 kg") == 4960.0
    assert parse_number("4.960,5") == 4960.5
    assert parse_number("12,5 t") == 12.5
    assert parse_number("n/a") is None
    assert parse_unit("5.2 tonnes") == "metric_ton" and parse_unit("90 lbs") == "lb" and parse_unit("12") is None
    assert canonical_field_name("Certified Weight:") == "certified_weight"
    assert canonical_field_name("Declared weight") == "manifest_weight"
    assert canonical_field_name("Waybill No.") == "waybill_number"
    assert canonical_field_name("Driver Name") == "driver_name"


# ----------------------------------------------------------------------------- S3 evidence
@pytest.fixture
def s3env(monkeypatch):
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")
    monkeypatch.setenv("EVIDENCE_BUCKET", "w2v-evidence-test")
    with mock_aws():
        boto3.client("s3", region_name="us-east-1").create_bucket(Bucket="w2v-evidence-test")
        yield


@pytest.fixture
def client():
    from app.api.routes import repo
    from app.main import app

    repo.reset_db()
    return TestClient(app)


def test_presigned_upload_is_restricted_and_download_url_works(s3env, client):
    res = client.post("/api/batches/batch-001/documents/upload-url", json={"file_name": "Scale Ticket (1).PDF", "size": 2048})
    assert res.status_code == 200
    body = res.json()
    assert body["storage_key"].startswith("evidence/batch-001/") and body["storage_key"].endswith("Scale_Ticket_1_.PDF")
    conditions = json.dumps(body["upload"]["fields"])
    assert "Content-Type" in conditions
    assert body["max_bytes"] == 10 * 1024 * 1024

    assert client.post("/api/batches/batch-001/documents/upload-url", json={"file_name": "x.exe", "size": 10}).status_code == 422
    assert client.post("/api/batches/batch-001/documents/upload-url", json={"file_name": "x.pdf", "size": 11 * 1024 * 1024}).status_code == 422
    assert client.post("/api/batches/nope/documents/upload-url", json={"file_name": "x.pdf", "size": 10}).status_code == 404

    # register a document that points at the (uploaded) object and fetch a presigned GET
    boto3.client("s3", region_name="us-east-1").put_object(Bucket="w2v-evidence-test", Key=body["storage_key"], Body=b"%PDF-1.4")
    doc = {
        "id": body["doc_id"], "batch_id": "batch-001", "title": "Ticket", "document_type": "weighbridge_record",
        "file_name": "ticket.pdf", "upload_timestamp": "2025-04-01T00:00:00Z", "status": "pending",
        "content_stored": True, "storage_key": body["storage_key"], "extracted_fields": [],
    }
    assert client.post("/api/batches/batch-001/documents", json=doc).status_code == 201
    url = client.get(f"/api/documents/{body['doc_id']}/content-url").json()["url"]
    assert "w2v-evidence-test" in url and "Signature" in url or "X-Amz-Signature" in url


def test_upload_without_storage_configured_is_503(monkeypatch, client):
    monkeypatch.delenv("EVIDENCE_BUCKET", raising=False)
    res = client.post("/api/batches/batch-001/documents/upload-url", json={"file_name": "x.pdf", "size": 10})
    assert res.status_code == 503


def test_textract_extraction_requires_a_stored_file(monkeypatch, client):
    monkeypatch.setenv("EXTRACTION", "textract")
    assert client.post("/api/documents/doc-101/extract").status_code == 409


def test_textract_extraction_updates_fields_and_reverifies(monkeypatch, client):
    import app.extraction.textract as tx

    monkeypatch.setenv("EXTRACTION", "textract")
    monkeypatch.setenv("EVIDENCE_BUCKET", "bkt")
    blocks = _kv("K1", "V1", [_word("k1", "Net"), _word("k2", "Weight")], [_word("v1", "9,000"), _word("v2", "kg")])

    class FakeClient:
        def analyze_document(self, Document, FeatureTypes):
            assert Document == {"S3Object": {"Bucket": "bkt", "Name": "evidence/k"}} and FeatureTypes == ["FORMS"]
            return {"Blocks": blocks}

    monkeypatch.setattr(tx.boto3 if hasattr(tx, "boto3") else __import__("boto3"), "client", lambda *a, **k: FakeClient())
    batch = client.get("/api/batches/batch-002").json()
    doc = next(d for d in batch["documents"] if d["document_type"] == "weighbridge_record")
    from app.api.routes import repo
    b = repo.get_batch("batch-002")
    for d in b.documents:
        if d.id == doc["id"]:
            d.storage_key = "evidence/k"
    repo.update_batch(b.id, b)

    res = client.post(f"/api/documents/{doc['id']}/extract")
    assert res.status_code == 200
    assert res.json()["extracted_fields"][0]["extraction_source"] == "textract"
    after = client.get("/api/batches/batch-002").json()
    assert after["mass_balance"]["received_kg"] == 9000.0
    assert any("Re-verified after extraction" in (t.get("note") or "") for t in after["timeline"])


def test_textract_failure_marks_document_failed_and_returns_502(monkeypatch, client):
    monkeypatch.setenv("EXTRACTION", "textract")
    monkeypatch.setenv("EVIDENCE_BUCKET", "bkt")

    class Boom:
        def analyze_document(self, **_):
            raise RuntimeError("throttled")

    monkeypatch.setattr(boto3, "client", lambda *a, **k: Boom())
    from app.api.routes import repo
    b = repo.get_batch("batch-002")
    b.documents[0].storage_key = "evidence/k"
    repo.update_batch(b.id, b)
    res = client.post(f"/api/documents/{b.documents[0].id}/extract")
    assert res.status_code == 502 and "throttled" in res.json()["detail"]
    assert repo.get_batch("batch-002").documents[0].status == "failed"


# ----------------------------------------------------------------------------- Bedrock investigator
def test_bedrock_investigator_is_grounded_and_labelled(monkeypatch):
    from app.investigation.agent import InvestigatorAgent
    from app.repositories.sqlite_repo import SQLiteRepository

    repo = SQLiteRepository()
    repo.reset_db()
    batch = repo.get_batch("batch-002")

    seen = {}

    class FakeBedrock:
        def converse(self, modelId, system, messages, inferenceConfig):
            seen["model"] = modelId
            seen["facts"] = json.loads(messages[0]["content"][0]["text"])
            return {"output": {"message": {"content": [{"text": json.dumps({
                "executive_summary": "Received mass of 8,500 kg is far below the claim.",
                "auditor_questions": [{"target_entity": "Carrier", "question": "Explain the shortfall?", "rationale": "MB-002", "urgency": "warning"}],
            })}]}}}

    agent = InvestigatorAgent(use_bedrock=False)
    agent.use_bedrock = True
    agent._bedrock_client = FakeBedrock()
    report = agent.investigate(batch)
    assert report.executive_summary.startswith("Received mass")
    assert report.auditor_questions[0].target_entity == "Carrier"
    assert "Amazon Bedrock" in report.generated_by
    assert seen["facts"]["received_kg"] == 8500.0 and seen["facts"]["processed_kg"] is None
    assert any(f["rule"] == "MB-002" for f in seen["facts"]["findings"])
    assert report.grounded_citations  # citations still come from stored fields, not the model


def test_bedrock_failure_is_an_error_not_a_silent_fallback(monkeypatch, client):
    from app.api import routes

    class Boom:
        def converse(self, **_):
            raise RuntimeError("AccessDenied")

    monkeypatch.setattr(routes.investigator_agent, "use_bedrock", True)
    monkeypatch.setattr(routes.investigator_agent, "_bedrock_client", Boom())
    res = client.get("/api/batches/batch-001/investigation")
    assert res.status_code == 502 and "AccessDenied" in res.json()["detail"]


def test_deterministic_investigator_is_labelled_as_such(client):
    res = client.get("/api/batches/batch-001/investigation").json()
    assert "no AI model" in res["generated_by"]


# ----------------------------------------------------------------------------- auth + integrations
def test_writes_require_authentication_when_configured(monkeypatch, client):
    monkeypatch.setenv("REQUIRE_AUTH", "true")
    for call in (
        lambda: client.post("/api/batches/batch-002/verify"),
        lambda: client.post("/api/passports/W2V-CP-0001/revoke", json={"reason": "x"}),
        lambda: client.post("/api/batches/batch-002/decision", json={"decision": "REJECTED", "reason": "x"}),
        lambda: client.post("/api/reset"),
    ):
        assert call().status_code == 401
    # public reads stay open
    assert client.get("/api/verify/W2V-CP-0001").status_code == 200
    assert client.get("/api/batches").status_code == 200


def test_authenticated_identity_overrides_client_supplied_label(monkeypatch, client):
    from app.api import routes

    monkeypatch.setenv("REQUIRE_AUTH", "true")
    monkeypatch.setattr(routes, "_authenticated_actor", lambda request: "auditor@example.org")
    res = client.post("/api/batches/batch-002/decision", json={"decision": "REJECTED", "reason": "fraud", "auditor_id": "someone-else"})
    assert res.status_code == 200
    assert res.json()["auditor_decision"]["auditor_id"] == "auditor@example.org"
    last = res.json()["timeline"][-1]
    assert "auditor@example.org (authenticated)" in last["actor"]


def test_integrations_endpoint_reports_truthfully(client):
    data = client.get("/api/integrations").json()
    assert data["repository"] == {"provider": "sqlite", "live_aws": False}
    assert data["signing"]["provider"] == "simulated"
    assert data["extraction"]["provider"] == "simulated"
    assert data["ai"]["provider"] == "deterministic-rules"
    assert data["authentication"]["required"] is False


# ----------------------------------------------------------------------------- Step Functions workflow
def test_workflow_actions_operate_on_the_registry(client, monkeypatch):
    from app import workflow

    monkeypatch.delenv("ALERT_TOPIC_ARN", raising=False)
    # evaluate: seed batch-002 stays REVIEW_REQUIRED; notify without a topic must say nothing was sent
    r = workflow.handler({"Action": "EVALUATE_RULES", "batch_id": "batch-002"})
    assert r["status"] == "REVIEW_REQUIRED"
    n = workflow.handler({"Action": "NOTIFY_AUDITOR", "batch_id": "batch-002"})
    assert n["notified"] is False
    b = client.get("/api/batches/batch-002").json()
    assert any(t["action"] == "Auditor Notified" and "no notification was sent" in t["note"] for t in b["timeline"])
    # extract: nothing stored -> skipped, never fabricated
    e = workflow.handler({"Action": "EXTRACT_EVIDENCE", "batch_id": "batch-002"})
    assert e["extracted"] == 0
    with pytest.raises(ValueError):
        workflow.handler({"Action": "NOPE", "batch_id": "batch-002"})
    with pytest.raises(ValueError):
        workflow.handler({"Action": "EVALUATE_RULES", "batch_id": "missing"})


def test_workflow_publishes_to_sns_and_issues_passports(client, monkeypatch):
    from app import workflow

    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")
    with mock_aws():
        arn = boto3.client("sns", region_name="us-east-1").create_topic(Name="alerts")["TopicArn"]
        monkeypatch.setenv("ALERT_TOPIC_ARN", arn)
        assert workflow.handler({"Action": "NOTIFY_AUDITOR", "batch_id": "batch-003"})["notified"] is True

    # passport issuance only for SUPPORTED batches
    from app.api.routes import repo
    b = repo.get_batch("batch-001")
    b.passport = None
    repo.update_batch(b.id, b)
    out = workflow.handler({"Action": "ISSUE_PASSPORT", "batch_id": "batch-001"})
    assert out["issued"] is True
    with pytest.raises(ValueError, match="SUPPORTED"):
        workflow.handler({"Action": "ISSUE_PASSPORT", "batch_id": "batch-002"})


def test_workflow_endpoints_report_unconfigured_and_validate(client, monkeypatch):
    monkeypatch.delenv("STATE_MACHINE_ARN", raising=False)
    assert client.post("/api/batches/batch-001/workflow").status_code == 503
    assert client.get("/api/workflow/status", params={"execution_arn": "x"}).status_code == 503
    monkeypatch.setenv("STATE_MACHINE_ARN", "arn:aws:states:us-east-1:1:stateMachine:w2v")
    assert client.get("/api/workflow/status", params={"execution_arn": "arn:aws:states:us-east-1:2:execution:other:x"}).status_code == 422
    assert client.post("/api/batches/missing/workflow").status_code == 404
