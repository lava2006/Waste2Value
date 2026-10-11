export type EwasteCategory =
  | "it_telecom"
  | "consumer_electronics"
  | "large_appliances"
  | "small_appliances"
  | "batteries";

/** A. Documentary verification status (canonical backend enum). */
export type VerificationStatus =
  | "NOT_VERIFIED"
  | "PROCESSING"
  | "REVIEW_REQUIRED"
  | "SUPPORTED"
  | "REJECTED"
  | "REVOKED"; // legacy value; passport revocation no longer sets it

/** B. Risk assessment. */
export type RiskLevel = "low" | "medium" | "high";

export type Severity = "critical" | "warning" | "info";

export type DocumentType =
  | "recycling_certificate"
  | "transport_waybill"
  | "weighbridge_record"
  | "processing_invoice"
  | "facility_photo"
  | "recycler_registration"
  | "other";

export type CircularPathway =
  | "reuse"
  | "refurbishment"
  | "component_recovery"
  | "material_recovery"
  | "recycling";

/** C. Passport lifecycle status. */
export type PassportLifecycleStatus = "ACTIVE" | "REVOKED" | "NOT_ISSUED";

/** D. Payload integrity state. */
export type PayloadIntegrityState = "VALID" | "INVALID" | "NOT_CHECKED";

/** E. Issuer signature authenticity state. */
export type SignatureState = "VALID" | "INVALID" | "SIMULATED" | "NOT_CONFIGURED" | "UNSUPPORTED" | "NOT_CHECKED";

/** F. Evidence extraction status. */
export type ExtractionStatus = "extracted" | "pending" | "failed";

export type ExtractionSource = "simulated_ocr" | "textract" | "rekognition" | "nova_vision" | "manual_entry" | "seed_demo" | "unspecified";

export type ExecutionMode = "demo" | "live";

export interface BoundingBox {
  top: number; // percentage 0-100
  left: number; // percentage 0-100
  width: number; // percentage 0-100
  height: number; // percentage 0-100
}

export interface ExtractedField {
  id: string;
  documentId: string;
  fieldName: string;
  label: string;
  value: string | number;
  originalValue?: string | number;
  unit?: string;
  confidence: number; // 0.0 - 1.0 OCR extraction confidence
  pageNumber: number;
  boundingBox?: BoundingBox;
  isDiscrepant?: boolean;
  isCorrected?: boolean;
  correctedAt?: string;
  correctedBy?: string;
  correctionReason?: string;
  extractionSource: ExtractionSource;
}

export interface Finding {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: Severity;
  title: string;
  description: string;
  observedValue?: string;
  expectedValue?: string;
  difference?: string;
  unit?: string;
  sourceDocumentId?: string;
  sourceDocumentName?: string;
  sourcePage?: number;
  sourceFieldId?: string;
  lifecycleStage?: string;
  policyVersion?: string;
  recommendedAction: string;
  createdAt: string;
}

export interface DocumentEvidence {
  id: string;
  batchId: string;
  title: string;
  documentType: DocumentType;
  fileName: string;
  fileSize: string;
  uploadTimestamp: string;
  status: ExtractionStatus;
  contentStored: boolean;
  /** S3 object key when the file was uploaded to evidence storage. */
  storageKey?: string;
  extractedFields: ExtractedField[];
  extractedTextSnippet?: string;
}

/**
 * Lifecycle quantities in kg. `null` means unknown / not recorded - never zero.
 * evidenceSupportedKg is the lowest documented downstream stage (received or processed).
 */
export interface MassBalance {
  claimedKg: number;
  transportedKg: number | null;
  receivedKg: number | null;
  processedKg: number | null;
  recoveredKg: number | null;
  evidenceSupportedKg: number | null;
  discrepancyKg: number | null;
  lossPercentage: number | null;
  tolerancePercentage: number;
  isWithinTolerance: boolean;
}

export interface RiskScoreBreakdown {
  extractionConfidence: number; // 0-100
  evidenceCompleteness: number; // 0-100
  crossDocumentConsistency: number; // 0-100
  operationalRisk: number; // 0-100
}

export interface RiskScore {
  overallScore: number; // 0-100 (lower score = lower risk)
  riskLevel: RiskLevel;
  breakdown: RiskScoreBreakdown;
  summaryExplanation: string;
  policyVersion: string;
  calculatedAt: string;
}

export interface MaterialFraction {
  materialName: string;
  category: string;
  fractionPercentage: number;
  estimatedQuantityKg: number;
  unitPriceUsd: number;
  estimatedValueUsd: number;
}

export interface MaterialEstimate {
  totalGrossValueUsd: number;
  modeledProcessingCostUsd: number;
  netEstimatedRecoveryValueUsd: number;
  currency: string;
  recommendedPathway: CircularPathway;
  fractions: MaterialFraction[];
  assumptions: string[];
  methodology: string[];
  priceBasis: string;
  referencePriceDate: string;
  datasetVersion: string;
  calculatedAt: string;
  basisKg: number | null;
  /** False when no evidence-supported mass exists; monetary fields are then placeholders. */
  isAvailable: boolean;
}

export interface CircularityPassport {
  passportId: string;
  version: number;
  batchId: string;
  batchNumber: string;
  qrCodeUrl: string;
  verificationUrl: string;
  issueTimestamp: string;
  issuerName: string;
  recyclerName: string;
  recyclerLicense: string;
  facilityLocation: string;
  category: EwasteCategory;
  claimedKg: number;
  evidenceSupportedKg: number;
  recoveryRatePercent: number;
  estimatedValueUsd: number;
  sha256Hash: string;
  /** Legacy backend field; payload integrity is verified independently on /verify. */
  integrityStatus: string;
  signatureStatus: string;
  kmsKeyArn?: string;
  kmsSignatureAlgorithm?: string;
  digitalSignatureBase64?: string;
  hashScopeDisclaimer?: string;
  revoked: boolean;
  revocationReason?: string;
  revokedAt?: string;
  recoveryPathway: CircularPathway;
  publicAttributes: Record<string, string | number | boolean | null>;
}

export interface AuditorDecision {
  decision: VerificationStatus;
  auditorId: string;
  reason: string;
  timestamp: string;
}

export interface BatchTimelineEvent {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  note?: string;
  severity?: Severity;
}

export interface Batch {
  id: string;
  batchNumber: string;
  category: EwasteCategory;
  claimedQuantity: number;
  unit: string;
  recyclerName: string;
  recyclerRegistrationId: string;
  collectionDate: string;
  processingDate: string;
  originLocation: string;
  destinationLocation: string;
  status: VerificationStatus;
  riskScore: RiskScore;
  massBalance: MassBalance;
  materialEstimate: MaterialEstimate;
  documents: DocumentEvidence[];
  findings: Finding[];
  passport?: CircularityPassport;
  timeline: BatchTimelineEvent[];
  auditorDecision?: AuditorDecision;
  explicitRejectionReason?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/** Four independent pillars returned by the public verification portal. */
export interface PublicVerification {
  found: boolean;
  passportId: string;
  message?: string;
  version?: number;
  batchNumber?: string;
  category?: EwasteCategory;
  recyclerName?: string;
  evidenceSupportedKg?: number;
  estimatedValueUsd?: number;
  recoveryRatePercent?: number;
  issuedAt?: string;
  checkedAt?: string;
  sha256Hash?: string;
  payloadIntegrity?: { status: PayloadIntegrityState; storedSha256: string; recomputedSha256: string };
  signature?: { status: SignatureState; provider: string | null; algorithm: string | null; detail?: string | null };
  documentaryStatus?: VerificationStatus | null;
  lifecycleStatus?: "ACTIVE" | "REVOKED";
  revocationReason?: string;
  revokedAt?: string;
  disclaimer?: string;
  publicAttributes?: Record<string, string | number | boolean | null>;
}

export interface TamperDemoResult {
  alteredField: string;
  originalValue: number;
  alteredValue: number;
  storedSha256: string;
  alteredPayloadSha256: string;
  integrityCheck: PayloadIntegrityState;
  persisted: false;
}

export interface DashboardMetrics {
  totalBatches: number;
  supportedBatchesCount: number;
  reviewRequiredCount: number;
  rejectedCount: number;
  batchesRequiringReview: number;
  /** Sum of receivedKg over SUPPORTED batches that record a received quantity. */
  supportedReceivedKg: number;
  supportedBatchesWithReceived: number;
  /** Received mass documented on batches that are not SUPPORTED (not counted above). */
  unverifiedReceivedKg: number;
  batchesMissingReceived: number;
  /** Net modeled value over SUPPORTED batches with an available estimate (USD). */
  supportedValueUsd: number;
  /** Net modeled value over non-SUPPORTED batches with an available estimate (USD). */
  unverifiedValueUsd: number;
  criticalFindings: number;
  warningFindings: number;
}

export interface IntegrationState {
  provider: string;
  live_aws: boolean;
  model?: string | null;
  required?: boolean;
}

/** Truthful runtime status reported by GET /api/integrations (Live Mode). */
export interface IntegrationsStatus {
  environment: string;
  region: string | null;
  repository: IntegrationState;
  signing: IntegrationState;
  extraction: IntegrationState;
  ai: IntegrationState;
  evidence_storage: IntegrationState;
  orchestration: IntegrationState;
  authentication: IntegrationState;
}

export interface InvestigationReport {
  batchNumber: string;
  executiveSummary: string;
  citations: { documentId: string; documentName: string; fieldLabel: string; observedValue: string; pageNumber: number }[];
  questions: { targetEntity: string; question: string; rationale: string; urgency: Severity }[];
  passportRecommendation: string;
  generatedBy: string;
  generatedAt: string;
}
