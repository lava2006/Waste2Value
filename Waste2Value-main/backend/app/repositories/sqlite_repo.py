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
from app.verification.engine import run_verification, reverify_batch
from app.repositories.seed import build_seed_batches

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
        reverify_batch(batch, note_actor="Document Intake Service", reason=f"Document attached: {doc.file_name}")
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
        """
        Revoke a passport. Passport lifecycle state is independent of the batch's documentary
        verification status and of payload integrity: neither batch.status nor
        passport.integrity_status is modified here. Raises ValueError if already revoked.
        """
        passport = self.get_passport(passport_id)
        if not passport:
            return False
        if passport.revoked:
            raise ValueError("already_revoked")
        passport.revoked = True
        passport.revocation_reason = reason
        passport.revoked_at = datetime.utcnow().isoformat() + "Z"
        self.save_passport(passport)

        batch = self.get_batch(passport.batch_id)
        if batch:
            batch.passport = passport
            self.update_batch(batch.id, batch)
        return True

    def _seed_default_scenarios_if_empty(self):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT count(*) as cnt FROM batches")
            if cursor.fetchone()["cnt"] > 0:
                return
        for batch in build_seed_batches():
            self.create_batch(batch)
