/**
 * Runtime validation + snake_case -> camelCase mapping for FastAPI responses.
 * A response that does not match throws a ZodError, which the API client reports as a
 * contract mismatch instead of rendering partially-undefined data.
 */
import { z } from "zod";
import type {
  Batch,
  CircularityPassport,
  DocumentEvidence,
  PublicVerification,
  TamperDemoResult,
} from "@/types";

const optStr = z.string().nullish().transform((v) => v ?? undefined);
const optNum = z.number().nullish().transform((v) => v ?? undefined);
const nullableNum = z.number().nullish().transform((v) => v ?? null);
const strOrNum = z.union([z.string(), z.number()]);

const categoryEnum = z.enum(["it_telecom", "consumer_electronics", "large_appliances", "small_appliances", "batteries"]);
const statusEnum = z.enum(["NOT_VERIFIED", "PROCESSING", "REVIEW_REQUIRED", "SUPPORTED", "REJECTED", "REVOKED"]);
const severityEnum = z.enum(["critical", "warning", "info"]);
const pathwayEnum = z.enum(["reuse", "refurbishment", "component_recovery", "material_recovery", "recycling"]);
const docTypeEnum = z.enum([
  "recycling_certificate",
  "transport_waybill",
  "weighbridge_record",
  "processing_invoice",
  "facility_photo",
  "recycler_registration",
  "other",
]);
const sourceEnum = z
  .string()
  .transform((v) =>
    (["simulated_ocr", "textract", "rekognition", "nova_vision", "manual_entry", "seed_demo"].includes(v) ? v : "unspecified") as
      | "simulated_ocr"
      | "textract"
      | "rekognition"
      | "nova_vision"
      | "manual_entry"
      | "seed_demo"
      | "unspecified"
  );

const fieldSchema = z
  .object({
    id: z.string(),
    document_id: z.string(),
    field_name: z.string(),
    label: z.string(),
    value: strOrNum,
    unit: optStr,
    confidence: z.number(),
    page_number: z.number().default(1),
    bounding_box: z
      .object({ top: z.number(), left: z.number(), width: z.number(), height: z.number() })
      .nullish()
      .transform((v) => v ?? undefined),
    is_discrepant: z.boolean().default(false),
    extraction_source: sourceEnum.default("unspecified"),
    original_value: strOrNum.nullish().transform((v) => v ?? undefined),
    is_corrected: z.boolean().default(false),
    corrected_at: optStr,
    corrected_by: optStr,
    correction_reason: optStr,
  })
  .transform((f) => ({
    id: f.id,
    documentId: f.document_id,
    fieldName: f.field_name,
    label: f.label,
    value: f.value,
    unit: f.unit,
    confidence: f.confidence,
    pageNumber: f.page_number,
    boundingBox: f.bounding_box,
    isDiscrepant: f.is_discrepant,
    extractionSource: f.extraction_source,
    originalValue: f.original_value,
    isCorrected: f.is_corrected,
    correctedAt: f.corrected_at,
    correctedBy: f.corrected_by,
    correctionReason: f.correction_reason,
  }));

export const documentSchema = z
  .object({
    id: z.string(),
    batch_id: z.string(),
    title: z.string(),
    document_type: docTypeEnum,
    file_name: z.string(),
    file_size: z.string().default("Unknown"),
    upload_timestamp: z.string(),
    status: z.string().default("extracted"),
    content_stored: z.boolean().default(false),
    storage_key: optStr,
    extracted_text_snippet: optStr,
    extracted_fields: z.array(fieldSchema).default([]),
  })
  .transform(
    (d): DocumentEvidence => ({
      id: d.id,
      batchId: d.batch_id,
      title: d.title,
      documentType: d.document_type,
      fileName: d.file_name,
      fileSize: d.file_size,
      uploadTimestamp: d.upload_timestamp,
      status: d.status === "pending" || d.status === "failed" ? d.status : "extracted",
      contentStored: d.content_stored,
      storageKey: d.storage_key,
      extractedTextSnippet: d.extracted_text_snippet,
      extractedFields: d.extracted_fields,
    })
  );

const findingSchema = z
  .object({
    id: z.string(),
    rule_id: z.string(),
    rule_name: z.string(),
    severity: severityEnum,
    title: z.string(),
    description: z.string(),
    observed_value: optStr,
    expected_value: optStr,
    difference: optStr,
    unit: optStr,
    source_document_id: optStr,
    source_document_name: optStr,
    source_page: optNum,
    source_field_id: optStr,
    lifecycle_stage: optStr,
    policy_version: optStr,
    recommended_action: z.string(),
    created_at: z.string(),
  })
  .transform((f) => ({
    id: f.id,
    ruleId: f.rule_id,
    ruleName: f.rule_name,
    severity: f.severity,
    title: f.title,
    description: f.description,
    observedValue: f.observed_value,
    expectedValue: f.expected_value,
    difference: f.difference,
    unit: f.unit,
    sourceDocumentId: f.source_document_id,
    sourceDocumentName: f.source_document_name,
    sourcePage: f.source_page,
    sourceFieldId: f.source_field_id,
    lifecycleStage: f.lifecycle_stage,
    policyVersion: f.policy_version,
    recommendedAction: f.recommended_action,
    createdAt: f.created_at,
  }));

export const massBalanceSchema = z
  .object({
    claimed_kg: z.number(),
    transported_kg: nullableNum,
    received_kg: nullableNum,
    processed_kg: nullableNum,
    recovered_kg: nullableNum,
    evidence_supported_kg: nullableNum,
    discrepancy_kg: nullableNum,
    loss_percentage: nullableNum,
    tolerance_percentage: z.number(),
    is_within_tolerance: z.boolean(),
  })
  .transform((m) => ({
    claimedKg: m.claimed_kg,
    transportedKg: m.transported_kg,
    receivedKg: m.received_kg,
    processedKg: m.processed_kg,
    recoveredKg: m.recovered_kg,
    evidenceSupportedKg: m.evidence_supported_kg,
    discrepancyKg: m.discrepancy_kg,
    lossPercentage: m.loss_percentage,
    tolerancePercentage: m.tolerance_percentage,
    isWithinTolerance: m.is_within_tolerance,
  }));

export const riskSchema = z
  .object({
    overall_score: z.number(),
    risk_level: z.enum(["low", "medium", "high"]),
    policy_version: z.string(),
    summary_explanation: z.string(),
    calculated_at: z.string(),
    breakdown: z.object({
      extraction_confidence: z.number(),
      evidence_completeness: z.number(),
      cross_document_consistency: z.number(),
      operational_risk: z.number(),
    }),
  })
  .transform((r) => ({
    overallScore: r.overall_score,
    riskLevel: r.risk_level,
    policyVersion: r.policy_version,
    summaryExplanation: r.summary_explanation,
    calculatedAt: r.calculated_at,
    breakdown: {
      extractionConfidence: r.breakdown.extraction_confidence,
      evidenceCompleteness: r.breakdown.evidence_completeness,
      crossDocumentConsistency: r.breakdown.cross_document_consistency,
      operationalRisk: r.breakdown.operational_risk,
    },
  }));

export const estimateSchema = z
  .object({
    total_gross_value_usd: z.number(),
    modeled_processing_cost_usd: z.number(),
    net_estimated_recovery_value_usd: z.number(),
    currency: z.string().default("USD"),
    recommended_pathway: pathwayEnum,
    fractions: z
      .array(
        z.object({
          material_name: z.string(),
          category: z.string(),
          fraction_percentage: z.number(),
          estimated_quantity_kg: z.number(),
          unit_price_usd: z.number(),
          estimated_value_usd: z.number(),
        })
      )
      .default([]),
    assumptions: z.array(z.string()).default([]),
    methodology: z.array(z.string()).default([]),
    price_basis: z.string().default("Illustrative reference price table (not a live market quotation)"),
    reference_price_date: z.string(),
    dataset_version: z.string(),
    calculated_at: z.string(),
    basis_kg: nullableNum,
    is_available: z.boolean().default(true),
  })
  .transform((e) => ({
    totalGrossValueUsd: e.total_gross_value_usd,
    modeledProcessingCostUsd: e.modeled_processing_cost_usd,
    netEstimatedRecoveryValueUsd: e.net_estimated_recovery_value_usd,
    currency: e.currency,
    recommendedPathway: e.recommended_pathway,
    fractions: e.fractions.map((f) => ({
      materialName: f.material_name,
      category: f.category,
      fractionPercentage: f.fraction_percentage,
      estimatedQuantityKg: f.estimated_quantity_kg,
      unitPriceUsd: f.unit_price_usd,
      estimatedValueUsd: f.estimated_value_usd,
    })),
    assumptions: e.assumptions,
    methodology: e.methodology,
    priceBasis: e.price_basis,
    referencePriceDate: e.reference_price_date,
    datasetVersion: e.dataset_version,
    calculatedAt: e.calculated_at,
    basisKg: e.basis_kg,
    isAvailable: e.is_available,
  }));

const attrValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const passportSchema = z
  .object({
    passport_id: z.string(),
    version: z.number(),
    batch_id: z.string(),
    batch_number: z.string(),
    qr_code_url: z.string(),
    verification_url: z.string(),
    issue_timestamp: z.string(),
    issuer_name: z.string(),
    recycler_name: z.string(),
    recycler_license: z.string(),
    facility_location: z.string(),
    category: categoryEnum,
    claimed_kg: z.number(),
    evidence_supported_kg: z.number(),
    recovery_rate_percent: z.number(),
    estimated_value_usd: z.number(),
    sha256_hash: z.string(),
    integrity_status: z.string().default("VALID"),
    signature_status: z.string(),
    kms_key_arn: optStr,
    kms_signature_algorithm: optStr,
    digital_signature_base64: optStr,
    hash_scope_disclaimer: optStr,
    revoked: z.boolean().default(false),
    revocation_reason: optStr,
    revoked_at: optStr,
    recovery_pathway: pathwayEnum,
    public_attributes: z.record(attrValue).default({}),
  })
  .transform(
    (p): CircularityPassport => ({
      passportId: p.passport_id,
      version: p.version,
      batchId: p.batch_id,
      batchNumber: p.batch_number,
      qrCodeUrl: p.qr_code_url,
      verificationUrl: p.verification_url,
      issueTimestamp: p.issue_timestamp,
      issuerName: p.issuer_name,
      recyclerName: p.recycler_name,
      recyclerLicense: p.recycler_license,
      facilityLocation: p.facility_location,
      category: p.category,
      claimedKg: p.claimed_kg,
      evidenceSupportedKg: p.evidence_supported_kg,
      recoveryRatePercent: p.recovery_rate_percent,
      estimatedValueUsd: p.estimated_value_usd,
      sha256Hash: p.sha256_hash,
      integrityStatus: p.integrity_status,
      signatureStatus: p.signature_status,
      kmsKeyArn: p.kms_key_arn,
      kmsSignatureAlgorithm: p.kms_signature_algorithm,
      digitalSignatureBase64: p.digital_signature_base64,
      hashScopeDisclaimer: p.hash_scope_disclaimer,
      revoked: p.revoked,
      revocationReason: p.revocation_reason,
      revokedAt: p.revoked_at,
      recoveryPathway: p.recovery_pathway,
      publicAttributes: p.public_attributes,
    })
  );

const timelineSchema = z
  .object({
    id: z.string(),
    timestamp: z.string(),
    actor: z.string(),
    action: z.string(),
    note: optStr,
    severity: severityEnum.nullish().transform((v) => v ?? undefined),
  })
  .transform((t) => t);

export const batchSchema = z
  .object({
    id: z.string(),
    batch_number: z.string(),
    category: categoryEnum,
    claimed_quantity: z.number(),
    unit: z.string(),
    recycler_name: z.string(),
    recycler_registration_id: z.string(),
    collection_date: z.string(),
    processing_date: z.string(),
    origin_location: z.string(),
    destination_location: z.string(),
    status: statusEnum,
    risk_score: riskSchema,
    mass_balance: massBalanceSchema,
    material_estimate: estimateSchema,
    documents: z.array(documentSchema).default([]),
    findings: z.array(findingSchema).default([]),
    passport: passportSchema.nullish().transform((v) => v ?? undefined),
    timeline: z.array(timelineSchema).default([]),
    auditor_decision: z
      .object({ decision: statusEnum, auditor_id: z.string(), reason: z.string(), timestamp: z.string() })
      .nullish()
      .transform((v) => v ?? undefined),
    explicit_rejection_reason: optStr,
    notes: optStr,
    created_at: z.string(),
    updated_at: z.string(),
  })
  .transform(
    (b): Batch => ({
      id: b.id,
      batchNumber: b.batch_number,
      category: b.category,
      claimedQuantity: b.claimed_quantity,
      unit: b.unit,
      recyclerName: b.recycler_name,
      recyclerRegistrationId: b.recycler_registration_id,
      collectionDate: b.collection_date,
      processingDate: b.processing_date,
      originLocation: b.origin_location,
      destinationLocation: b.destination_location,
      status: b.status,
      riskScore: b.risk_score,
      massBalance: b.mass_balance,
      materialEstimate: b.material_estimate,
      documents: b.documents,
      findings: b.findings,
      passport: b.passport,
      timeline: b.timeline,
      auditorDecision: b.auditor_decision && {
        decision: b.auditor_decision.decision,
        auditorId: b.auditor_decision.auditor_id,
        reason: b.auditor_decision.reason,
        timestamp: b.auditor_decision.timestamp,
      },
      explicitRejectionReason: b.explicit_rejection_reason,
      notes: b.notes,
      createdAt: b.created_at,
      updatedAt: b.updated_at,
    })
  );

export const batchListSchema = z.array(batchSchema);

const integritySchema = z.enum(["VALID", "INVALID"]);
const signatureSchema = z.enum(["VALID", "INVALID", "SIMULATED", "NOT_CONFIGURED"]);

export const publicVerifySchema = z
  .object({
    passport_id: z.string(),
    verification_status: z.string(),
    message: optStr,
    version: optNum,
    batch_number: optStr,
    category: categoryEnum.nullish().transform((v) => v ?? undefined),
    recycler_name: optStr,
    evidence_supported_kg: optNum,
    estimated_value_usd: optNum,
    recovery_rate_percent: optNum,
    issued_at: optStr,
    checked_at: optStr,
    sha256_hash: optStr,
    payload_integrity: z
      .object({ status: integritySchema, stored_sha256: z.string(), recomputed_sha256: z.string() })
      .nullish(),
    signature: z
      .object({
        status: signatureSchema,
        provider: z.string().nullish(),
        algorithm: z.string().nullish(),
        detail: z.string().nullish(),
      })
      .nullish(),
    documentary_status: statusEnum.nullish(),
    lifecycle_status: z.enum(["ACTIVE", "REVOKED"]).nullish(),
    revocation_reason: optStr,
    revoked_at: optStr,
    disclaimer: optStr,
    public_attributes: z.record(attrValue).nullish(),
  })
  .transform(
    (v): PublicVerification => ({
      found: v.verification_status === "FOUND",
      passportId: v.passport_id,
      message: v.message,
      version: v.version,
      batchNumber: v.batch_number,
      category: v.category,
      recyclerName: v.recycler_name,
      evidenceSupportedKg: v.evidence_supported_kg,
      estimatedValueUsd: v.estimated_value_usd,
      recoveryRatePercent: v.recovery_rate_percent,
      issuedAt: v.issued_at,
      checkedAt: v.checked_at,
      sha256Hash: v.sha256_hash,
      payloadIntegrity: v.payload_integrity
        ? {
            status: v.payload_integrity.status,
            storedSha256: v.payload_integrity.stored_sha256,
            recomputedSha256: v.payload_integrity.recomputed_sha256,
          }
        : undefined,
      signature: v.signature
        ? {
            status: v.signature.status,
            provider: v.signature.provider ?? null,
            algorithm: v.signature.algorithm ?? null,
            detail: v.signature.detail,
          }
        : undefined,
      documentaryStatus: v.documentary_status ?? null,
      lifecycleStatus: v.lifecycle_status ?? undefined,
      revocationReason: v.revocation_reason,
      revokedAt: v.revoked_at,
      disclaimer: v.disclaimer,
      publicAttributes: v.public_attributes ?? undefined,
    })
  );

export const tamperDemoSchema = z
  .object({
    altered_field: z.string(),
    original_value: z.number(),
    altered_value: z.number(),
    stored_sha256: z.string(),
    altered_payload_sha256: z.string(),
    integrity_check: integritySchema,
  })
  .transform(
    (t): TamperDemoResult => ({
      alteredField: t.altered_field,
      originalValue: t.original_value,
      alteredValue: t.altered_value,
      storedSha256: t.stored_sha256,
      alteredPayloadSha256: t.altered_payload_sha256,
      integrityCheck: t.integrity_check,
      persisted: false,
    })
  );

export const revokeResponseSchema = z.object({
  status: z.string(),
  passport_id: z.string(),
  documentary_status_unchanged: z.string().nullish(),
});

const integrationState = z.object({
  provider: z.string(),
  live_aws: z.boolean().default(false),
  model: z.string().nullish(),
  required: z.boolean().optional(),
});

export const integrationsSchema = z.object({
  environment: z.string(),
  region: z.string().nullable().optional().transform((v) => v ?? null),
  repository: integrationState,
  signing: integrationState,
  extraction: integrationState,
  ai: integrationState,
  evidence_storage: integrationState,
  orchestration: integrationState,
  authentication: integrationState,
});

export const uploadUrlSchema = z.object({
  doc_id: z.string(),
  storage_key: z.string(),
  upload: z.object({ url: z.string(), fields: z.record(z.string()) }),
  max_bytes: z.number(),
});

export const investigationSchema = z
  .object({
    batch_number: z.string(),
    executive_summary: z.string(),
    grounded_citations: z
      .array(
        z.object({
          document_id: z.string(),
          document_name: z.string(),
          field_label: z.string(),
          observed_value: z.unknown(),
          page_number: z.number().default(1),
        })
      )
      .default([]),
    auditor_questions: z
      .array(z.object({ target_entity: z.string(), question: z.string(), rationale: z.string(), urgency: severityEnum }))
      .default([]),
    passport_recommendation: z.string(),
    generated_by: z.string(),
    generated_at: z.string(),
  })
  .transform((r) => ({
    batchNumber: r.batch_number,
    executiveSummary: r.executive_summary,
    citations: r.grounded_citations.map((c) => ({
      documentId: c.document_id,
      documentName: c.document_name,
      fieldLabel: c.field_label,
      observedValue: String(c.observed_value ?? ""),
      pageNumber: c.page_number,
    })),
    questions: r.auditor_questions.map((q) => ({ targetEntity: q.target_entity, question: q.question, rationale: q.rationale, urgency: q.urgency })),
    passportRecommendation: r.passport_recommendation,
    generatedBy: r.generated_by,
    generatedAt: r.generated_at,
  }));

export const workflowStartSchema = z.object({ execution_arn: z.string(), status: z.string() });
export const workflowStatusSchema = z.object({ status: z.string(), started: z.string(), stopped: z.string().nullish() });
