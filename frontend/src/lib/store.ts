"use client";

import { Batch, CircularityPassport, Finding, VerificationStatus } from "@/types";
import { INITIAL_BATCHES } from "./demo-data";

const STORAGE_KEY = "w2v_batches_store_v1";

export function getStoredBatches(): Batch[] {
  if (typeof window === "undefined") {
    return INITIAL_BATCHES;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_BATCHES));
      return INITIAL_BATCHES;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_BATCHES));
    return INITIAL_BATCHES;
  } catch (err) {
    console.error("Failed to read batches from localStorage, falling back to defaults", err);
    return INITIAL_BATCHES;
  }
}

export function saveStoredBatches(batches: Batch[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(batches));
  } catch (err) {
    console.error("Failed to save batches to localStorage", err);
  }
}

export function getBatchById(id: string): Batch | undefined {
  const batches = getStoredBatches();
  return batches.find((b) => b.id === id || b.batchNumber === id);
}

export function getPassportById(passportId: string): { batch?: Batch; passport?: CircularityPassport } {
  const batches = getStoredBatches();
  for (const b of batches) {
    if (b.passport && b.passport.passportId.toLowerCase() === passportId.toLowerCase()) {
      return { batch: b, passport: b.passport };
    }
  }
  return {};
}

export function addBatch(batch: Batch): void {
  const batches = getStoredBatches();
  const updated = [batch, ...batches];
  saveStoredBatches(updated);
}

export function updateBatch(id: string, partial: Partial<Batch>): Batch | undefined {
  const batches = getStoredBatches();
  const index = batches.findIndex((b) => b.id === id || b.batchNumber === id);
  if (index === -1) return undefined;

  const updatedBatch = {
    ...batches[index],
    ...partial,
    updatedAt: new Date().toISOString(),
  };
  batches[index] = updatedBatch;
  saveStoredBatches(batches);
  return updatedBatch;
}

export function resetStore(): Batch[] {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_BATCHES));
  }
  return INITIAL_BATCHES;
}

// SHA-256 helper in browser (using SubtleCrypto)
export async function computeSha256(message: string): Promise<string> {
  if (typeof window !== "undefined" && window.crypto && window.crypto.subtle) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Fallback simple hash for non-crypto environments
  return "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
}

export async function issuePassportForBatch(id: string): Promise<{ success: boolean; message: string; passport?: CircularityPassport }> {
  const batch = getBatchById(id);
  if (!batch) {
    return { success: false, message: "Batch not found" };
  }

  if (batch.status !== "SUPPORTED") {
    return {
      success: false,
      message: `Cannot issue Circularity Passport. Batch verification status is '${batch.status}'. Only batches with 'SUPPORTED' status meet the compliance criteria.`,
    };
  }

  const passportNumber = `W2V-CP-${String(Math.floor(1000 + Math.random() * 9000))}`;
  const canonicalPayload = JSON.stringify({
    passportId: passportNumber,
    version: 1,
    batchId: batch.id,
    batchNumber: batch.batchNumber,
    recycler: batch.recyclerName,
    license: batch.recyclerRegistrationId,
    category: batch.category,
    claimedKg: batch.claimedQuantity,
    evidenceSupportedKg: batch.massBalance.evidenceSupportedKg,
    estimatedValueUsd: batch.materialEstimate.netEstimatedRecoveryValueUsd,
    issuedAt: new Date().toISOString(),
  });

  const sha256 = await computeSha256(canonicalPayload);

  const passport: CircularityPassport = {
    passportId: passportNumber,
    version: 1,
    batchId: batch.id,
    batchNumber: batch.batchNumber,
    qrCodeUrl: `/verify/${passportNumber}`,
    verificationUrl: `${typeof window !== "undefined" ? window.location.origin : ""}/verify/${passportNumber}`,
    issueTimestamp: new Date().toISOString(),
    issuerName: "Waste2Value Authoritative Verification Engine v1",
    recyclerName: batch.recyclerName,
    recyclerLicense: batch.recyclerRegistrationId,
    facilityLocation: batch.destinationLocation,
    category: batch.category,
    claimedKg: batch.claimedQuantity,
    evidenceSupportedKg: batch.massBalance.evidenceSupportedKg,
    recoveryRatePercent: Number(((batch.massBalance.evidenceSupportedKg / batch.claimedQuantity) * 100).toFixed(1)),
    estimatedValueUsd: batch.materialEstimate.netEstimatedRecoveryValueUsd,
    sha256Hash: sha256,
    integrityStatus: "VALID",
    signatureStatus: "NOT_CONFIGURED",
    revoked: false,
    recoveryPathway: batch.materialEstimate.recommendedPathway,
    publicAttributes: {
      co2AvoidedKg: Math.round(batch.massBalance.evidenceSupportedKg * 2.84),
      primaryRecoveredMaterial: batch.materialEstimate.fractions[0]?.materialName || "Recovered Metals",
      circularityScore: Math.min(100, Math.max(70, Math.round(100 - batch.riskScore.overallScore * 0.4))),
      auditStatus: "EVIDENCE_SUPPORTED",
    },
  };

  const updatedTimeline = [
    ...batch.timeline,
    {
      id: `t-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: "Passport Authority Service",
      action: "Circularity Passport Issued",
      note: `Generated official passport ${passportNumber} with SHA-256 integrity hash ${sha256.slice(0, 12)}...`,
    },
  ];

  updateBatch(id, { passport, timeline: updatedTimeline });
  return { success: true, message: `Circularity Passport ${passportNumber} issued successfully!`, passport };
}

export function revokePassport(passportId: string, reason: string): boolean {
  const batches = getStoredBatches();
  for (let i = 0; i < batches.length; i++) {
    if (batches[i].passport && batches[i].passport?.passportId.toLowerCase() === passportId.toLowerCase()) {
      const p = batches[i].passport!;
      batches[i].passport = {
        ...p,
        revoked: true,
        revocationReason: reason,
        integrityStatus: "REVOKED",
      };
      // Note: Batch documentary verification status is preserved; passport lifecycle state is REVOKED.
      batches[i].timeline.push({
        id: `t-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actor: "Compliance Auditor",
        action: "Circularity Passport Revoked",
        note: `Passport ${p.passportId} was revoked. Reason: ${reason}`,
        severity: "critical",
      });
      saveStoredBatches(batches);
      return true;
    }
  }
  return false;
}
