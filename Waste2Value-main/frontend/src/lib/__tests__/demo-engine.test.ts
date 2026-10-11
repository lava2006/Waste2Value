import { describe, expect, it } from "vitest";
import fixture from "./backend-parity.fixture.json";
import { runVerification, estimateMaterialValue, normalizeToKg, BatchInput } from "../demo-engine";
import type { DocumentEvidence, DocumentType, EwasteCategory } from "@/types";

interface FixtureCase {
  input: BatchInput;
  documents: { id: string; type: string; fileName: string; fields: { id: string; fieldName: string; value: string | number; unit: string | null }[] }[];
  expected: {
    status: string;
    massBalance: Record<string, number | boolean | null>;
    riskScore: number;
    riskLevel: string;
    net: number;
    available: boolean;
    findingIds: string[];
    severities: string[];
  };
}

function toDocs(c: FixtureCase): DocumentEvidence[] {
  return c.documents.map((d) => ({
    id: d.id,
    batchId: "b",
    title: d.type,
    documentType: d.type as DocumentType,
    fileName: d.fileName,
    fileSize: "1 KB",
    uploadTimestamp: "2025-01-01T00:00:00Z",
    status: "extracted",
    contentStored: false,
    extractedFields: d.fields.map((f) => ({
      id: f.id,
      documentId: d.id,
      fieldName: f.fieldName,
      label: f.fieldName,
      value: f.value,
      unit: f.unit ?? undefined,
      confidence: 0.95,
      pageNumber: 1,
      extractionSource: "unspecified" as const,
    })),
  }));
}

// The fixture is produced by running the Python engine (backend/app/verification) on the
// same inputs, so these tests fail if the demo port drifts from the backend rules.
describe("demo engine parity with the Python backend", () => {
  for (const [name, raw] of Object.entries(fixture as unknown as Record<string, FixtureCase>)) {
    it(`replays '${name}'`, () => {
      const r = runVerification({ ...raw.input, category: raw.input.category as EwasteCategory }, toDocs(raw));
      const mb = raw.expected.massBalance;
      expect(r.status).toBe(raw.expected.status);
      expect(r.massBalance).toMatchObject({
        claimedKg: mb.claimed_kg,
        transportedKg: mb.transported_kg,
        receivedKg: mb.received_kg,
        processedKg: mb.processed_kg,
        recoveredKg: mb.recovered_kg,
        evidenceSupportedKg: mb.evidence_supported_kg,
        discrepancyKg: mb.discrepancy_kg,
        lossPercentage: mb.loss_percentage,
        tolerancePercentage: mb.tolerance_percentage,
        isWithinTolerance: mb.is_within_tolerance,
      });
      expect(r.riskScore.overallScore).toBe(raw.expected.riskScore);
      expect(r.riskScore.riskLevel).toBe(raw.expected.riskLevel);
      expect(r.materialEstimate.isAvailable).toBe(raw.expected.available);
      expect(r.materialEstimate.netEstimatedRecoveryValueUsd).toBeCloseTo(raw.expected.net, 2);
      expect(r.findings.map((f) => f.id).sort()).toEqual(raw.expected.findingIds);
      expect(r.findings.map((f) => f.severity).sort()).toEqual(raw.expected.severities);
    });
  }
});

describe("lifecycle honesty", () => {
  it("never defaults unknown stages to the claim or to zero", () => {
    const r = runVerification(
      { batchNumber: "x", category: "it_telecom", claimedQuantity: 100, unit: "kg", recyclerName: "R", recyclerRegistrationId: "1", collectionDate: "2025-01-01", processingDate: "", originLocation: "a", destinationLocation: "b" },
      []
    );
    expect(r.massBalance.receivedKg).toBeNull();
    expect(r.massBalance.processedKg).toBeNull();
    expect(r.massBalance.transportedKg).toBeNull();
    expect(r.massBalance.recoveredKg).toBeNull();
    expect(r.massBalance.evidenceSupportedKg).toBeNull();
    expect(r.materialEstimate.isAvailable).toBe(false);
  });

  it("normalizes units and flags unsupported ones", () => {
    expect(normalizeToKg(2, "metric_ton").kg).toBe(2000);
    expect(normalizeToKg(1, "gallons").error).toBeTruthy();
  });

  it("returns an unavailable estimate for unknown mass", () => {
    expect(estimateMaterialValue("batteries", null).isAvailable).toBe(false);
    expect(estimateMaterialValue("batteries", 1000).isAvailable).toBe(true);
  });
});
