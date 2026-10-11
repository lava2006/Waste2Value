from typing import Dict, List, Optional
from pydantic import BaseModel, Field
from app.schemas.batch import EwasteCategory, DocumentType

class ProcessStageTolerance(BaseModel):
    max_transport_loss_percent: float = 1.5
    max_shredding_loss_percent: float = 5.0
    max_moisture_refining_loss_percent: float = 2.0

class VerificationPolicy(BaseModel):
    policy_version: str = "v2.1-circ-standard"
    description: str = "Standard Cross-Document Verification & Mass Balance Policy"
    
    # Tolerances by e-waste category
    category_tolerances: Dict[str, float] = Field(
        default_factory=lambda: {
            EwasteCategory.IT_TELECOM.value: 2.0,
            EwasteCategory.CONSUMER_ELECTRONICS.value: 3.5,
            EwasteCategory.LARGE_APPLIANCES.value: 5.0,
            EwasteCategory.SMALL_APPLIANCES.value: 4.0,
            EwasteCategory.BATTERIES.value: 1.5,
        }
    )

    # Process stage allowances
    stage_tolerances: ProcessStageTolerance = Field(default_factory=ProcessStageTolerance)

    # Mandatory document requirements by category
    mandatory_documents: Dict[str, List[DocumentType]] = Field(
        default_factory=lambda: {
            EwasteCategory.IT_TELECOM.value: [
                DocumentType.TRANSPORT_WAYBILL,
                DocumentType.WEIGHBRIDGE_RECORD,
            ],
            EwasteCategory.CONSUMER_ELECTRONICS.value: [
                DocumentType.TRANSPORT_WAYBILL,
                DocumentType.WEIGHBRIDGE_RECORD,
            ],
            EwasteCategory.LARGE_APPLIANCES.value: [
                DocumentType.TRANSPORT_WAYBILL,
                DocumentType.WEIGHBRIDGE_RECORD,
            ],
            EwasteCategory.SMALL_APPLIANCES.value: [
                DocumentType.TRANSPORT_WAYBILL,
                DocumentType.WEIGHBRIDGE_RECORD,
            ],
            EwasteCategory.BATTERIES.value: [
                DocumentType.TRANSPORT_WAYBILL,
                DocumentType.WEIGHBRIDGE_RECORD,
                DocumentType.RECYCLING_CERTIFICATE,
            ],
        }
    )

    # Extraction uncertainty threshold
    min_acceptable_extraction_confidence: float = 0.85

    # Threshold where variance becomes severe deficit
    severe_discrepancy_threshold_percent: float = 30.0

    def get_tolerance_for_category(self, category: EwasteCategory) -> float:
        return self.category_tolerances.get(category.value, 2.0)

    def get_mandatory_documents(self, category: EwasteCategory) -> List[DocumentType]:
        return self.mandatory_documents.get(category.value, [
            DocumentType.TRANSPORT_WAYBILL,
            DocumentType.WEIGHBRIDGE_RECORD,
        ])

DEFAULT_VERIFICATION_POLICY = VerificationPolicy()
