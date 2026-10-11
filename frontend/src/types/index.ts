export type EwasteCategory =
  | "it_telecom"
  | "consumer_electronics"
  | "large_appliances"
  | "small_appliances"
  | "batteries";

export type VerificationStatus =
  | "NOT_VERIFIED"
  | "PROCESSING"
  | "REVIEW_REQUIRED"
  | "SUPPORTED"
  | "REJECTED"
  | "REVOKED";

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

export type PassportLifecycleStatus = "ACTIVE" | "REVOKED" | "NOT_ISSUED";

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
  confidence: number; // 0.0 - 1.0
  pageNumber: number;
  boundingBox?: BoundingBox;
  isDiscrepant?: boolean;
  isCorrected?: boolean;
  correctedAt?: string;
  auditorNotes?: string;
}

export interface Finding {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: Severity;
  title: string;
  description: string;
  observedValue?: string | number;
  expectedValue?: string | number;
  difference?: string | number;
  unit?: string;
  sourceDocumentId?: string;
  sourceDocumentName?: string;
  sourcePage?: number;
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
  status: "extracted" | "pending" | "failed";
  extractedFields: ExtractedField[];
  thumbnailUrl?: string;
  previewContent?: string;
  extractedTextSnippet?: string;
}

export interface MassBalance {
  claimedKg: number;
  transportedKg: number;
  receivedKg: number;
  processedKg: number;
  recoveredKg: number;
  evidenceSupportedKg: number;
  discrepancyKg: number;
  lossPercentage: number;
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
  category: "precious_metal" | "base_metal" | "polymer" | "other";
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
  referencePriceDate: string;
  datasetVersion: string;
  calculatedAt: string;
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
  integrityStatus: "VALID" | "TAMPERED" | "REVOKED";
  signatureStatus: "VALID_AWS_KMS_SIGNATURE" | "DEMO_SIMULATED_KMS_SIGNATURE" | "SIGNED" | "NOT_CONFIGURED";
  kmsKeyArn?: string;
  kmsSignatureAlgorithm?: string;
  digitalSignatureBase64?: string;
  hashScopeDisclaimer?: string;
  revoked: boolean;
  revocationReason?: string;
  recoveryPathway: CircularPathway;
  publicAttributes: {
    co2AvoidedKg: number;
    primaryRecoveredMaterial: string;
    circularityScore: number;
    auditStatus: string;
    signingAuthority?: string;
  };
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
  unit: "kg" | "metric_ton";
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
  scenarioType?: "clean" | "borderline" | "high_risk" | "custom";
  createdAt: string;
  updatedAt: string;
}

export interface DashboardMetrics {
  totalBatches: number;
  evidenceSupportedKg: number;
  batchesRequiringReview: number;
  estimatedRecoveryValueUsd: number;
  totalClaimedKg: number;
  supportedBatchesCount: number;
  rejectedBatchesCount: number;
}
