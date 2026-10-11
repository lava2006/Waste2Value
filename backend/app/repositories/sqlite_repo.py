import sqlite3
import json
from typing import List, Optional
from datetime import datetime
from app.repositories.base import BaseRepository
from app.schemas.batch import (
    BatchResponse,
    CircularityPassport,
    EvidenceDocument,
    BatchCreate,
    VerificationStatus,
    RiskLevel,
    EwasteCategory,
)
from app.verification.engine import run_verification
from app.passports.canonical import create_circularity_passport

class SQLiteRepository(BaseRepository):
    def __init__(self, db_path: str = "waste2value.db"):
        self.db_path = db_path
        self._init_db()
        self._seed_default_scenarios_if_empty()

    def reset_db(self):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DROP TABLE IF EXISTS batches")
            cursor.execute("DROP TABLE IF EXISTS passports")
            conn.commit()
        self._init_db()
        self._seed_default_scenarios_if_empty()

    def _get_connection(self):
        conn = sqlite3.connect(self.db_path, timeout=30.0)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS batches (
                    id TEXT PRIMARY KEY,
                    batch_number TEXT UNIQUE,
                    category TEXT,
                    status TEXT,
                    risk_level TEXT,
                    claimed_quantity REAL,
                    recycler_name TEXT,
                    updated_at TEXT,
                    data JSON
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS passports (
                    passport_id TEXT PRIMARY KEY,
                    batch_id TEXT,
                    sha256_hash TEXT,
                    revoked INTEGER DEFAULT 0,
                    data JSON
                )
            """)
            conn.commit()

    def create_batch(self, batch: BatchResponse) -> BatchResponse:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT OR REPLACE INTO batches (
                    id, batch_number, category, status, risk_level, claimed_quantity, recycler_name, updated_at, data
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                batch.id,
                batch.batch_number,
                batch.category.value,
                batch.status.value,
                batch.risk_score.risk_level.value,
                batch.claimed_quantity,
                batch.recycler_name,
                batch.updated_at,
                batch.model_dump_json()
            ))
            if batch.passport:
                cursor.execute("""
                    INSERT OR REPLACE INTO passports (
                        passport_id, batch_id, sha256_hash, revoked, data
                    ) VALUES (?, ?, ?, ?, ?)
                """, (
                    batch.passport.passport_id,
                    batch.passport.batch_id,
                    batch.passport.sha256_hash,
                    1 if batch.passport.revoked else 0,
                    batch.passport.model_dump_json()
                ))
            conn.commit()
        return batch

    def get_batch(self, batch_id: str) -> Optional[BatchResponse]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM batches WHERE id = ? OR batch_number = ?", (batch_id, batch_id))
            row = cursor.fetchone()
            if row:
                return BatchResponse.model_validate_json(row["data"])
        return None

    def list_batches(
        self,
        category: Optional[str] = None,
        status: Optional[str] = None,
        risk_level: Optional[str] = None,
    ) -> List[BatchResponse]:
        query = "SELECT data FROM batches WHERE 1=1"
        params = []
        if category and category != "all":
            query += " AND category = ?"
            params.append(category)
        if status and status != "all":
            query += " AND status = ?"
            params.append(status)
        if risk_level and risk_level != "all":
            query += " AND risk_level = ?"
            params.append(risk_level)
        query += " ORDER BY updated_at DESC"

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, params)
            rows = cursor.fetchall()
            return [BatchResponse.model_validate_json(r["data"]) for r in rows]

    def update_batch(self, batch_id: str, batch: BatchResponse) -> Optional[BatchResponse]:
        batch.updated_at = datetime.utcnow().isoformat() + "Z"
        return self.create_batch(batch)

    def add_document(self, batch_id: str, doc: EvidenceDocument) -> Optional[EvidenceDocument]:
        batch = self.get_batch(batch_id)
        if not batch:
            return None
        batch.documents.append(doc)
        # Re-run verification
        status, mb, risk, mat, findings = run_verification(
            BatchCreate(
                batch_number=batch.batch_number,
                category=batch.category,
                claimed_quantity=batch.claimed_quantity,
                unit=batch.unit,
                recycler_name=batch.recycler_name,
                recycler_registration_id=batch.recycler_registration_id,
                collection_date=batch.collection_date,
                processing_date=batch.processing_date,
                origin_location=batch.origin_location,
                destination_location=batch.destination_location,
            ),
            batch.documents
        )
        batch.status = status
        batch.mass_balance = mb
        batch.risk_score = risk
        batch.material_estimate = mat
        batch.findings = findings
        self.update_batch(batch_id, batch)
        return doc

    def get_passport(self, passport_id: str) -> Optional[CircularityPassport]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM passports WHERE passport_id = ?", (passport_id,))
            row = cursor.fetchone()
            if row:
                return CircularityPassport.model_validate_json(row["data"])
        return None

    def save_passport(self, passport: CircularityPassport) -> CircularityPassport:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT OR REPLACE INTO passports (
                    passport_id, batch_id, sha256_hash, revoked, data
                ) VALUES (?, ?, ?, ?, ?)
            """, (
                passport.passport_id,
                passport.batch_id,
                passport.sha256_hash,
                1 if passport.revoked else 0,
                passport.model_dump_json()
            ))
            conn.commit()
        return passport

    def revoke_passport(self, passport_id: str, reason: str) -> bool:
        passport = self.get_passport(passport_id)
        if not passport:
            return False
        passport.revoked = True
        passport.revocation_reason = reason
        passport.integrity_status = "REVOKED"
        self.save_passport(passport)

        # Update parent batch
        batch = self.get_batch(passport.batch_id)
        if batch:
            batch.status = VerificationStatus.REVOKED
            batch.passport = passport
            self.update_batch(batch.id, batch)
        return True

    def _seed_default_scenarios_if_empty(self):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT count(*) as cnt FROM batches")
            if cursor.fetchone()["cnt"] > 0:
                return

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
                    {"id": "f1", "document_id": "doc-101", "field_name": "net_weight", "label": "Certified Weight", "value": 4920, "unit": "kg", "confidence": 0.99, "page_number": 1}
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
                    {"id": "f2", "document_id": "doc-102", "field_name": "manifest_weight", "label": "Waybill Mass", "value": 5000, "unit": "kg", "confidence": 0.98, "page_number": 1}
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
                    {"id": "f3", "document_id": "doc-103", "field_name": "net_weight", "label": "Intake Weight", "value": 4960, "unit": "kg", "confidence": 0.99, "page_number": 1}
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
        ok, msg, p1 = create_circularity_passport(b1)
        if ok:
            p1.passport_id = "W2V-CP-0001"
            p1.qr_code_url = "/verify/W2V-CP-0001"
            p1.verification_url = "/verify/W2V-CP-0001"
            b1.passport = p1
        self.create_batch(b1)

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
                    {"id": "f21", "document_id": "doc-201", "field_name": "manifest_weight", "label": "Waybill Mass", "value": 12000, "unit": "kg", "confidence": 0.95, "page_number": 1}
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
                    {"id": "f22", "document_id": "doc-202", "field_name": "net_weight", "label": "Weighbridge Mass", "value": 8500, "unit": "kg", "confidence": 0.98, "page_number": 1, "is_discrepant": True}
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
        self.create_batch(b2)

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
                    {"id": "f31", "document_id": "doc-301", "field_name": "waybill_number", "label": "Waybill Serial", "value": "WB-2024-9901", "confidence": 0.96, "page_number": 1},
                    {"id": "f32", "document_id": "doc-301", "field_name": "entity_name", "label": "Entity", "value": "Apex Logistics LLC", "confidence": 0.94, "page_number": 1}
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
                    {"id": "f33", "document_id": "doc-302", "field_name": "net_weight", "label": "Scale Weight", "value": 11200, "unit": "kg", "confidence": 0.97, "page_number": 1}
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
        self.create_batch(b3)
