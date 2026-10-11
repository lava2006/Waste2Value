import os
from typing import Any, Dict, List, Optional
from datetime import datetime
from app.repositories.base import BaseRepository
from app.schemas.batch import (
    BatchResponse,
    CircularityPassport,
    EvidenceDocument,
)
from app.verification.engine import reverify_batch

BATCH_LIST_PK = "BATCHES"


class DynamoDBRepository(BaseRepository):
    """
    Authoritative AWS DynamoDB repository (single-table design).

    Items (each carries the full pydantic document as a JSON string in `data`, which avoids
    DynamoDB float/Decimal conversion problems and keeps the schema in one place):
      PK=BATCH#{id}            SK=METADATA   GSI1PK=BATCHES  GSI1SK={updated_at}#{id}
                                             + category/status/risk_level attributes for filtering
      PK=BATCHNUM#{number}     SK=METADATA   batch_id        (batch-number lookup)
      PK=PASSPORT#{passport}   SK=METADATA   data

    Strict mode (default when REPOSITORY=dynamodb): the table must be reachable at start-up and
    every failure raises. There is no silent in-memory fallback in a deployed environment.
    The in-memory mode exists only for local tests when strict mode is off and no AWS
    credentials are configured; it runs the exact same code path.
    """

    def __init__(self, table_name: Optional[str] = None, region_name: Optional[str] = None, strict: Optional[bool] = None):
        self.table_name = table_name or os.getenv("REGISTRY_TABLE", "w2v-registry-dev")
        self.region_name = region_name or os.getenv("AWS_REGION", os.getenv("AWS_DEFAULT_REGION", "us-east-1"))
        self.strict = strict if strict is not None else os.getenv("REPOSITORY", "").lower() == "dynamodb"
        self._table = None
        self._memory: Dict[tuple, Dict[str, Any]] = {}
        self._init_dynamodb()

    def _init_dynamodb(self):
        want_aws = self.strict or bool(
            os.getenv("AWS_ACCESS_KEY_ID")
            or os.getenv("AWS_PROFILE")
            or os.getenv("AWS_ROLE_ARN")
            or os.getenv("AWS_LAMBDA_FUNCTION_NAME")
        )
        if not want_aws:
            return
        try:
            import boto3

            self._table = boto3.resource("dynamodb", region_name=self.region_name).Table(self.table_name)
            if self.strict:
                self._table.load()  # fail fast if the table is missing / not permitted
        except Exception as exc:
            if self.strict:
                raise RuntimeError(f"DynamoDB table '{self.table_name}' is not reachable: {exc}") from exc
            self._table = None

    @property
    def is_connected_to_aws(self) -> bool:
        return self._table is not None

    # ------------------------------------------------------------------ item primitives
    def _put(self, item: Dict[str, Any]) -> None:
        if self._table is not None:
            self._table.put_item(Item=item)
        else:
            self._memory[(item["PK"], item["SK"])] = dict(item)

    def _get(self, pk: str) -> Optional[Dict[str, Any]]:
        if self._table is not None:
            return self._table.get_item(Key={"PK": pk, "SK": "METADATA"}, ConsistentRead=True).get("Item")
        found = self._memory.get((pk, "METADATA"))
        return dict(found) if found else None

    def _all_batch_items(self) -> List[Dict[str, Any]]:
        if self._table is not None:
            from boto3.dynamodb.conditions import Key

            items: List[Dict[str, Any]] = []
            kwargs: Dict[str, Any] = {
                "IndexName": "GSI1",
                "KeyConditionExpression": Key("GSI1PK").eq(BATCH_LIST_PK),
                "ScanIndexForward": False,
            }
            while True:
                res = self._table.query(**kwargs)
                items.extend(res.get("Items", []))
                if "LastEvaluatedKey" not in res:
                    break
                kwargs["ExclusiveStartKey"] = res["LastEvaluatedKey"]
            return items
        rows = [v for v in self._memory.values() if v.get("GSI1PK") == BATCH_LIST_PK]
        return sorted(rows, key=lambda r: r["GSI1SK"], reverse=True)

    def _delete_all(self) -> None:
        if self._table is not None:
            scan = self._table.scan(ProjectionExpression="PK, SK")
            with self._table.batch_writer() as batch:
                while True:
                    for it in scan.get("Items", []):
                        batch.delete_item(Key={"PK": it["PK"], "SK": it["SK"]})
                    if "LastEvaluatedKey" not in scan:
                        break
                    scan = self._table.scan(ProjectionExpression="PK, SK", ExclusiveStartKey=scan["LastEvaluatedKey"])
        else:
            self._memory.clear()

    # ------------------------------------------------------------------ batches
    def _write_batch(self, batch: BatchResponse) -> None:
        self._put(
            {
                "PK": f"BATCH#{batch.id}",
                "SK": "METADATA",
                "GSI1PK": BATCH_LIST_PK,
                "GSI1SK": f"{batch.updated_at}#{batch.id}",
                "batch_id": batch.id,
                "batch_number": batch.batch_number,
                "category": batch.category.value,
                "status": batch.status.value,
                "risk_level": batch.risk_score.risk_level.value,
                "data": batch.model_dump_json(),
            }
        )
        self._put({"PK": f"BATCHNUM#{batch.batch_number}", "SK": "METADATA", "batch_id": batch.id})
        if batch.passport:
            self.save_passport(batch.passport)

    def create_batch(self, batch: BatchResponse) -> BatchResponse:
        self._write_batch(batch)
        return batch

    def get_batch(self, batch_id: str) -> Optional[BatchResponse]:
        item = self._get(f"BATCH#{batch_id}")
        if not item:
            ref = self._get(f"BATCHNUM#{batch_id}")
            item = self._get(f"BATCH#{ref['batch_id']}") if ref else None
        return BatchResponse.model_validate_json(item["data"]) if item else None

    def list_batches(
        self,
        category: Optional[str] = None,
        status: Optional[str] = None,
        risk_level: Optional[str] = None,
    ) -> List[BatchResponse]:
        out: List[BatchResponse] = []
        for it in self._all_batch_items():
            if category and category != "all" and it.get("category") != category:
                continue
            if status and status != "all" and it.get("status") != status:
                continue
            if risk_level and risk_level != "all" and it.get("risk_level") != risk_level:
                continue
            out.append(BatchResponse.model_validate_json(it["data"]))
        return out

    def update_batch(self, batch_id: str, batch: BatchResponse) -> Optional[BatchResponse]:
        batch.updated_at = datetime.utcnow().isoformat() + "Z"
        self._write_batch(batch)
        return batch

    def add_document(self, batch_id: str, doc: EvidenceDocument) -> Optional[EvidenceDocument]:
        batch = self.get_batch(batch_id)
        if not batch:
            return None
        batch.documents.append(doc)
        reverify_batch(batch, note_actor="Document Intake Service", reason=f"Document attached: {doc.file_name}")
        self.update_batch(batch.id, batch)
        return doc

    # ------------------------------------------------------------------ passports
    def get_passport(self, passport_id: str) -> Optional[CircularityPassport]:
        item = self._get(f"PASSPORT#{passport_id}")
        return CircularityPassport.model_validate_json(item["data"]) if item else None

    def save_passport(self, passport: CircularityPassport) -> CircularityPassport:
        self._put(
            {
                "PK": f"PASSPORT#{passport.passport_id}",
                "SK": "METADATA",
                "batch_id": passport.batch_id,
                "revoked": passport.revoked,
                "data": passport.model_dump_json(),
            }
        )
        return passport

    def revoke_passport(self, passport_id: str, reason: str) -> bool:
        """Passport lifecycle only: batch status and payload integrity are not modified."""
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

    # ------------------------------------------------------------------ admin
    def reset_db(self) -> None:
        from app.repositories.seed import build_seed_batches

        self._delete_all()
        for batch in build_seed_batches():
            self.create_batch(batch)

    def seed_if_empty(self) -> None:
        if not self._all_batch_items():
            self.reset_db()
