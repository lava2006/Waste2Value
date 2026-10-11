from abc import ABC, abstractmethod
from typing import List, Optional
from app.schemas.batch import BatchResponse, CircularityPassport, EvidenceDocument

class BaseRepository(ABC):
    @abstractmethod
    def create_batch(self, batch: BatchResponse) -> BatchResponse:
        pass

    @abstractmethod
    def get_batch(self, batch_id: str) -> Optional[BatchResponse]:
        pass

    @abstractmethod
    def list_batches(
        self,
        category: Optional[str] = None,
        status: Optional[str] = None,
        risk_level: Optional[str] = None,
    ) -> List[BatchResponse]:
        pass

    @abstractmethod
    def update_batch(self, batch_id: str, batch: BatchResponse) -> Optional[BatchResponse]:
        pass

    @abstractmethod
    def add_document(self, batch_id: str, doc: EvidenceDocument) -> Optional[EvidenceDocument]:
        pass

    @abstractmethod
    def get_passport(self, passport_id: str) -> Optional[CircularityPassport]:
        pass

    @abstractmethod
    def save_passport(self, passport: CircularityPassport) -> CircularityPassport:
        pass

    @abstractmethod
    def revoke_passport(self, passport_id: str, reason: str) -> bool:
        pass
