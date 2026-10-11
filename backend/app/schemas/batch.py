from decimal import Decimal
from enum import Enum
from typing import Dict, List, Optional, Any
from datetime import datetime
from pydantic import BaseModel, Field

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

class EvidenceDocument(BaseModel):
    id: str
    batch_id: str
    title: str
    document_type: DocumentType
    file_name: str
    file_size: str = "1.0 MB"
    upload_timestamp: str
    status: str = "extracted"
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
    recommended_action: str
    created_at: str

class MassBalance(BaseModel):
    claimed_kg: float
    transported_kg: float
    received_kg: float
    processed_kg: float
    recovered_kg: float
    evidence_supported_kg: float
    discrepancy_kg: float
    loss_percentage: float
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
        "The SHA-256 hash guarantees cryptographic integrity of the canonicalized payload (RFC 8785) against subsequent modification when checked against the authoritative ledger. It does not independently verify that physical recycling took place on-site, nor does an unsigned hash verify issuer identity. Issuer authenticity and non-repudiation are established via the accompanying AWS KMS asymmetric digital signature."
    )
    revoked: bool = False
    revocation_reason: Optional[str] = None
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

class BatchCreate(BaseModel):
    batch_number: str
    category: EwasteCategory
    claimed_quantity: float
    unit: str = "kg"
    recycler_name: str
    recycler_registration_id: str
    collection_date: str
    processing_date: str
    origin_location: str
    destination_location: str
    notes: Optional[str] = None

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

class FieldCorrectionRequest(BaseModel):
    field_id: str
    corrected_value: Any
    reason: str
    auditor_id: str = "AUDITOR-EU-COMPLIANCE-01"

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

