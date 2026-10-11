from decimal import Decimal
from enum import Enum
from typing import Dict, List, Optional, Any
from datetime import datetime
import math
from pydantic import BaseModel, Field, field_validator

class EwasteCategory(str, Enum):
    IT_TELECOM = "it_telecom"
    CONSUMER_ELECTRONICS = "consumer_electronics"
    LARGE_APPLIANCES = "large_appliances"
    SMALL_APPLIANCES = "small_appliances"
    BATTERIES = "batteries"

class VerificationStatus(str, Enum):
    NOT_VERIFIED = "NOT_VERIFIED"
    PROCESSING = "PROCESSING"
    REVIEW_REQUIRED = "REVIEW_REQUIRED"
    SUPPORTED = "SUPPORTED"
    REJECTED = "REJECTED"
    REVOKED = "REVOKED"

class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"

class Severity(str, Enum):
    CRITICAL = "critical"
    WARNING = "warning"
    INFO = "info"

class DocumentType(str, Enum):
    RECYCLING_CERTIFICATE = "recycling_certificate"
    TRANSPORT_WAYBILL = "transport_waybill"
    WEIGHBRIDGE_RECORD = "weighbridge_record"
    PROCESSING_INVOICE = "processing_invoice"
    FACILITY_PHOTO = "facility_photo"
    RECYCLER_REGISTRATION = "recycler_registration"
    OTHER = "other"

class CircularPathway(str, Enum):
    REUSE = "reuse"
    REFURBISHMENT = "refurbishment"
    COMPONENT_RECOVERY = "component_recovery"
    MATERIAL_RECOVERY = "material_recovery"
    RECYCLING = "recycling"

class BoundingBox(BaseModel):
    top: float
    left: float
    width: float
    height: float

class ExtractedField(BaseModel):
    id: str
    document_id: str
    field_name: str
    label: str
    value: Any
    unit: Optional[str] = None
    confidence: float = 0.95
    page_number: int = 1
    bounding_box: Optional[BoundingBox] = None
    is_discrepant: bool = False
    # Provenance: "simulated_ocr" (DemoExtractionProvider), "textract", "rekognition" (real OCR
    # confidence + geometry), "nova_vision" (AI-read value: no confidence/geometry), "manual_entry",
    # "seed_demo" (built-in demo dataset) or "unspecified". Bounding boxes are real geometry only
    # for "textract" and "rekognition".
    extraction_source: str = "unspecified"
    # Audited-correction history. The original extracted value is never discarded.
    original_value: Optional[Any] = None
    is_corrected: bool = False
    corrected_at: Optional[str] = None
    corrected_by: Optional[str] = None
    correction_reason: Optional[str] = None

class EvidenceDocument(BaseModel):
    id: str
    batch_id: str
    title: str
    document_type: DocumentType
    file_name: str
    file_size: str = "1.0 MB"
    upload_timestamp: str
    status: str = "extracted"
    # The backend registers evidence metadata and extracted fields only; uploaded file
    # bytes are not persisted (no object storage is configured in this deployment).
    content_stored: bool = False
    # S3 object key when the file was uploaded to evidence storage (None otherwise).
    storage_key: Optional[str] = None
    extracted_text_snippet: Optional[str] = None
    extracted_fields: List[ExtractedField] = Field(default_factory=list)

class VerificationFinding(BaseModel):
    id: str
    rule_id: str
    rule_name: str
    severity: Severity
    title: str
    description: str
    observed_value: Optional[str] = None
    expected_value: Optional[str] = None
    difference: Optional[str] = None
    unit: Optional[str] = None
    source_document_id: Optional[str] = None
    source_document_name: Optional[str] = None
    source_page: Optional[int] = None
    # Extra finding context (additive): the extracted field the finding points at and the
    # lifecycle stage it concerns ("received", "processed", "timeline", "identity", ...).
    source_field_id: Optional[str] = None
    lifecycle_stage: Optional[str] = None
    policy_version: Optional[str] = None
    recommended_action: str
    created_at: str

class MassBalance(BaseModel):
    """
    Lifecycle quantities in kg. Every stage except `claimed_kg` is None when no
    evidence documents that stage; unknown is never represented as 0.

    - claimed_kg: quantity declared on the intake record.
    - transported_kg: quantity stated on the transport waybill/manifest.
    - received_kg: quantity recorded at intake by a weighbridge/scale record.
    - processed_kg: processed input quantity stated by a certificate/processing record.
    - recovered_kg: recovered output mass. No evidence type captures it yet, so None.
    - evidence_supported_kg: the lowest documented downstream quantity (received or
      processed) - the quantity the evidence supports for material valuation.
    - discrepancy_kg / loss_percentage: |claimed - evidence_supported| and its share of
      the claim (variance versus claim, not physical process loss).
    """
    claimed_kg: float
    transported_kg: Optional[float] = None
    received_kg: Optional[float] = None
    processed_kg: Optional[float] = None
    recovered_kg: Optional[float] = None
    evidence_supported_kg: Optional[float] = None
    discrepancy_kg: Optional[float] = None
    loss_percentage: Optional[float] = None
    tolerance_percentage: float
    is_within_tolerance: bool

class RiskScoreBreakdown(BaseModel):
    extraction_confidence: float = 95.0
    evidence_completeness: float = 100.0
    cross_document_consistency: float = 95.0
    operational_risk: float = 10.0

class RiskScore(BaseModel):
    overall_score: int
    risk_level: RiskLevel
    policy_version: str = "v1.2-synthetic"
    summary_explanation: str
    breakdown: RiskScoreBreakdown
    calculated_at: str

class MaterialFraction(BaseModel):
    material_name: str
    category: str
    fraction_percentage: float
    estimated_quantity_kg: float
    unit_price_usd: float
    estimated_value_usd: float

class MaterialEstimate(BaseModel):
    total_gross_value_usd: float
    modeled_processing_cost_usd: float
    net_estimated_recovery_value_usd: float
    currency: str = "USD"
    recommended_pathway: CircularPathway
    fractions: List[MaterialFraction] = Field(default_factory=list)
    assumptions: List[str] = Field(default_factory=list)
    reference_price_date: str = "2025-03-01"
    dataset_version: str = "LME-COMEX-2025.1"
    calculated_at: str
    # Input mass the estimate is computed on (the evidence-supported mass) and whether an
    # estimate could be produced at all. When is_available is False every monetary field
    # is 0.0 only as a placeholder and must be presented as "Not available".
    basis_kg: Optional[float] = None
    is_available: bool = True
    price_basis: str = "Illustrative reference price table (not a live market quotation)"
    methodology: List[str] = Field(default_factory=list)

class CircularityPassport(BaseModel):
    passport_id: str
    version: int = 1
    batch_id: str
    batch_number: str
    qr_code_url: str
    verification_url: str
    issue_timestamp: str
    issuer_name: str
    recycler_name: str
    recycler_license: str
    facility_location: str
    category: EwasteCategory
    claimed_kg: float
    evidence_supported_kg: float
    recovery_rate_percent: float
    estimated_value_usd: float
    sha256_hash: str
    integrity_status: str = "VALID"
    signature_status: str = "DEMO_SIMULATED_KMS_SIGNATURE"
    kms_key_arn: Optional[str] = "arn:aws:kms:eu-central-1:123456789012:key/w2v-passport-signer-rsa-4096"
    kms_signature_algorithm: Optional[str] = "RSASSA_PSS_SHA_256"
    digital_signature_base64: Optional[str] = None
    hash_scope_disclaimer: str = (
        "The SHA-256 hash lets a verifier detect modification of the canonicalized payload since issuance. It does not independently verify that physical recycling took place on-site, and a hash alone does not identify the issuer. Issuer authenticity is established only by a valid asymmetric signature from a configured key service; a simulated or missing signature establishes nothing about the issuer."
    )
    revoked: bool = False
    revocation_reason: Optional[str] = None
    revoked_at: Optional[str] = None
    recovery_pathway: CircularPathway
    public_attributes: Dict[str, Any] = Field(default_factory=dict)

class AuditorDecision(BaseModel):
    decision: VerificationStatus
    auditor_id: str
    reason: str
    timestamp: str

class BatchTimelineEvent(BaseModel):
    id: str
    timestamp: str
    actor: str
    action: str
    note: Optional[str] = None
    severity: Optional[Severity] = None

SUPPORTED_UNITS = {"kg", "kilogram", "kilograms", "metric_ton", "ton", "tonne", "tonnes", "t", "lb", "lbs", "pound", "pounds"}

def _is_valid_date(value: str) -> bool:
    from datetime import datetime as _dt
    try:
        if "T" in value:
            _dt.fromisoformat(value.replace("Z", "+00:00"))
        else:
            _dt.strptime(value, "%Y-%m-%d")
        return True
    except Exception:
        return False

class BatchCreate(BaseModel):
    batch_number: str
    category: EwasteCategory
    claimed_quantity: float
    unit: str = "kg"
    recycler_name: str
    recycler_registration_id: str
    collection_date: str
    processing_date: str = ""
    origin_location: str
    destination_location: str
    notes: Optional[str] = None

    @field_validator("claimed_quantity")
    @classmethod
    def _positive_finite_quantity(cls, v: float) -> float:
        if not math.isfinite(v) or v <= 0:
            raise ValueError("claimed_quantity must be a positive, finite number")
        return v

    @field_validator("unit")
    @classmethod
    def _supported_unit(cls, v: str) -> str:
        if v.lower().strip() not in SUPPORTED_UNITS:
            raise ValueError(f"Unsupported unit '{v}'. Supported units: kg, metric_ton, lb")
        return v

    @field_validator("batch_number", "recycler_name", "recycler_registration_id", "origin_location", "destination_location")
    @classmethod
    def _non_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("must not be blank")
        return v.strip()

    @field_validator("collection_date", "processing_date")
    @classmethod
    def _valid_date(cls, v: str) -> str:
        # processing_date may be empty while processing is pending.
        if v == "" :
            return v
        if not _is_valid_date(v):
            raise ValueError("must be an ISO date (YYYY-MM-DD) or ISO datetime")
        return v

class BatchResponse(BaseModel):
    id: str
    batch_number: str
    category: EwasteCategory
    claimed_quantity: float
    unit: str
    recycler_name: str
    recycler_registration_id: str
    collection_date: str
    processing_date: str
    origin_location: str
    destination_location: str
    status: VerificationStatus
    risk_score: RiskScore
    mass_balance: MassBalance
    material_estimate: MaterialEstimate
    documents: List[EvidenceDocument] = Field(default_factory=list)
    findings: List[VerificationFinding] = Field(default_factory=list)
    passport: Optional[CircularityPassport] = None
    timeline: List[BatchTimelineEvent] = Field(default_factory=list)
    auditor_decision: Optional[AuditorDecision] = None
    explicit_rejection_reason: Optional[str] = None
    notes: Optional[str] = None
    created_at: str
    updated_at: str

class PassportRevocationRequest(BaseModel):
    reason: str

    @field_validator("reason")
    @classmethod
    def _reason_required(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("A revocation justification is required")
        return v.strip()

class VerificationReportResponse(BaseModel):
    batch_id: str
    batch_number: str
    status: VerificationStatus
    risk_score: RiskScore
    mass_balance: MassBalance
    findings_count: int
    findings: List[VerificationFinding]
    is_eligible_for_passport: bool
    material_estimate: MaterialEstimate
    generated_at: str

class BatchUpdate(BaseModel):
    claimed_quantity: Optional[float] = None
    unit: Optional[str] = None
    recycler_name: Optional[str] = None
    recycler_registration_id: Optional[str] = None
    collection_date: Optional[str] = None
    processing_date: Optional[str] = None
    origin_location: Optional[str] = None
    destination_location: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("claimed_quantity")
    @classmethod
    def _positive_finite_quantity(cls, v):
        if v is not None and (not math.isfinite(v) or v <= 0):
            raise ValueError("claimed_quantity must be a positive, finite number")
        return v

    @field_validator("unit")
    @classmethod
    def _supported_unit(cls, v):
        if v is not None and v.lower().strip() not in SUPPORTED_UNITS:
            raise ValueError(f"Unsupported unit '{v}'. Supported units: kg, metric_ton, lb")
        return v

    @field_validator("collection_date", "processing_date")
    @classmethod
    def _valid_date(cls, v):
        if v is None or v == "":
            return v
        if not _is_valid_date(v):
            raise ValueError("must be an ISO date (YYYY-MM-DD) or ISO datetime")
        return v

class FieldCorrectionRequest(BaseModel):
    field_id: str
    corrected_value: Any
    reason: str
    # Client-supplied label. The API has no authentication, so this identity is NOT verified.
    auditor_id: str = "AUDITOR-EU-COMPLIANCE-01"

    @field_validator("reason")
    @classmethod
    def _reason_required(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("A correction justification is required")
        return v.strip()

class PassportVersionItem(BaseModel):
    version: int
    passport_id: str
    batch_number: str
    issue_timestamp: str
    sha256_hash: str
    integrity_status: str
    signature_status: str
    revoked: bool
    revocation_reason: Optional[str] = None

