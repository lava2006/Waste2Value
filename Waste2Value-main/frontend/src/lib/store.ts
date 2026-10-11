"use client";

/**
 * Demo Mode persistence: a browser-local (localStorage) dataset. Nothing here is an
 * authoritative record. Live Mode never reads or writes this store.
 */
import { Batch, CircularityPassport, DocumentEvidence, ExtractedField, VerificationStatus } from "@/types";
import { getInitialBatches } from "./demo-data";
import { reverifyBatch, runVerification, BatchInput } from "./demo-engine";
import { buildDemoPassport } from "./passport";

const STORAGE_KEY = "w2v_demo_store_v2";
const LEGACY_KEYS = ["w2v_batches_store_v1"];

export class DemoStoreError extends Error {
  constructor(message: string, public code: "not_found" | "conflict" | "invalid" = "invalid") {
    super(message);
    this.name = "DemoStoreError";
  }
}

let memory: Batch[] | null = null;

function load(): Batch[] {
  if (typeof window === "undefined") return getInitialBatches();
  if (memory) return memory;
  try {
    for (const k of LEGACY_KEYS) localStorage.removeItem(k);
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        memory = parsed as Batch[];
        return memory;
      }
    }
  } catch {
    // fall through to the seed dataset
  }
  memory = getInitialBatches();
  persist(memory);
  return memory;
}

function persist(batches: Batch[]): void {
  memory = batches;
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(batches));
  } catch {
    // Storage may be full/blocked; the in-memory copy still serves this session.
  }
}

export function getStoredBatches(): Batch[] {
  return load();
}

export function getBatchById(id: string): Batch | undefined {
  return load().find((b) => b.id === id || b.batchNumber === id);
}

export function getPassportById(passportId: string): { batch?: Batch; passport?: CircularityPassport } {
  const needle = passportId.toLowerCase();
  for (const b of load()) {
    if (b.passport && b.passport.passportId.toLowerCase() === needle) return { batch: b, passport: b.passport };
  }
  return {};
}

export function findBatchByDocumentId(docId: string): { batch: Batch; doc: DocumentEvidence } | undefined {
  for (const b of load()) {
    const d = b.documents.find((x) => x.id === docId);
    if (d) return { batch: b, doc: d };
  }
  return undefined;
}

function replace(updated: Batch): Batch {
  const batches = load().map((b) => (b.id === updated.id ? updated : b));
  persist(batches);
  return updated;
}

function eventId(): string {
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function resetStore(): Batch[] {
  const seed = getInitialBatches();
  persist(seed);
  return seed;
}

export interface NewBatchPayload {
  input: BatchInput;
  notes?: string;
  documents: DocumentEvidence[];
}

/** Create a batch and run the demo engine over its evidence. */
export function createDemoBatch(payload: NewBatchPayload): Batch {
  const existing = load().find((b) => b.batchNumber === payload.input.batchNumber);
  if (existing) throw new DemoStoreError(`Batch with number '${payload.input.batchNumber}' already exists.`, "conflict");
  const id = `batch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  const documents = payload.documents.map((d) => ({
    ...d,
    batchId: id,
    extractedFields: d.extractedFields.map((f) => ({ ...f })),
  }));
  const r = runVerification(payload.input, documents);
  const batch: Batch = {
    id,
    ...payload.input,
    notes: payload.notes,
    status: r.status,
    riskScore: r.riskScore,
    massBalance: r.massBalance,
    materialEstimate: r.materialEstimate,
    findings: r.findings,
    documents,
    timeline: [
      {
        id: eventId(),
        timestamp: now,
        actor: "Enterprise Intake Portal (Demo)",
        action: "Batch Intake Registered",
        note: `Batch ${payload.input.batchNumber} submitted with ${documents.length} evidence record(s).`,
      },
      {
        id: eventId(),
        timestamp: now,
        actor: "Deterministic Verification Engine (Demo)",
        action: "Verification Completed",
        note: `Automated result: ${r.status}. ${r.findings.filter((f) => f.severity !== "info").length} finding(s) require attention.`,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
  persist([batch, ...load()]);
  return batch;
}

export function demoAttachDocuments(batchId: string, docs: DocumentEvidence[]): Batch {
  const b = getBatchById(batchId);
  if (!b) throw new DemoStoreError(`Batch '${batchId}' not found.`, "not_found");
  const fresh = docs.filter((d) => !b.documents.some((x) => x.id === d.id)).map((d) => ({ ...d, batchId: b.id }));
  if (fresh.length === 0) return b;
  return replace(
    reverifyBatch({ ...b, documents: [...b.documents, ...fresh] }, `Evidence attached: ${fresh.map((d) => d.fileName).join(", ")}`, "Document Intake Service (Demo)")
  );
}

export function demoVerify(id: string): Batch {
  const b = getBatchById(id);
  if (!b) throw new DemoStoreError(`Batch '${id}' not found.`, "not_found");
  return replace(reverifyBatch(b, "Verification requested"));
}

export function demoIssuePassport(id: string, origin: string): { batch: Batch; passport: CircularityPassport } {
  const b = getBatchById(id);
  if (!b) throw new DemoStoreError(`Batch '${id}' not found.`, "not_found");
  if (b.passport) {
    if (b.passport.revoked) throw new DemoStoreError(`Passport '${b.passport.passportId}' was revoked; re-issuance is not supported.`, "conflict");
    return { batch: b, passport: b.passport };
  }
  if (b.status !== "SUPPORTED") {
    throw new DemoStoreError(`Cannot issue passport. Batch status is '${b.status}'. Must be 'SUPPORTED'.`);
  }
  const passportId = `W2V-CP-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  const issuedAt = new Date().toISOString();
  const passport = buildDemoPassport(b, { passportId, issuedAt, origin });
  const updated = replace({
    ...b,
    passport,
    timeline: [
      ...b.timeline,
      {
        id: eventId(),
        timestamp: issuedAt,
        actor: "Passport Authority Service (Demo)",
        action: "Circularity Passport Issued",
        note: `Issued ${passportId} (SHA-256 ${passport.sha256Hash.slice(0, 12)}...). Signature state: NOT_CONFIGURED.`,
      },
    ],
    updatedAt: issuedAt,
  });
  return { batch: updated, passport };
}

export function demoRevokePassport(passportId: string, reason: string): { batch: Batch; passport: CircularityPassport } {
  if (!reason.trim()) throw new DemoStoreError("A revocation justification is required.");
  const { batch, passport } = getPassportById(passportId);
  if (!batch || !passport) throw new DemoStoreError(`Passport '${passportId}' not found.`, "not_found");
  if (passport.revoked) throw new DemoStoreError(`Passport '${passportId}' is already revoked.`, "conflict");
  const now = new Date().toISOString();
  // Passport lifecycle only: batch.status and passport.integrityStatus are NOT modified.
  const revoked: CircularityPassport = { ...passport, revoked: true, revocationReason: reason.trim(), revokedAt: now };
  const updated = replace({
    ...batch,
    passport: revoked,
    timeline: [
      ...batch.timeline,
      {
        id: eventId(),
        timestamp: now,
        actor: "Passport Authority Service (Demo)",
        action: "Circularity Passport Revoked",
        note: `Passport ${passportId} revoked. Reason: ${reason.trim()}. Documentary verification status unchanged (${batch.status}).`,
        severity: "critical",
      },
    ],
    updatedAt: now,
  });
  return { batch: updated, passport: revoked };
}

export function demoRecordDecision(
  id: string,
  decision: VerificationStatus,
  reason: string,
  auditorId: string
): Batch {
  if (!["SUPPORTED", "REVIEW_REQUIRED", "REJECTED"].includes(decision)) {
    throw new DemoStoreError("An audit decision must be SUPPORTED, REVIEW_REQUIRED or REJECTED.", "invalid");
  }
  if (!reason.trim()) throw new DemoStoreError("A decision justification is required.");
  const b = getBatchById(id);
  if (!b) throw new DemoStoreError(`Batch '${id}' not found.`, "not_found");
  const now = new Date().toISOString();
  return replace({
    ...b,
    status: decision,
    explicitRejectionReason: decision === "REJECTED" ? reason.trim() : undefined,
    auditorDecision: { decision, auditorId, reason: reason.trim(), timestamp: now },
    timeline: [
      ...b.timeline,
      {
        id: eventId(),
        timestamp: now,
        actor: `Auditor label '${auditorId}' (demo, unauthenticated)`,
        action: `Official Audit Decision: ${decision}`,
        note: reason.trim(),
        severity: decision === "REJECTED" ? "critical" : "info",
      },
    ],
    updatedAt: now,
  });
}

export function demoCorrectField(
  docId: string,
  fieldId: string,
  correctedValue: string | number,
  reason: string,
  auditorId: string
): { batch: Batch; doc: DocumentEvidence } {
  if (!reason.trim()) throw new DemoStoreError("A correction justification is required.");
  const found = findBatchByDocumentId(docId);
  if (!found) throw new DemoStoreError(`Document '${docId}' not found.`, "not_found");
  const { batch } = found;
  const now = new Date().toISOString();
  let label = fieldId;
  let before: string | number = "";
  let located = false;
  const documents = batch.documents.map((d) => {
    if (d.id !== docId) return d;
    return {
      ...d,
      extractedFields: d.extractedFields.map((f): ExtractedField => {
        if (f.id !== fieldId) return f;
        located = true;
        label = f.label;
        before = f.value;
        return {
          ...f,
          originalValue: f.isCorrected ? f.originalValue : f.value,
          value: correctedValue,
          confidence: 1.0,
          isCorrected: true,
          correctedAt: now,
          correctedBy: auditorId,
          correctionReason: reason.trim(),
        };
      }),
    };
  });
  if (!located) throw new DemoStoreError(`Field '${fieldId}' not found on document '${docId}'.`, "not_found");
  const passportNote = batch.passport
    ? ` Passport ${batch.passport.passportId} was issued before this correction and has not been re-issued.`
    : "";
  const withCorrection: Batch = {
    ...batch,
    documents,
    timeline: [
      ...batch.timeline,
      {
        id: eventId(),
        timestamp: now,
        actor: `Auditor label '${auditorId}' (demo, unauthenticated)`,
        action: `Field Value Corrected: ${label}`,
        note: `Updated from '${before}' to '${correctedValue}'. Justification: ${reason.trim()}.${passportNote}`,
        severity: "info",
      },
    ],
  };
  const updated = replace(reverifyBatch(withCorrection, `Re-verified after correction of '${label}'`));
  return { batch: updated, doc: updated.documents.find((d) => d.id === docId) as DocumentEvidence };
}
