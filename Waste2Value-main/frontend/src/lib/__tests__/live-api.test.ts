/**
 * Live Mode: failures must surface as errors and must never silently become demo data.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  fetchBatch,
  fetchBatches,
  fetchPublicVerification,
  issuePassport,
  revokePassport,
  setExecutionMode,
} from "../api-client";
import { getInitialBatches } from "../demo-data";

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

const backendBatch = {
  id: "batch-9",
  batch_number: "LIVE-9",
  category: "it_telecom",
  claimed_quantity: 100,
  unit: "kg",
  recycler_name: "R",
  recycler_registration_id: "REG",
  collection_date: "2025-01-01",
  processing_date: "2025-01-02",
  origin_location: "A",
  destination_location: "B",
  status: "REVIEW_REQUIRED",
  risk_score: {
    overall_score: 40,
    risk_level: "medium",
    policy_version: "v1",
    summary_explanation: "x",
    calculated_at: "2025-01-01T00:00:00Z",
    breakdown: { extraction_confidence: 95, evidence_completeness: 50, cross_document_consistency: 65, operational_risk: 25 },
  },
  mass_balance: {
    claimed_kg: 100,
    transported_kg: null,
    received_kg: null,
    processed_kg: null,
    recovered_kg: null,
    evidence_supported_kg: null,
    discrepancy_kg: null,
    loss_percentage: null,
    tolerance_percentage: 2,
    is_within_tolerance: false,
  },
  material_estimate: {
    total_gross_value_usd: 0,
    modeled_processing_cost_usd: 0,
    net_estimated_recovery_value_usd: 0,
    currency: "USD",
    recommended_pathway: "material_recovery",
    reference_price_date: "2025-03-01",
    dataset_version: "d",
    calculated_at: "2025-01-01T00:00:00Z",
    basis_kg: null,
    is_available: false,
  },
  documents: [],
  findings: [],
  timeline: [],
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
};

beforeEach(() => setExecutionMode("live"));
afterEach(() => {
  vi.unstubAllGlobals();
  setExecutionMode("demo");
});

describe("Live Mode never falls back to demo data", () => {
  it("surfaces an unreachable backend as a network error, not the demo dataset", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const err = await fetchBatches().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).kind).toBe("network");
    expect((err as ApiError).message).toMatch(/never falls back/);
  });

  it("surfaces HTTP errors with the server detail and status", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({ detail: "Batch 'x' not found." }, 404)));
    await expect(fetchBatch("x")).rejects.toMatchObject({ kind: "http", status: 404, message: "Batch 'x' not found." });
  });

  it("formats FastAPI validation errors", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({ detail: [{ loc: ["body", "claimed_quantity"], msg: "must be positive" }] }, 422)));
    await expect(issuePassport("b")).rejects.toThrow(/claimed_quantity: must be positive/);
  });

  it("rejects malformed responses instead of rendering partial data", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json([{ id: "only-an-id" }])));
    await expect(fetchBatches()).rejects.toMatchObject({ kind: "contract" });
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("<html>oops</html>", { status: 200 }))));
    await expect(fetchBatches()).rejects.toMatchObject({ kind: "contract" });
  });

  it("returns live data untouched and keeps unknown quantities null", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json([backendBatch])));
    const [b] = await fetchBatches();
    expect(b.batchNumber).toBe("LIVE-9");
    expect(b.massBalance.receivedKg).toBeNull();
    expect(b.materialEstimate.isAvailable).toBe(false);
    expect(getInitialBatches().map((x) => x.batchNumber)).not.toContain(b.batchNumber);
  });

  it("does not report revocation success when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({ detail: "Passport 'P' is already revoked." }, 409)));
    await expect(revokePassport("P", "reason")).rejects.toMatchObject({ status: 409 });
  });

  it("maps a not-found public verification to found:false and a network failure to an error", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({ passport_id: "X", verification_status: "NOT_FOUND", message: "No record" })));
    expect(await fetchPublicVerification("X")).toMatchObject({ found: false, passportId: "X" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await expect(fetchPublicVerification("X")).rejects.toMatchObject({ kind: "network" });
  });

  it("reports a revoked passport with an intact payload as two separate states", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        json({
          passport_id: "P",
          verification_status: "FOUND",
          payload_integrity: { status: "VALID", stored_sha256: "a".repeat(64), recomputed_sha256: "a".repeat(64) },
          signature: { status: "SIMULATED", provider: "DEMO_SIMULATED_KMS", algorithm: "RSASSA_PSS_SHA_256" },
          documentary_status: "SUPPORTED",
          lifecycle_status: "REVOKED",
        })
      )
    );
    const v = await fetchPublicVerification("P");
    expect(v.payloadIntegrity?.status).toBe("VALID");
    expect(v.lifecycleStatus).toBe("REVOKED");
    expect(v.documentaryStatus).toBe("SUPPORTED");
    expect(v.signature?.status).toBe("SIMULATED");
  });

  it("times out slow requests with a clear message", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => new Promise((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")))))
    );
    const pending = fetchBatches().catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(16000);
    const err = (await pending) as ApiError;
    vi.useRealTimers();
    expect(err.kind).toBe("network");
    expect(err.message).toMatch(/did not respond/);
  });
});
