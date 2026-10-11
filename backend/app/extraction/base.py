from abc import ABC, abstractmethod
from typing import Optional, List, Dict, Any
from app.schemas.batch import EvidenceDocument, DocumentType, ExtractedField

class BaseExtractionProvider(ABC):
    """
    Abstract interface for Document AI OCR and Key-Value extraction providers.
    Supports both Amazon Textract and synthetic local demo mode.
    """

    @abstractmethod
    def extract_document(
        self,
        file_name: str,
        file_bytes: Optional[bytes] = None,
        document_type: Optional[DocumentType] = None,
        batch_id: Optional[str] = None,
    ) -> EvidenceDocument:
        """
        Extracts structured fields, bounding boxes, confidence scores,
        and textual snippets from a physical or synthetic document.
        """
        pass
