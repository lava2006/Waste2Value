import os
import json
from decimal import Decimal
from typing import List, Optional, Dict, Any
from app.repositories.base import BaseRepository
from app.schemas.batch import (
    BatchResponse,
    CircularityPassport,
    EvidenceDocument,
    VerificationStatus,
    RiskLevel,
    EwasteCategory,
)

def _convert_floats_to_decimals(obj: Any) -> Any:
    """DynamoDB requires Decimal for floating-point numbers."""
    if isinstance(obj, float):
        return Decimal(str(obj))
    elif isinstance(obj, dict):
        return {k: _convert_floats_to_decimals(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_convert_floats_to_decimals(item) for item in obj]
    return obj

def _convert_decimals_to_floats(obj: Any) -> Any:
    """Converts DynamoDB Decimals back to Python float/int."""
    if isinstance(obj, Decimal):
        return float(obj) if obj % 1 != 0 else int(obj)
    elif isinstance(obj, dict):
        return {k: _convert_decimals_to_floats(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_convert_decimals_to_floats(item) for item in obj]
    return obj

class DynamoDBRepository(BaseRepository):
    """
    Authoritative AWS DynamoDB Repository implementing single-table persistence.
    Access Patterns:
    - PK: BATCH#{id}, SK: METADATA
    - PK: PASSPORT#{passport_id}, SK: METADATA
    - GSI1: GSI1PK = CATEGORY#{category}, GSI1SK = STATUS#{status}
    """

    def __init__(self, table_name: Optional[str] = None, region_name: Optional[str] = None):
        self.table_name = table_name or os.getenv("REGISTRY_TABLE", "w2v-registry-dev")
        self.region_name = region_name or os.getenv("AWS_REGION", "eu-central-1")
        self._dynamodb = None
        self._table = None
        self._fallback_in_memory: Dict[str, Dict[str, Any]] = {}
        self._init_dynamodb()

    def _init_dynamodb(self):
        try:
            import boto3
            if os.getenv("AWS_ACCESS_KEY_ID") or os.getenv("AWS_PROFILE") or os.getenv("AWS_ROLE_ARN"):
                self._dynamodb = boto3.resource("dynamodb", region_name=self.region_name)
                self._table = self._dynamodb.Table(self.table_name)
        except Exception:
            self._table = None

    @property
    def is_connected_to_aws(self) -> bool:
        return self._table is not None

    def create_batch(self, batch: BatchResponse) -> BatchResponse:
        data = batch.model_dump()
        pk = f"BATCH#{batch.id}"
        sk = "METADATA"

        if self._table:
            item = _convert_floats_to_decimals(data)
            item["PK"] = pk
            item["SK"] = sk
            item["GSI1PK"] = f"CATEGORY#{batch.category.value}"
            item["GSI1SK"] = f"STATUS#{batch.status.value}"
            item["batch_number"] = batch.batch_number
            self._table.put_item(Item=item)
        else:
            self._fallback_in_memory[pk] = data
            self._fallback_in_memory[f"NUM#{batch.batch_number}"] = data

        return batch

    def get_batch(self, batch_id: str) -> Optional[BatchResponse]:
        if self._table:
            pk = f"BATCH#{batch_id}" if not batch_id.startswith("BATCH#") else batch_id
            response = self._table.get_item(Key={"PK": pk, "SK": "METADATA"})
            item = response.get("Item")
            if not item:
                # Try querying by batch_number index
                res = self._table.scan(
                    FilterExpression="batch_number = :b_num",
                    ExpressionAttributeValues={":b_num": batch_id},
                    Limit=1,
                )
                items = res.get("Items", [])
                item = items[0] if items else None
            if item:
                raw = _convert_decimals_to_floats(item)
                raw.pop("PK", None)
                raw.pop("SK", None)
                raw.pop("GSI1PK", None)
                raw.pop("GSI1SK", None)
                return BatchResponse.model_validate(raw)
            return None
        else:
            pk = f"BATCH#{batch_id}"
            data = self._fallback_in_memory.get(pk) or self._fallback_in_memory.get(f"NUM#{batch_id}")
            if data:
                return BatchResponse.model_validate(data)
            return None

    def list_batches(
        self,
        category: Optional[str] = None,
        status: Optional[str] = None,
        risk_level: Optional[str] = None,
    ) -> List[BatchResponse]:
        results: List[BatchResponse] = []
        if self._table:
            # Query or Scan DynamoDB
            res = self._table.scan()
            for it in res.get("Items", []):
                if it.get("SK") == "METADATA" and str(it.get("PK", "")).startswith("BATCH#"):
                    raw = _convert_decimals_to_floats(it)
                    raw.pop("PK", None)
                    raw.pop("SK", None)
                    raw.pop("GSI1PK", None)
                    raw.pop("GSI1SK", None)
                    b = BatchResponse.model_validate(raw)
                    results.append(b)
        else:
            for k, v in self._fallback_in_memory.items():
                if k.startswith("BATCH#"):
                    results.append(BatchResponse.model_validate(v))

        # Filter criteria
        filtered = results
        if category:
            filtered = [b for b in filtered if b.category.value == category]
        if status:
            filtered = [b for b in filtered if b.status.value == status]
        if risk_level:
            filtered = [b for b in filtered if b.risk_score.risk_level.value == risk_level]

        return filtered

    def update_batch(self, batch_id: str, batch: BatchResponse) -> Optional[BatchResponse]:
        pk = f"BATCH#{batch.id}"
        sk = "METADATA"
        data = batch.model_dump()

        if self._table:
            item = _convert_floats_to_decimals(data)
            item["PK"] = pk
            item["SK"] = sk
            item["GSI1PK"] = f"CATEGORY#{batch.category.value}"
            item["GSI1SK"] = f"STATUS#{batch.status.value}"
            item["batch_number"] = batch.batch_number
            self._table.put_item(Item=item)
        else:
            self._fallback_in_memory[pk] = data
            self._fallback_in_memory[f"NUM#{batch.batch_number}"] = data

        return batch

    def add_document(self, batch_id: str, doc: EvidenceDocument) -> Optional[EvidenceDocument]:
        batch = self.get_batch(batch_id)
        if not batch:
            return None
        batch.documents.append(doc)
        self.update_batch(batch.id, batch)
        return doc

    def get_passport(self, passport_id: str) -> Optional[CircularityPassport]:
        pk = f"PASSPORT#{passport_id}"
        if self._table:
            res = self._table.get_item(Key={"PK": pk, "SK": "METADATA"})
            item = res.get("Item")
            if item:
                raw = _convert_decimals_to_floats(item)
                raw.pop("PK", None)
                raw.pop("SK", None)
                return CircularityPassport.model_validate(raw)
            return None
        else:
            data = self._fallback_in_memory.get(pk)
            if data:
                return CircularityPassport.model_validate(data)
            return None

    def save_passport(self, passport: CircularityPassport) -> CircularityPassport:
        pk = f"PASSPORT#{passport.passport_id}"
        sk = "METADATA"
        data = passport.model_dump()

        if self._table:
            item = _convert_floats_to_decimals(data)
            item["PK"] = pk
            item["SK"] = sk
            self._table.put_item(Item=item)
        else:
            self._fallback_in_memory[pk] = data

        return passport

    def revoke_passport(self, passport_id: str, reason: str) -> bool:
        passport = self.get_passport(passport_id)
        if not passport:
            return False
        passport.revoked = True
        passport.revocation_reason = reason
        passport.integrity_status = "REVOKED"
        self.save_passport(passport)
        return True
