/**
 * Demo Mode end-to-end workflow through the same data layer the pages use:
 * intake -> verification -> findings -> evidence -> valuation -> passport -> public
 * verification -> revocation, plus cross-screen consistency and regression cases.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  ApiError,
  attachEvidence,
  correctField,
  createBatch,
  EvidenceDraft,
  fetchBatch,
  fetchBatches,
  fetchEvidenceContext,
  fetchPassportRecord,
  fetchPublicVerification,
  issuePassport,
  recordDecision,
  revokePassport,
  runTamperDemo,
  setExecutionMode,
  verifyBatch,
} from "../api-client";
import { resetStore } from "../store";
import { buildInvestigationQueue, computeDashboardMetrics, lifecycleRows, passportLifecycle } from "../domain";
import { BatchInput } from "../demo-engine";
import { recomputePassportHash } from "../passport";

const input = (n: string, over: Partial<BatchInput> = {}): BatchInput => ({
  batchNumber: n,
  category: "it_telecom",
  claimedQuantity: 5000,
  unit: "kg",
  recyclerName: "GreenTech Circular Ltd",
  recyclerRegistrationId: "REG-1",
  collectionDate: "2025-04-01",
  processingDate: "2025-04-05",
  originLocation: "Frankfurt",
  destinationLocation: "Leipzig",
  ...over,
});

const draft = (id: string, type: EvidenceDraft["documentType"], field: string, label: string, value: number): EvidenceDraft => ({
  localId: id,
  title: label,
  documentType: type,
  fileName: `${id}.pdf`,
  fileSize: "10 KB",
  fields: [{ fieldName: field, label, value, unit: "kg" }],
});

const cleanEvidence = [
  draft("wb", "transport_waybill", "manifest_weight", "Waybill weight", 5000),
  draft("sc", "weighbridge_record", "net_weight", "Weighbridge net", 4960),
  draft("ce", "recycling_certificate", "certified_weight", "Certified weight", 4920),
];

beforeEach(() => {
  setExecutionMode("demo");
  resetStore();
});

describe("full intake-to-revocation workflow (Demo Mode)", () => {
  it("runs every stage and keeps one consistent record", async () => {
    // 1-8: submit and verify
    const { batch, failedEvidence } = await createBatch({ input: input("BATCH-W-1"), evidence: cleanEvidence });
    expect(failedEvidence).toEqual([]);
    expect(batch.status).toBe("SUPPORTED");
    expect(batch.documents).toHaveLength(3);
    expect(batch.massBalance).toMatchObject({ claimedKg: 5000, transportedKg: 5000, receivedKg: 4960, processedKg: 4920, evidenceSupportedKg: 4920, recoveredKg: null });

    // 9-12: batch detail, findings, evidence context, valuation
    const detail = await fetchBatch(batch.id);
    expect(detail.findings.map((f) => f.ruleId)).toEqual(["MB-001"]);
    expect(detail.materialEstimate).toMatchObject({ isAvailable: true, basisKg: 4920, currency: "USD" });
    const ctx = await fetchEvidenceContext(batch.documents[0].id);
    expect(ctx.batch.id).toBe(batch.id);
    expect(ctx.documentId).toBe(batch.documents[0].id);
    expect(batch.documents.flatMap((d) => d.extractedFields).every((f) => f.extractionSource === "manual_entry")).toBe(true);

    // 13: issue a passport (only when permitted)
    const issued = await issuePassport(batch.id);
    expect(issued.passport.evidenceSupportedKg).toBe(4920);
    expect(issued.passport.estimatedValueUsd).toBe(detail.materialEstimate.netEstimatedRecoveryValueUsd);
    expect(issued.passport.signatureStatus).toBe("NOT_CONFIGURED");
    expect(recomputePassportHash(issued.passport)).toBe(issued.passport.sha256Hash);

    // 14: public verification
    const pub = await fetchPublicVerification(issued.passport.passportId);
    expect(pub.found).toBe(true);
    expect(pub.payloadIntegrity?.status).toBe("VALID");
    expect(pub.signature?.status).toBe("NOT_CONFIGURED");
    expect(pub.documentaryStatus).toBe("SUPPORTED");
    expect(pub.lifecycleStatus).toBe("ACTIVE");

    // tamper demo is isolated
    const demo = await runTamperDemo(issued.passport);
    expect(demo.integrityCheck).toBe("INVALID");
    expect(demo.persisted).toBe(false);
    expect((await fetchPublicVerification(issued.passport.passportId)).payloadIntegrity?.status).toBe("VALID");
    expect((await fetchPassportRecord(issued.passport.passportId)).passport.sha256Hash).toBe(issued.passport.sha256Hash);

    // 15-16: revoke without touching documentary status or integrity
    const revoked = await revokePassport(issued.passport.passportId, "Post-closure discrepancy");
    expect(revoked.batch.status).toBe("SUPPORTED");
    expect(revoked.passport.revoked).toBe(true);
    expect(revoked.passport.integrityStatus).toBe("VALID");
    const after = await fetchPublicVerification(issued.passport.passportId);
    expect(after.payloadIntegrity?.status).toBe("VALID");
    expect(after.lifecycleStatus).toBe("REVOKED");
    expect(after.documentaryStatus).toBe("SUPPORTED");
    expect(passportLifecycle(revoked.batch)).toBe("REVOKED");
    await expect(revokePassport(issued.passport.passportId, "again")).rejects.toThrow(/already revoked/);
    await expect(issuePassport(batch.id)).rejects.toThrow(/revoked/);
  });

  it("only issues passports for evidence-supported batches", async () => {
    const { batch } = await createBatch({ input: input("BATCH-W-2"), evidence: [cleanEvidence[0]] });
    expect(batch.status).toBe("REVIEW_REQUIRED");
    await expect(issuePassport(batch.id)).rejects.toThrow(/Must be 'SUPPORTED'/);
  });
});

describe("unknown values stay unknown", () => {
  it("a batch without evidence has no received/processed/valuation figures", async () => {
    const { batch } = await createBatch({ input: input("BATCH-W-3"), evidence: [] });
    const rows = lifecycleRows(batch);
    expect(rows.filter((r) => r.key !== "claimed").every((r) => r.value === null)).toBe(true);
    expect(batch.materialEstimate.isAvailable).toBe(false);
    expect(batch.findings.some((f) => f.ruleId === "MB-000")).toBe(true);
    const metrics = computeDashboardMetrics([batch]);
    expect(metrics.supportedReceivedKg).toBe(0);
    expect(metrics.batchesMissingReceived).toBe(1);
  });

  it("a weighbridge receipt does not become processed or recovered mass", async () => {
    const { batch } = await createBatch({ input: input("BATCH-W-4"), evidence: [cleanEvidence[1]] });
    expect(batch.massBalance.receivedKg).toBe(4960);
    expect(batch.massBalance.processedKg).toBeNull();
    expect(batch.massBalance.recoveredKg).toBeNull();
  });

  it("unit conversion is applied to the claim", async () => {
    const { batch } = await createBatch({ input: input("BATCH-W-5", { claimedQuantity: 5, unit: "metric_ton" }), evidence: [] });
    expect(batch.massBalance.claimedKg).toBe(5000);
    expect(batch.claimedQuantity).toBe(5);
  });
});

describe("batch creation regressions", () => {
  it("rejects a duplicate batch number", async () => {
    await createBatch({ input: input("BATCH-W-6"), evidence: [] });
    await expect(createBatch({ input: input("BATCH-W-6"), evidence: [] })).rejects.toBeInstanceOf(ApiError);
  });

  it("lists new batches alongside the seed data", async () => {
    await createBatch({ input: input("BATCH-W-7"), evidence: [] });
    expect((await fetchBatches()).map((b) => b.batchNumber)).toContain("BATCH-W-7");
    expect(await fetchBatches()).toHaveLength(4);
  });

  it("retrying evidence registration is idempotent", async () => {
    const { batch } = await createBatch({ input: input("BATCH-W-8"), evidence: [cleanEvidence[0]] });
    await attachEvidence(batch.id, [cleanEvidence[1]]);
    const again = await attachEvidence(batch.id, [cleanEvidence[1]]);
    expect(again.batch.documents).toHaveLength(2);
  });

  it("unknown batch, passport and document ids fail with 404-style errors", async () => {
    await expect(fetchBatch("nope")).rejects.toMatchObject({ status: 404 });
    await expect(fetchPassportRecord("nope")).rejects.toMatchObject({ status: 404 });
    await expect(fetchEvidenceContext("nope")).rejects.toMatchObject({ status: 404 });
    expect(await fetchPublicVerification("nope")).toMatchObject({ found: false });
  });
});

describe("corrections, decisions and re-verification", () => {
  it("a correction keeps the original, marks the field, and re-verifies", async () => {
    const { batch } = await createBatch({ input: input("BATCH-W-9"), evidence: cleanEvidence });
    expect(batch.status).toBe("SUPPORTED");
    const doc = batch.documents.find((d) => d.documentType === "weighbridge_record")!;
    const field = doc.extractedFields[0];
    const fixed = await correctField(batch.id, doc.id, field.id, 3000, "Scale slip re-read");
    const f = fixed.documents.find((d) => d.id === doc.id)!.extractedFields[0];
    expect(f).toMatchObject({ value: 3000, originalValue: 4960, isCorrected: true, correctionReason: "Scale slip re-read" });
    expect(f.correctedAt).toBeTruthy();
    expect(fixed.massBalance.receivedKg).toBe(3000);
    expect(fixed.status).toBe("REVIEW_REQUIRED");
    expect(fixed.timeline.some((t) => t.action === "Verification Re-run")).toBe(true);
    // a second correction still reports the very first extracted value
    const again = await correctField(batch.id, doc.id, field.id, 3100, "second pass");
    expect(again.documents.find((d) => d.id === doc.id)!.extractedFields[0].originalValue).toBe(4960);
  });

  it("requires a justification for corrections, decisions and revocations", async () => {
    const { batch } = await createBatch({ input: input("BATCH-W-10"), evidence: cleanEvidence });
    await expect(correctField(batch.id, batch.documents[0].id, batch.documents[0].extractedFields[0].id, 1, "  ")).rejects.toThrow(/justification/);
    await expect(recordDecision(batch.id, "REJECTED", " ")).rejects.toThrow(/justification/);
    const { passport } = await issuePassport(batch.id);
    await expect(revokePassport(passport.passportId, "")).rejects.toThrow(/justification/);
  });

  it("an explicit rejection survives re-verification and keeps historical findings", async () => {
    const { batch } = await createBatch({ input: input("BATCH-W-11"), evidence: [cleanEvidence[0]] });
    const rejected = await recordDecision(batch.id, "REJECTED", "Fraud confirmed");
    expect(rejected.status).toBe("REJECTED");
    expect(rejected.findings.length).toBeGreaterThan(0);
    const rechecked = await verifyBatch(batch.id);
    expect(rechecked.status).toBe("REJECTED");
    expect(rechecked.findings.length).toBeGreaterThan(0);
    const queue = buildInvestigationQueue([rechecked]);
    expect(queue.length).toBeGreaterThan(0);
    expect(queue.every((q) => q.section === "rejected_followup")).toBe(true);
    // a non-decision status is refused
    await expect(recordDecision(batch.id, "REVOKED", "x")).rejects.toThrow(/must be/);
  });
});

describe("one batch, identical values on every screen", () => {
  it("directory, detail, dashboard, evidence and passport agree for the seed batch", async () => {
    const list = (await fetchBatches()).find((b) => b.batchNumber === "BATCH-2025-001")!;
    const detail = await fetchBatch(list.id);
    const ctx = await fetchEvidenceContext(list.id);
    const passport = await fetchPassportRecord(list.passport!.passportId);
    const pub = await fetchPublicVerification(list.passport!.passportId);
    for (const view of [detail, ctx.batch, passport.batch]) {
      expect(view.status).toBe(list.status);
      expect(view.massBalance).toEqual(list.massBalance);
    }
    expect(passport.passport.evidenceSupportedKg).toBe(list.massBalance.evidenceSupportedKg);
    expect(pub.evidenceSupportedKg).toBe(list.massBalance.evidenceSupportedKg);
    expect(pub.estimatedValueUsd).toBe(list.materialEstimate.netEstimatedRecoveryValueUsd);
    expect(computeDashboardMetrics(await fetchBatches()).supportedReceivedKg).toBe(list.massBalance.receivedKg);
  });

  it("seed passport hash is a real, verifiable hash", async () => {
    const pub = await fetchPublicVerification("W2V-CP-0001");
    expect(pub.payloadIntegrity?.status).toBe("VALID");
    expect(pub.payloadIntegrity?.storedSha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
