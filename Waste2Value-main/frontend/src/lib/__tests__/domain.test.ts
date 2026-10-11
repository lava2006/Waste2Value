import { beforeEach, describe, expect, it } from "vitest";
import {
  EMPTY_FILTERS,
  buildInvestigationQueue,
  computeDashboardMetrics,
  filterBatches,
  findingHref,
  formatDate,
  formatKg,
  formatMoney,
  formatTimestamp,
  lifecycleRows,
  passportLifecycle,
  searchEntities,
  signatureStateFromStatus,
  sortBatches,
} from "../domain";
import { getInitialBatches } from "../demo-data";
import { batchToInput, runVerification } from "../demo-engine";
import type { Batch } from "@/types";

let batches: Batch[];
const by = (n: string) => batches.find((b) => b.batchNumber === n) as Batch;

beforeEach(() => {
  batches = getInitialBatches();
});

describe("formatting", () => {
  it("never renders unknown quantities as zero", () => {
    expect(formatKg(null)).toBe("Not recorded");
    expect(formatKg(undefined)).toBe("Not recorded");
    expect(formatKg(0)).toBe("0 kg");
    expect(formatMoney(null)).toBe("Not available");
  });
  it("uses one date format and shows UTC on timestamps", () => {
    expect(formatDate("2025-04-05")).toBe("05 Apr 2025");
    expect(formatTimestamp("2025-04-05T14:10:00Z")).toBe("05 Apr 2025, 14:10 UTC");
    expect(formatDate("garbage")).toBe("Not recorded");
  });
});

describe("single source of truth across screens", () => {
  it("seed batches carry engine-derived, internally consistent values", () => {
    const a = by("BATCH-2025-001");
    expect(a.status).toBe("SUPPORTED");
    expect(a.massBalance).toMatchObject({ transportedKg: 5000, receivedKg: 4960, processedKg: 4920, evidenceSupportedKg: 4920, recoveredKg: null });
    expect(a.passport?.evidenceSupportedKg).toBe(a.massBalance.evidenceSupportedKg);
    expect(a.passport?.estimatedValueUsd).toBe(a.materialEstimate.netEstimatedRecoveryValueUsd);
    const b = by("BATCH-2025-002");
    expect(b.status).toBe("REVIEW_REQUIRED");
    expect(b.massBalance.processedKg).toBeNull();
  });

  it("lifecycle rows keep stages distinct and flag unknown ones", () => {
    const rows = lifecycleRows(by("BATCH-2025-002"));
    expect(rows.find((r) => r.key === "received")?.value).toBe(8500);
    expect(rows.find((r) => r.key === "processed")?.value).toBeNull();
    expect(rows.find((r) => r.key === "recovered")?.value).toBeNull();
  });

  it("findings have stable, unique ids so #finding-<id> deep links survive reloads", () => {
    for (const b of batches) {
      const ids = b.findings.map((f) => f.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    const again = getInitialBatches();
    expect(again.map((b) => b.findings.map((f) => f.id))).toEqual(batches.map((b) => b.findings.map((f) => f.id)));
    expect(findingHref("batch-002", "find-MB-002")).toBe("/batches/batch-002#finding-find-MB-002");
  });
});

describe("dashboard metrics", () => {
  it("counts received mass and value on evidence-supported batches only, and reports the rest separately", () => {
    const m = computeDashboardMetrics(batches);
    expect(m.totalBatches).toBe(3);
    expect(m.supportedBatchesCount).toBe(1);
    expect(m.supportedReceivedKg).toBe(4960);
    expect(m.supportedBatchesWithReceived).toBe(1);
    expect(m.unverifiedReceivedKg).toBe(8500 + 11200);
    expect(m.supportedValueUsd).toBe(by("BATCH-2025-001").materialEstimate.netEstimatedRecoveryValueUsd);
    expect(m.unverifiedValueUsd).toBeGreaterThan(0);
    expect(m.batchesRequiringReview).toBe(2);
    expect(m.rejectedCount).toBe(0);
  });

  it("excludes unknown received mass instead of adding zero, and says so", () => {
    batches[0].massBalance.receivedKg = null;
    const m = computeDashboardMetrics(batches);
    expect(m.supportedReceivedKg).toBe(0);
    expect(m.supportedBatchesWithReceived).toBe(0);
    expect(m.batchesMissingReceived).toBe(1);
  });

  it("does not value batches whose estimate is unavailable", () => {
    batches[1].materialEstimate.isAvailable = false;
    batches[1].materialEstimate.netEstimatedRecoveryValueUsd = 99999;
    const withUnavailable = computeDashboardMetrics(batches);
    expect(withUnavailable.unverifiedValueUsd).toBeLessThan(99999);
  });

  it("handles an empty dataset", () => {
    const m = computeDashboardMetrics([]);
    expect(m).toMatchObject({ totalBatches: 0, supportedReceivedKg: 0, supportedValueUsd: 0, batchesRequiringReview: 0 });
  });
});

describe("investigation queue", () => {
  it("separates review-required, rejected follow-up and historical findings", () => {
    const rejected = by("BATCH-2025-003");
    rejected.status = "REJECTED";
    const authorized = by("BATCH-2025-002");
    authorized.status = "SUPPORTED";
    const q = buildInvestigationQueue(batches);
    expect(q.every((i) => i.finding.severity !== "info")).toBe(true);
    expect(q.filter((i) => i.batch.id === rejected.id).every((i) => i.section === "rejected_followup")).toBe(true);
    expect(q.filter((i) => i.batch.id === authorized.id).every((i) => i.section === "historical")).toBe(true);
    const order = ["review_required", "rejected_followup", "historical"];
    const idx = q.map((i) => order.indexOf(i.section));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
  });

  it("links every item to its exact finding and states quantities only when recorded", () => {
    const q = buildInvestigationQueue(batches);
    const shortfall = q.find((i) => i.finding.ruleId === "MB-002");
    expect(shortfall?.href).toBe(`/batches/batch-002#finding-${shortfall?.finding.id}`);
    expect(shortfall?.quantityNote).toContain("Received 8,500 kg");
    expect(q.every((i) => i.nextAction.length > 0)).toBe(true);
  });

  it("surfaces missing evidence without inventing quantities", () => {
    const empty = by("BATCH-2025-002");
    empty.documents = [];
    empty.findings = runVerification(batchToInput(empty), []).findings;
    const q = buildInvestigationQueue([empty]);
    const completeness = q.find((i) => i.finding.ruleId === "EC-001");
    expect(completeness?.missingEvidence).toMatch(/Missing/);
    expect(completeness?.quantityNote).toBeUndefined();
    const massGap = q.find((i) => i.finding.ruleId === "MB-000");
    expect(massGap?.missingEvidence).toBe("Not recorded");
    expect(massGap?.quantityNote).toBeUndefined();
  });

  it("is empty when nothing is unresolved", () => {
    expect(buildInvestigationQueue([by("BATCH-2025-001")])).toEqual([]);
  });
});

describe("directory filtering and sorting", () => {
  it("combines filters without resetting each other", () => {
    expect(filterBatches(batches, { ...EMPTY_FILTERS, status: "REVIEW_REQUIRED" })).toHaveLength(2);
    expect(filterBatches(batches, { ...EMPTY_FILTERS, status: "REVIEW_REQUIRED", category: "large_appliances" })).toHaveLength(1);
    expect(filterBatches(batches, { ...EMPTY_FILTERS, status: "SUPPORTED", risk: "high" })).toHaveLength(0);
  });
  it("searches ids, recyclers, categories, destinations and passport ids only", () => {
    const s = (search: string) => filterBatches(batches, { ...EMPTY_FILTERS, search }).map((b) => b.batchNumber);
    expect(s("2025-002")).toEqual(["BATCH-2025-002"]);
    expect(s("greentech")).toEqual(["BATCH-2025-001"]);
    expect(s("w2v-cp-0001")).toEqual(["BATCH-2025-001"]);
    expect(s("brescia")).toEqual(["BATCH-2025-003"]);
    expect(s("large appliances")).toEqual(["BATCH-2025-003"]);
    expect(s("no-such-thing")).toEqual([]);
    expect(s("claimed 5000")).toEqual([]);
  });
  it("filters by passport lifecycle independently of status", () => {
    batches[0].passport = { ...(batches[0].passport as NonNullable<Batch["passport"]>), revoked: true };
    expect(batches[0].status).toBe("SUPPORTED");
    expect(passportLifecycle(batches[0])).toBe("REVOKED");
    expect(filterBatches(batches, { ...EMPTY_FILTERS, passport: "REVOKED" }).map((b) => b.batchNumber)).toEqual(["BATCH-2025-001"]);
    expect(filterBatches(batches, { ...EMPTY_FILTERS, passport: "NOT_ISSUED" })).toHaveLength(2);
  });
  it("sorts unknown values last in both directions", () => {
    batches[0].massBalance.receivedKg = null;
    expect(sortBatches(batches, "receivedMass", "asc").at(-1)?.batchNumber).toBe("BATCH-2025-001");
    expect(sortBatches(batches, "receivedMass", "desc").at(-1)?.batchNumber).toBe("BATCH-2025-001");
    expect(sortBatches(batches, "claimedMass", "desc")[0].batchNumber).toBe("BATCH-2025-003");
  });
});

describe("global search entities", () => {
  it("returns typed results with identifiers and handles empty queries", () => {
    expect(searchEntities(batches, "  ")).toEqual([]);
    const r = searchEntities(batches, "W2V-CP-0001");
    expect(r.map((x) => x.kind)).toEqual(expect.arrayContaining(["batch", "passport"]));
    expect(r.find((x) => x.kind === "passport")?.href).toBe("/passports/W2V-CP-0001");
    expect(searchEntities(batches, "WBR-2025-1104").find((x) => x.kind === "evidence")?.href).toBe("/evidence/doc-202");
  });
});

describe("signature state is never optimistic", () => {
  it("only a verification call can produce VALID", () => {
    expect(signatureStateFromStatus("VALID_AWS_KMS_SIGNATURE")).toBe("NOT_CHECKED");
    expect(signatureStateFromStatus("DEMO_SIMULATED_KMS_SIGNATURE")).toBe("SIMULATED");
    expect(signatureStateFromStatus("NOT_CONFIGURED")).toBe("NOT_CONFIGURED");
  });
});
