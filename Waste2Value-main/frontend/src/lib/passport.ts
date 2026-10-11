import { Batch, CircularityPassport, PayloadIntegrityState, PublicVerification, TamperDemoResult } from "@/types";
import { canonicalJson, sha256Hex } from "./sha256";

/** The payload hashed at issuance, rebuilt from stored passport fields (same keys as the backend). */
export function passportPayload(p: CircularityPassport): Record<string, string | number> {
  return {
    passport_id: p.passportId,
    version: p.version,
    batch_id: p.batchId,
    batch_number: p.batchNumber,
    recycler_name: p.recyclerName,
    recycler_license: p.recyclerLicense,
    category: p.category,
    claimed_kg: p.claimedKg,
    evidence_supported_kg: p.evidenceSupportedKg,
    estimated_value_usd: p.estimatedValueUsd,
    issued_at: p.issueTimestamp,
  };
}

export function hashPayload(payload: Record<string, string | number>): string {
  return sha256Hex(canonicalJson(payload));
}

export function recomputePassportHash(p: CircularityPassport): string {
  return hashPayload(passportPayload(p));
}

export function checkPayloadIntegrity(p: CircularityPassport): PayloadIntegrityState {
  return recomputePassportHash(p) === p.sha256Hash ? "VALID" : "INVALID";
}

export interface DemoPassportOptions {
  passportId: string;
  issuedAt: string;
  origin: string;
}

/** Demo Mode passport issuance (browser-local). Not signed: signature state is NOT_CONFIGURED. */
export function buildDemoPassport(batch: Batch, opts: DemoPassportOptions): CircularityPassport {
  const supported = batch.massBalance.evidenceSupportedKg;
  if (supported === null || !batch.claimedQuantity) {
    throw new Error("No evidence-supported quantity is recorded for this batch.");
  }
  const base = {
    passportId: opts.passportId,
    version: 1,
    batchId: batch.id,
    batchNumber: batch.batchNumber,
    recyclerName: batch.recyclerName,
    recyclerLicense: batch.recyclerRegistrationId,
    category: batch.category,
    claimedKg: batch.massBalance.claimedKg,
    evidenceSupportedKg: supported,
    estimatedValueUsd: batch.materialEstimate.netEstimatedRecoveryValueUsd,
    issueTimestamp: opts.issuedAt,
  };
  const draft = { ...base, sha256Hash: "" } as unknown as CircularityPassport;
  const sha256Hash = hashPayload(passportPayload(draft));
  return {
    passportId: opts.passportId,
    version: 1,
    batchId: batch.id,
    batchNumber: batch.batchNumber,
    qrCodeUrl: `/verify/${opts.passportId}`,
    verificationUrl: `${opts.origin}/verify/${opts.passportId}`,
    issueTimestamp: opts.issuedAt,
    issuerName: "Waste2Value Demo Verification Engine (browser-local)",
    recyclerName: batch.recyclerName,
    recyclerLicense: batch.recyclerRegistrationId,
    facilityLocation: batch.destinationLocation,
    category: batch.category,
    claimedKg: base.claimedKg,
    evidenceSupportedKg: supported,
    recoveryRatePercent: Math.round((supported / batch.massBalance.claimedKg) * 1000) / 10,
    estimatedValueUsd: base.estimatedValueUsd,
    sha256Hash,
    integrityStatus: "VALID",
    signatureStatus: "NOT_CONFIGURED",
    hashScopeDisclaimer:
      "The SHA-256 hash lets a verifier detect modification of the passport fields since issuance. It does not identify the issuer (no signature is configured in Demo Mode) and does not prove that physical recycling took place.",
    revoked: false,
    recoveryPathway: batch.materialEstimate.recommendedPathway,
    publicAttributes: {
      co2AvoidedKg: Math.round(supported * 2.84),
      primaryRecoveredMaterial: batch.materialEstimate.fractions[0]?.materialName ?? "Mixed Metals",
      circularityScore: Math.max(70, Math.min(99, 100 - Math.trunc(batch.riskScore.overallScore * 0.4))),
      auditStatus: "EVIDENCE_SUPPORTED",
    },
  };
}

/** Public verification view for a browser-local passport (Demo Mode). */
export function demoPublicVerification(batch: Batch, p: CircularityPassport): PublicVerification {
  const recomputed = recomputePassportHash(p);
  return {
    found: true,
    passportId: p.passportId,
    version: p.version,
    batchNumber: p.batchNumber,
    category: p.category,
    recyclerName: p.recyclerName,
    evidenceSupportedKg: p.evidenceSupportedKg,
    estimatedValueUsd: p.estimatedValueUsd,
    recoveryRatePercent: p.recoveryRatePercent,
    issuedAt: p.issueTimestamp,
    checkedAt: new Date().toISOString(),
    sha256Hash: p.sha256Hash,
    payloadIntegrity: {
      status: recomputed === p.sha256Hash ? "VALID" : "INVALID",
      storedSha256: p.sha256Hash,
      recomputedSha256: recomputed,
    },
    signature: {
      status: "NOT_CONFIGURED",
      provider: null,
      algorithm: null,
      detail: "Demo Mode does not sign passports. Payload integrity alone does not establish issuer identity.",
    },
    documentaryStatus: batch.status,
    lifecycleStatus: p.revoked ? "REVOKED" : "ACTIVE",
    revocationReason: p.revocationReason,
    revokedAt: p.revokedAt,
    disclaimer: p.hashScopeDisclaimer,
    publicAttributes: p.publicAttributes,
  };
}

/** Isolated tamper demonstration: alters a COPY of the payload; nothing is persisted. */
export function demoTamper(p: CircularityPassport): TamperDemoResult {
  const payload = { ...passportPayload(p) };
  const altered = Number(payload.evidence_supported_kg) + 1;
  payload.evidence_supported_kg = altered;
  const alteredHash = hashPayload(payload);
  return {
    alteredField: "evidence_supported_kg",
    originalValue: p.evidenceSupportedKg,
    alteredValue: altered,
    storedSha256: p.sha256Hash,
    alteredPayloadSha256: alteredHash,
    integrityCheck: alteredHash === p.sha256Hash ? "VALID" : "INVALID",
    persisted: false,
  };
}
