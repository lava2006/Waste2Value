import {
  Batch,
  CircularityPassport,
  VerificationStatus,
  DocumentEvidence,
  BatchTimelineEvent,
  MaterialEstimate,
} from "@/types";
import {
  getStoredBatches,
  getBatchById,
  updateBatch,
  issuePassportForBatch,
  revokePassport as revokeLocalPassport,
} from "./store";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";
const API_MODE_KEY = "w2v_execution_mode"; // "demo" | "live"

export function getExecutionMode(): "demo" | "live" {
  if (typeof window === "undefined") return "demo";
  return (localStorage.getItem(API_MODE_KEY) as "demo" | "live") || "demo";
}

export function setExecutionMode(mode: "demo" | "live"): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(API_MODE_KEY, mode);
  }
}

export class LiveVerificationError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = "LiveVerificationError";
  }
}

/**
 * Maps Python backend snake_case Batch to TypeScript camelCase Batch
 */
function mapBackendBatchToFrontend(data: any): Batch {
  return {
    id: data.id,
    batchNumber: data.batch_number,
    category: data.category,
    claimedQuantity: data.claimed_quantity,
    unit: data.unit,
    recyclerName: data.recycler_name,
    recyclerRegistrationId: data.recycler_registration_id,
    collectionDate: data.collection_date,
    processingDate: data.processing_date,
    originLocation: data.origin_location,
    destinationLocation: data.destination_location,
    status: data.status,
    riskScore: {
      overallScore: data.risk_score.overall_score,
      riskLevel: data.risk_score.risk_level,
      breakdown: {
        extractionConfidence: data.risk_score.breakdown.extraction_confidence,
        evidenceCompleteness: data.risk_score.breakdown.evidence_completeness,
        crossDocumentConsistency: data.risk_score.breakdown.cross_document_consistency,
        operationalRisk: data.risk_score.breakdown.operational_risk,
      },
      summaryExplanation: data.risk_score.summary_explanation,
      policyVersion: data.risk_score.policy_version,
      calculatedAt: data.risk_score.calculated_at,
    },
    massBalance: {
      claimedKg: data.mass_balance.claimed_kg,
      transportedKg: data.mass_balance.transported_kg,
      receivedKg: data.mass_balance.received_kg,
      processedKg: data.mass_balance.processed_kg,
      recoveredKg: data.mass_balance.recovered_kg,
      evidenceSupportedKg: data.mass_balance.evidence_supported_kg,
      discrepancyKg: data.mass_balance.discrepancy_kg,
      lossPercentage: data.mass_balance.loss_percentage,
      tolerancePercentage: data.mass_balance.tolerance_percentage,
      isWithinTolerance: data.mass_balance.is_within_tolerance,
    },
    materialEstimate: {
      totalGrossValueUsd: data.material_estimate.total_gross_value_usd,
      modeledProcessingCostUsd: data.material_estimate.modeled_processing_cost_usd,
      netEstimatedRecoveryValueUsd: data.material_estimate.net_estimated_recovery_value_usd,
      currency: data.material_estimate.currency,
      recommendedPathway: data.material_estimate.recommended_pathway,
      fractions: data.material_estimate.fractions.map((f: any) => ({
        materialName: f.material_name,
        category: f.category,
        fractionPercentage: f.fraction_percentage,
        estimatedQuantityKg: f.estimated_quantity_kg,
        unitPriceUsd: f.unit_price_usd,
        estimatedValueUsd: f.estimated_value_usd,
      })),
      assumptions: data.material_estimate.assumptions,
      referencePriceDate: data.material_estimate.reference_price_date,
      datasetVersion: data.material_estimate.dataset_version,
      calculatedAt: data.material_estimate.calculated_at,
    },
    documents: (data.documents || []).map((d: any) => ({
      id: d.id,
      batchId: d.batch_id,
      title: d.title,
      documentType: d.document_type,
      fileName: d.file_name,
      fileSize: d.file_size,
      uploadTimestamp: d.upload_timestamp,
      status: d.status,
      extractedTextSnippet: d.extracted_text_snippet,
      extractedFields: (d.extracted_fields || []).map((f: any) => ({
        id: f.id,
        documentId: f.document_id,
        fieldName: f.field_name,
        label: f.label,
        value: f.value,
        unit: f.unit,
        confidence: f.confidence,
        pageNumber: f.page_number,
        isDiscrepant: f.is_discrepant,
      })),
    })),
    findings: (data.findings || []).map((f: any) => ({
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
      recommendedAction: f.recommended_action,
      createdAt: f.created_at,
    })),
    passport: data.passport
      ? {
          passportId: data.passport.passport_id,
          version: data.passport.version,
          batchId: data.passport.batch_id,
          batchNumber: data.passport.batch_number,
          qrCodeUrl: data.passport.qr_code_url,
          verificationUrl: data.passport.verification_url,
          issueTimestamp: data.passport.issue_timestamp,
          issuerName: data.passport.issuer_name,
          recyclerName: data.passport.recycler_name,
          recyclerLicense: data.passport.recycler_license,
          facilityLocation: data.passport.facility_location,
          category: data.passport.category,
          claimedKg: data.passport.claimed_kg,
          evidenceSupportedKg: data.passport.evidence_supported_kg,
          recoveryRatePercent: data.passport.recovery_rate_percent,
          estimatedValueUsd: data.passport.estimated_value_usd,
          sha256Hash: data.passport.sha256_hash,
          integrityStatus: data.passport.integrity_status,
          signatureStatus: data.passport.signature_status,
          kmsKeyArn: data.passport.kms_key_arn,
          kmsSignatureAlgorithm: data.passport.kms_signature_algorithm,
          digitalSignatureBase64: data.passport.digital_signature_base64,
          hashScopeDisclaimer: data.passport.hash_scope_disclaimer,
          revoked: data.passport.revoked,
          revocationReason: data.passport.revocation_reason,
          recoveryPathway: data.passport.recovery_pathway,
          publicAttributes: data.passport.public_attributes,
        }
      : undefined,
    timeline: (data.timeline || []).map((t: any) => ({
      id: t.id,
      timestamp: t.timestamp,
      actor: t.actor,
      action: t.action,
      note: t.note,
      severity: t.severity,
    })),
    auditorDecision: data.auditor_decision
      ? {
          decision: data.auditor_decision.decision,
          auditorId: data.auditor_decision.auditor_id,
          reason: data.auditor_decision.reason,
          timestamp: data.auditor_decision.timestamp,
        }
      : undefined,
    explicitRejectionReason: data.explicit_rejection_reason,
    notes: data.notes,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function fetchBatches(): Promise<{ batches: Batch[]; mode: "demo" | "live" }> {
  const mode = getExecutionMode();
  if (mode === "demo") {
    return { batches: getStoredBatches(), mode: "demo" };
  }

  try {
    const res = await fetch(`${API_BASE_URL}/batches`, { cache: "no-store" });
    if (!res.ok) {
      throw new LiveVerificationError(
        `Live Verification Server returned HTTP ${res.status}: ${res.statusText}`,
        res.status
      );
    }
    const data = await res.json();
    return { batches: data.map(mapBackendBatchToFrontend), mode: "live" };
  } catch (err: any) {
    if (err instanceof LiveVerificationError) throw err;
    throw new LiveVerificationError(
      `Live Verification Service unreachable at ${API_BASE_URL}. Ensure FastAPI service is running. (Demo fallback is disabled in Live Mode to prevent silent falsification).`
    );
  }
}

export async function fetchBatchById(id: string): Promise<{ batch: Batch; mode: "demo" | "live" }> {
  const mode = getExecutionMode();
  if (mode === "demo") {
    const b = getBatchById(id);
    if (!b) throw new Error(`Batch '${id}' not found in local demo store.`);
    return { batch: b, mode: "demo" };
  }

  try {
    const res = await fetch(`${API_BASE_URL}/batches/${id}`, { cache: "no-store" });
    if (!res.ok) {
      throw new LiveVerificationError(
        `Live Verification Server returned HTTP ${res.status} for batch '${id}'.`,
        res.status
      );
    }
    const data = await res.json();
    return { batch: mapBackendBatchToFrontend(data), mode: "live" };
  } catch (err: any) {
    if (err instanceof LiveVerificationError) throw err;
    throw new LiveVerificationError(
      `Live Verification Service unreachable. Could not fetch batch '${id}'. Demo fallback is disabled in Live Mode.`
    );
  }
}

export async function issuePassport(id: string): Promise<{ success: boolean; message: string; passport?: CircularityPassport; mode: "demo" | "live" }> {
  const mode = getExecutionMode();
  if (mode === "demo") {
    const res = await issuePassportForBatch(id);
    return { ...res, mode: "demo" };
  }

  try {
    const res = await fetch(`${API_BASE_URL}/batches/${id}/passport`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new LiveVerificationError(
        errData.detail || `Passport issuance failed with status ${res.status}. Batch does not meet compliance criteria.`,
        res.status
      );
    }
    const p = await res.json();
    return {
      success: true,
      message: `Circularity Passport ${p.passport_id} issued successfully via live verification engine.`,
      passport: {
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
        recoveryPathway: p.recovery_pathway,
        publicAttributes: p.public_attributes,
      },
      mode: "live",
    };
  } catch (err: any) {
    if (err instanceof LiveVerificationError) throw err;
    throw new LiveVerificationError(
      `Live Passport Issuance failed: ${err.message || "Network Error"}. Demo fallback is disabled in Live Mode.`
    );
  }
}

export async function recordAuditorDecision(
  batchId: string,
  decision: VerificationStatus,
  reason: string,
  auditorId: string = "AUDITOR-EU-COMPLIANCE-01"
): Promise<{ success: boolean; batch: Batch; mode: "demo" | "live" }> {
  const mode = getExecutionMode();
  if (mode === "demo") {
    const updated = updateBatch(batchId, {
      status: decision,
      explicitRejectionReason: decision === "REJECTED" ? reason : undefined,
      auditorDecision: {
        decision,
        auditorId,
        reason,
        timestamp: new Date().toISOString(),
      },
    });
    if (!updated) throw new Error("Batch not found");
    return { success: true, batch: updated, mode: "demo" };
  }

  try {
    const res = await fetch(`${API_BASE_URL}/batches/${batchId}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, reason, auditor_id: auditorId }),
    });
    if (!res.ok) {
      throw new LiveVerificationError(`Audit decision failed with status ${res.status}.`, res.status);
    }
    const data = await res.json();
    return { success: true, batch: mapBackendBatchToFrontend(data), mode: "live" };
  } catch (err: any) {
    if (err instanceof LiveVerificationError) throw err;
    throw new LiveVerificationError(`Live Audit Decision failed: ${err.message}. Demo fallback is disabled.`);
  }
}

function mapBackendDocToFrontend(d: any): DocumentEvidence {
  return {
    id: d.id,
    batchId: d.batch_id,
    title: d.title,
    documentType: d.document_type,
    fileName: d.file_name,
    fileSize: d.file_size || "1.0 MB",
    uploadTimestamp: d.upload_timestamp,
    status: d.status || "extracted",
    extractedTextSnippet: d.extracted_text_snippet,
    extractedFields: (d.extracted_fields || []).map((f: any) => ({
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
    })),
  };
}

export async function patchBatch(
  batchId: string,
  partial: Partial<Batch>
): Promise<{ success: boolean; batch: Batch; mode: "demo" | "live" }> {
  const mode = getExecutionMode();
  if (mode === "demo") {
    const updated = updateBatch(batchId, partial);
    if (!updated) throw new Error("Batch not found in local store.");
    return { success: true, batch: updated, mode: "demo" };
  }
  try {
    const res = await fetch(`${API_BASE_URL}/batches/${batchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial),
    });
    if (!res.ok) throw new LiveVerificationError(`Update failed: ${res.statusText}`, res.status);
    const data = await res.json();
    return { success: true, batch: mapBackendBatchToFrontend(data), mode: "live" };
  } catch (err: any) {
    if (err instanceof LiveVerificationError) throw err;
    throw new LiveVerificationError(`Live Update failed: ${err.message}`);
  }
}

export async function fetchDocument(docId: string): Promise<DocumentEvidence> {
  const mode = getExecutionMode();
  if (mode === "demo") {
    const batches = getStoredBatches();
    for (const b of batches) {
      const doc = b.documents.find((d) => d.id === docId);
      if (doc) return doc;
    }
    throw new Error("Document not found");
  }
  const res = await fetch(`${API_BASE_URL}/documents/${docId}`);
  if (!res.ok) throw new LiveVerificationError(`Failed to fetch document: ${res.statusText}`, res.status);
  const data = await res.json();
  return mapBackendDocToFrontend(data);
}

export async function extractDocumentById(docId: string): Promise<DocumentEvidence> {
  const mode = getExecutionMode();
  if (mode === "demo") {
    return fetchDocument(docId);
  }
  const res = await fetch(`${API_BASE_URL}/documents/${docId}/extract`, { method: "POST" });
  if (!res.ok) throw new LiveVerificationError(`Document extraction failed: ${res.statusText}`, res.status);
  const data = await res.json();
  return mapBackendDocToFrontend(data);
}

export async function correctDocumentField(
  docId: string,
  fieldId: string,
  correctedValue: any,
  reason: string,
  auditorId: string = "AUDITOR-EU-COMPLIANCE-01"
): Promise<DocumentEvidence> {
  const mode = getExecutionMode();
  if (mode === "demo") {
    const doc = await fetchDocument(docId);
    const field = doc.extractedFields.find((f) => f.id === fieldId);
    if (field) {
      field.value = correctedValue;
      field.confidence = 1.0;
    }
    return doc;
  }
  const res = await fetch(`${API_BASE_URL}/documents/${docId}/fields`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      field_id: fieldId,
      corrected_value: correctedValue,
      reason,
      auditor_id: auditorId,
    }),
  });
  if (!res.ok) throw new LiveVerificationError(`Field correction failed: ${res.statusText}`, res.status);
  const data = await res.json();
  return mapBackendDocToFrontend(data);
}

export async function fetchBatchHistory(batchId: string): Promise<BatchTimelineEvent[]> {
  const mode = getExecutionMode();
  if (mode === "demo") {
    const batch = getBatchById(batchId);
    return batch ? batch.timeline : [];
  }
  const res = await fetch(`${API_BASE_URL}/batches/${batchId}/history`);
  if (!res.ok) throw new LiveVerificationError(`History fetch failed: ${res.statusText}`, res.status);
  return await res.json();
}

export async function estimateBatchMaterial(batchId: string): Promise<MaterialEstimate> {
  const mode = getExecutionMode();
  if (mode === "demo") {
    const batch = getBatchById(batchId);
    if (!batch) throw new Error("Batch not found");
    return batch.materialEstimate;
  }
  const res = await fetch(`${API_BASE_URL}/batches/${batchId}/estimate`, { method: "POST" });
  if (!res.ok) throw new LiveVerificationError(`Estimate failed: ${res.statusText}`, res.status);
  return await res.json();
}
