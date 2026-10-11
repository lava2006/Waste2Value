"""
AWS adapter tests run against moto (in-process AWS emulation): DynamoDB repository in strict
mode, KMS asymmetric signing/verification, and the public-verify pillars with a real (emulated)
KMS signature. No real AWS account is touched.
"""
import os

import boto3
import pytest
from fastapi.testclient import TestClient
from moto import mock_aws

from app.schemas.batch import VerificationStatus


@pytest.fixture
def aws(monkeypatch):
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")
    monkeypatch.setenv("AWS_REGION", "us-east-1")
    with mock_aws():
        ddb = boto3.client("dynamodb", region_name="us-east-1")
        ddb.create_table(
            TableName="w2v-test",
            BillingMode="PAY_PER_REQUEST",
            AttributeDefinitions=[{"AttributeName": n, "AttributeType": "S"} for n in ("PK", "SK", "GSI1PK", "GSI1SK")],
            KeySchema=[{"AttributeName": "PK", "KeyType": "HASH"}, {"AttributeName": "SK", "KeyType": "RANGE"}],
            GlobalSecondaryIndexes=[
                {
                    "IndexName": "GSI1",
                    "KeySchema": [{"AttributeName": "GSI1PK", "KeyType": "HASH"}, {"AttributeName": "GSI1SK", "KeyType": "RANGE"}],
                    "Projection": {"ProjectionType": "ALL"},
                }
            ],
        )
        kms = boto3.client("kms", region_name="us-east-1")
        key = kms.create_key(KeySpec="RSA_4096", KeyUsage="SIGN_VERIFY")["KeyMetadata"]["Arn"]
        yield {"key_arn": key}


def _repo():
    from app.repositories.dynamodb_repo import DynamoDBRepository

    return DynamoDBRepository(table_name="w2v-test", region_name="us-east-1", strict=True)


def test_strict_mode_fails_fast_when_table_missing(aws):
    from app.repositories.dynamodb_repo import DynamoDBRepository

    with pytest.raises(RuntimeError, match="not reachable"):
        DynamoDBRepository(table_name="does-not-exist", region_name="us-east-1", strict=True)


def test_dynamodb_repository_round_trip_in_aws_mode(aws):
    repo = _repo()
    assert repo.is_connected_to_aws
    repo.reset_db()

    batches = repo.list_batches()
    assert {b.batch_number for b in batches} == {"BATCH-2025-001", "BATCH-2025-002", "BATCH-2025-003"}

    by_id = repo.get_batch("batch-002")
    by_number = repo.get_batch("BATCH-2025-002")
    assert by_id and by_number and by_id.id == by_number.id

    assert [b.batch_number for b in repo.list_batches(status="SUPPORTED")] == ["BATCH-2025-001"]
    assert [b.batch_number for b in repo.list_batches(category="large_appliances")] == ["BATCH-2025-003"]
    assert len(repo.list_batches(risk_level="high")) == 1

    # unknown values survive the JSON round trip as null, never 0
    assert by_id.mass_balance.processed_kg is None

    assert repo.get_passport("W2V-CP-0001") is not None
    assert repo.get_batch("nope") is None


def test_update_orders_by_recency_and_add_document_reverifies(aws):
    from app.schemas.batch import EvidenceDocument, ExtractedField

    repo = _repo()
    repo.reset_db()
    b = repo.get_batch("batch-003")
    b.notes = "touched"
    repo.update_batch(b.id, b)
    assert repo.list_batches()[0].id == "batch-003"

    doc = EvidenceDocument(
        id="doc-new",
        batch_id="batch-002",
        title="Certificate",
        document_type="recycling_certificate",
        file_name="cert.pdf",
        upload_timestamp="2025-04-01T00:00:00Z",
        extracted_fields=[ExtractedField(id="f", document_id="doc-new", field_name="certified_weight", label="w", value=8000, unit="kg")],
    )
    repo.add_document("batch-002", doc)
    after = repo.get_batch("batch-002")
    assert after.mass_balance.processed_kg == 8000.0
    assert any(t.action == "Verification Re-run" for t in after.timeline)


def test_revocation_is_independent_of_batch_status(aws):
    repo = _repo()
    repo.reset_db()
    assert repo.revoke_passport("W2V-CP-0001", "reason") is True
    batch = repo.get_batch("batch-001")
    assert batch.status == VerificationStatus.SUPPORTED
    assert batch.passport.revoked is True and batch.passport.integrity_status == "VALID"
    with pytest.raises(ValueError):
        repo.revoke_passport("W2V-CP-0001", "again")
    assert repo.revoke_passport("missing", "x") is False


def test_factory_selects_dynamodb_only_when_configured(aws, monkeypatch):
    from app.repositories.factory import get_repository
    from app.repositories.dynamodb_repo import DynamoDBRepository

    monkeypatch.setenv("REPOSITORY", "dynamodb")
    monkeypatch.setenv("REGISTRY_TABLE", "w2v-test")
    repo = get_repository()
    assert isinstance(repo, DynamoDBRepository)
    assert len(repo.list_batches()) == 3  # seeded on first start


def test_kms_signing_yields_valid_public_verification(aws, monkeypatch):
    """Real asymmetric sign + verify (via moto) makes the signature pillar report VALID."""
    import app.api.routes as routes
    import app.passports.canonical as canonical
    from app.passports.kms_signer import KMSSigner
    from app.main import app

    monkeypatch.setenv("SIGNING", "kms")
    signer = KMSSigner(key_arn=aws["key_arn"], region_name="us-east-1")
    assert signer.is_live_kms_active
    monkeypatch.setattr(canonical, "kms_signer", signer)
    monkeypatch.setattr(routes, "kms_signer", signer)

    repo = _repo()
    repo.reset_db()
    monkeypatch.setattr(routes, "repo", repo)
    client = TestClient(app)

    # batch-001 already carries a seeded (unsigned/simulated) passport; issue a fresh signed one
    batch = repo.get_batch("batch-001")
    batch.passport = None
    repo.update_batch(batch.id, batch)

    issued = client.post("/api/batches/batch-001/passport")
    assert issued.status_code == 200
    passport = issued.json()
    assert passport["signature_status"] == "VALID_AWS_KMS_SIGNATURE"
    assert passport["digital_signature_base64"]

    pub = client.get(f"/api/verify/{passport['passport_id']}").json()
    assert pub["payload_integrity"]["status"] == "VALID"
    assert pub["signature"]["status"] == "VALID"
    assert pub["signature"]["provider"] == "AWS_KMS_LIVE"

    # a signature over a different digest must not verify
    bad = signer.verify_signature("0" * 64, passport["digital_signature_base64"])
    assert bad["valid"] is False


def test_kms_strict_mode_refuses_to_run_without_aws(monkeypatch):
    from app.passports.kms_signer import KMSSigner

    for var in ("AWS_ACCESS_KEY_ID", "AWS_PROFILE", "AWS_ROLE_ARN", "AWS_LAMBDA_FUNCTION_NAME"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.delenv("SIGNING", raising=False)
    signer = KMSSigner()
    assert signer.is_live_kms_active is False  # default: explicit simulated mode
    status = signer.sign_digest("ab" * 32)[1]
    assert status == "DEMO_SIMULATED_KMS_SIGNATURE"
