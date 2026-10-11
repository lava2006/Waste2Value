"""Rekognition OCR + Amazon Nova document reading (the Textract-free path) and the extraction factory."""
import json

import boto3
import pytest
from fastapi.testclient import TestClient

import app.main  # noqa: F401  (import first so module-level signers are built without fake credentials)
from app.extraction import factory
from app.extraction.nova_vision import NovaVisionExtractionProvider, _parse_json, fields_from_pairs
from app.extraction.rekognition import RekognitionExtractionProvider, parse_rekognition_lines


def line(text, top, left=0.05, conf=99.0, w=0.4, h=0.05):
    return {"Type": "LINE", "DetectedText": text, "Confidence": conf, "Geometry": {"BoundingBox": {"Width": w, "Height": h, "Left": left, "Top": top}}}


def word(text):  # WORD detections must be ignored
    return {"Type": "WORD", "DetectedText": text, "Confidence": 99, "Geometry": {"BoundingBox": {"Width": 0.1, "Height": 0.1, "Left": 0.1, "Top": 0.1}}}


# ------------------------------------------------------------------------------ Rekognition parsing
def test_rekognition_pairs_key_value_lines_with_real_confidence_and_geometry():
    dets = [
        line("Operator: GreenTech Circular Ltd", 0.55, conf=97.5),
        line("CERTIFIED SCALE TICKET", 0.05),
        line("Net Weight: 4,960 kg", 0.30, left=0.35, conf=98.2),
        line("Ticket No: WBR-2025-9912", 0.18),
        word("Net"),
    ]
    fields, snippet = parse_rekognition_lines(dets, "doc-x")
    by = {f.field_name: f for f in fields}
    assert snippet.startswith("CERTIFIED SCALE TICKET")
    assert by["net_weight"].value == 4960.0 and by["net_weight"].unit == "kg"
    assert by["net_weight"].confidence == pytest.approx(0.982)
    assert by["net_weight"].bounding_box.left == 35.0 and by["net_weight"].bounding_box.top == 30.0
    assert by["net_weight"].extraction_source == "rekognition"
    assert by["ticket_number"].value == "WBR-2025-9912"
    assert by["entity_name"].value == "GreenTech Circular Ltd"
    assert [f.field_name for f in fields] == ["ticket_number", "net_weight", "entity_name"]  # reading order


def test_key_line_followed_by_value_line_is_paired_with_the_lower_confidence():
    fields, _ = parse_rekognition_lines([line("Declared Weight:", 0.2, conf=99), line("5,000 kg", 0.27, conf=91)], "d")
    assert fields[0].field_name == "manifest_weight" and fields[0].value == 5000.0
    assert fields[0].confidence == pytest.approx(0.91)


def test_unreadable_weight_is_dropped_never_zeroed_and_plain_text_is_ignored():
    fields, _ = parse_rekognition_lines([line("Net Weight: illegible", 0.2), line("Some free text without a colon", 0.4)], "d")
    assert fields == []


def test_duplicate_keys_get_suffixes():
    fields, _ = parse_rekognition_lines([line("Net Weight: 100 kg", 0.1), line("Net Weight: 200 kg", 0.2)], "d")
    assert [f.field_name for f in fields] == ["net_weight", "net_weight_2"]


class FakeRekognition:
    def __init__(self, dets):
        self.dets, self.seen = dets, None

    def detect_text(self, Image):
        self.seen = Image
        return {"TextDetections": self.dets}


def test_rekognition_provider_reads_from_s3_and_rejects_pdfs(monkeypatch):
    fake = FakeRekognition([line("Net Weight: 8,500 kg", 0.3)])
    monkeypatch.setattr(boto3, "client", lambda *a, **k: fake)
    p = RekognitionExtractionProvider()
    doc = p.extract_from_s3("bkt", "evidence/k.png", "k.png", batch_id="b1", doc_id="doc-9")
    assert fake.seen == {"S3Object": {"Bucket": "bkt", "Name": "evidence/k.png"}}
    assert doc.id == "doc-9" and doc.content_stored and doc.extracted_fields[0].value == 8500.0
    with pytest.raises(ValueError, match="PNG and JPEG"):
        p.extract_from_s3("bkt", "k.pdf", "k.pdf")


def test_rekognition_service_errors_are_explicit(monkeypatch):
    class Boom:
        def detect_text(self, **_):
            raise RuntimeError("AccessDenied")

    monkeypatch.setattr(boto3, "client", lambda *a, **k: Boom())
    with pytest.raises(RuntimeError, match="Rekognition call failed.*AccessDenied"):
        RekognitionExtractionProvider().extract_from_s3("b", "k.png", "k.png")


# ------------------------------------------------------------------------------ Nova document reading
def test_nova_json_parsing_accepts_fences_objects_and_lists():
    assert _parse_json('```json\n{"fields":[{"key":"Net Weight","value":"4,960 kg"}]}\n```')[0]["key"] == "Net Weight"
    assert _parse_json('[{"key":"A","value":"1"},{"key":"B","value":""}]') == [{"key": "A", "value": "1"}]
    with pytest.raises(ValueError):
        _parse_json("sorry, no json")


def test_ai_read_fields_are_flagged_unscored_and_weights_never_zeroed():
    fields = fields_from_pairs(
        [{"key": "Net Weight:", "value": "4,960 kg"}, {"key": "Certified Weight", "value": "n/a"}, {"key": "Waybill No", "value": "WB-1"}], "d"
    )
    assert [f.field_name for f in fields] == ["net_weight", "waybill_number"]
    assert all(f.extraction_source == "nova_vision" and f.confidence == 0.0 and f.bounding_box is None for f in fields)


class FakeS3:
    def __init__(self, body):
        self.body = body

    def get_object(self, Bucket, Key):
        class B:
            def __init__(s, b):
                s.b = b

            def read(s):
                return s.b

        return {"Body": B(self.body)}


class FakeBedrock:
    def __init__(self, text):
        self.text, self.request = text, None

    def converse(self, **kw):
        self.request = kw
        return {"output": {"message": {"content": [{"text": self.text}]}}}


def _nova(monkeypatch, body=b"%PDF-1.4", text='{"fields":[{"key":"Certified Weight","value":"4,920 kg"}]}'):
    s3, br = FakeS3(body), FakeBedrock(text)
    monkeypatch.setattr(boto3, "client", lambda name, **k: s3 if name == "s3" else br)
    return NovaVisionExtractionProvider(), br


def test_nova_reads_pdf_documents_via_converse(monkeypatch):
    p, br = _nova(monkeypatch)
    doc = p.extract_from_s3("bkt", "evidence/c.pdf", "Cert 2025_01.pdf", batch_id="b", doc_id="doc-1")
    block = br.request["messages"][0]["content"][0]
    assert block["document"]["format"] == "pdf" and "_" not in block["document"]["name"]
    assert br.request["modelId"] == "us.amazon.nova-lite-v1:0" and br.request["inferenceConfig"]["temperature"] == 0
    assert doc.extracted_fields[0].value == 4920.0 and doc.extracted_fields[0].extraction_source == "nova_vision"


def test_nova_reads_images_and_rejects_oversize_or_bad_output(monkeypatch):
    p, br = _nova(monkeypatch)
    p.extract_from_s3("b", "k.png", "k.png")
    assert br.request["messages"][0]["content"][0]["image"]["format"] == "png"
    p, _ = _nova(monkeypatch, body=b"x" * 4_600_000)
    with pytest.raises(ValueError, match="4.5 MB"):
        p.extract_from_s3("b", "k.pdf", "k.pdf")
    p, _ = _nova(monkeypatch, text="I cannot read this")
    with pytest.raises(RuntimeError, match="Nova document reading failed"):
        p.extract_from_s3("b", "k.pdf", "k.pdf")


# ------------------------------------------------------------------------------ factory + endpoint
def test_factory_dispatches_by_mode_and_file_type(monkeypatch):
    calls = []
    monkeypatch.setattr("app.extraction.rekognition.RekognitionExtractionProvider.__init__", lambda self, *a, **k: None)
    monkeypatch.setattr("app.extraction.rekognition.RekognitionExtractionProvider.extract_from_s3", lambda self, *a, **k: calls.append("rekognition") or "R")
    monkeypatch.setattr("app.extraction.nova_vision.NovaVisionExtractionProvider.__init__", lambda self, *a, **k: None)
    monkeypatch.setattr("app.extraction.nova_vision.NovaVisionExtractionProvider.extract_from_s3", lambda self, *a, **k: calls.append("nova") or "N")
    monkeypatch.setenv("EXTRACTION", "rekognition")
    assert factory.extract_from_storage("b", "k", "scan.JPG") == "R"
    assert factory.extract_from_storage("b", "k", "cert.pdf") == "N"
    assert calls == ["rekognition", "nova"]
    with pytest.raises(ValueError, match="Unsupported"):
        factory.extract_from_storage("b", "k", "notes.txt")
    monkeypatch.setenv("EXTRACTION", "demo")
    with pytest.raises(RuntimeError, match="not enabled"):
        factory.extract_from_storage("b", "k", "scan.png")
    assert factory.provider_summary() == {"provider": "simulated", "live_aws": False}
    monkeypatch.setenv("EXTRACTION", "rekognition")
    assert factory.provider_summary()["provider"] == "amazon-rekognition+nova"


@pytest.fixture
def client():
    from app.api.routes import repo
    from app.main import app

    repo.reset_db()
    return TestClient(app)


def test_extract_endpoint_uses_rekognition_and_reverifies(monkeypatch, client):
    from app.api.routes import repo

    monkeypatch.setenv("EXTRACTION", "rekognition")
    monkeypatch.setenv("EVIDENCE_BUCKET", "bkt")
    monkeypatch.setattr(boto3, "client", lambda *a, **k: FakeRekognition([line("Net Weight: 9,000 kg", 0.3, conf=96)]))
    b = repo.get_batch("batch-002")
    doc = next(d for d in b.documents if d.document_type.value == "weighbridge_record")
    doc.storage_key = "evidence/w.png"
    doc.file_name = "w.png"
    repo.update_batch(b.id, b)
    res = client.post(f"/api/documents/{doc.id}/extract")
    assert res.status_code == 200
    f = res.json()["extracted_fields"][0]
    assert f["extraction_source"] == "rekognition" and f["confidence"] == pytest.approx(0.96) and f["bounding_box"]["left"] == 5.0
    assert client.get("/api/batches/batch-002").json()["mass_balance"]["received_kg"] == 9000.0
    assert client.get("/api/integrations").json()["extraction"]["provider"] == "amazon-rekognition+nova"


def test_extract_endpoint_reports_pdf_without_ai_as_error_and_marks_failed(monkeypatch, client):
    from app.api.routes import repo

    monkeypatch.setenv("EXTRACTION", "rekognition")
    monkeypatch.setenv("EVIDENCE_BUCKET", "bkt")

    class Boom:
        def get_object(self, **_):
            raise RuntimeError("NoSuchKey")

    monkeypatch.setattr(boto3, "client", lambda name, **k: Boom())
    b = repo.get_batch("batch-002")
    b.documents[0].storage_key = "evidence/x.pdf"
    b.documents[0].file_name = "x.pdf"
    repo.update_batch(b.id, b)
    res = client.post(f"/api/documents/{b.documents[0].id}/extract")
    assert res.status_code == 502 and "NoSuchKey" in res.json()["detail"]
    assert repo.get_batch("batch-002").documents[0].status == "failed"


def test_ai_read_and_manual_fields_do_not_skew_extraction_confidence():
    from app.schemas.batch import BatchCreate, DocumentType, EvidenceDocument, EwasteCategory, ExtractedField
    from app.verification.engine import run_verification

    def doc(i, src, conf):
        return EvidenceDocument(id=i, batch_id="b", title=i, document_type=DocumentType.WEIGHBRIDGE_RECORD, file_name=i + ".png", upload_timestamp="x",
            extracted_fields=[ExtractedField(id=i + "f", document_id=i, field_name="net_weight", label="n", value=4900, unit="kg", confidence=conf, extraction_source=src)])

    inp = BatchCreate(batch_number="B", category=EwasteCategory.IT_TELECOM, claimed_quantity=5000, unit="kg", recycler_name="R",
        recycler_registration_id="1", collection_date="2025-01-01", processing_date="2025-01-02", origin_location="a", destination_location="b")
    only_ocr = run_verification(inp, [doc("d1", "rekognition", 0.80)])[2].breakdown.extraction_confidence
    mixed = run_verification(inp, [doc("d1", "rekognition", 0.80), doc("d2", "nova_vision", 0.0), doc("d3", "manual_entry", 1.0)])[2].breakdown.extraction_confidence
    assert only_ocr == mixed == 80.0
