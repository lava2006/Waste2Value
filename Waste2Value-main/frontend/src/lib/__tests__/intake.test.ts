import { describe, expect, it } from "vitest";
import {
  DetailsInput,
  EvidenceItemState,
  MAX_FILE_BYTES,
  chronologyWarning,
  computeReadiness,
  evidencePolicy,
  guessDocumentType,
  validateDetails,
  validateFile,
} from "../intake";

const valid: DetailsInput = {
  batchNumber: "B-1",
  category: "it_telecom",
  claimedQuantity: "5000",
  unit: "kg",
  recyclerName: "R",
  recyclerRegistrationId: "REG-1",
  collectionDate: "2025-03-10",
  processingDate: "2025-03-14",
  originLocation: "A",
  destinationLocation: "B",
};

let counter = 0;
const item = (over: Partial<EvidenceItemState>): EvidenceItemState => ({
  localId: `i${counter++}`,
  fileName: "f.pdf",
  documentType: "weighbridge_record",
  statedWeight: "4900",
  statedUnit: "kg",
  state: "ready",
  ...over,
});

describe("details validation", () => {
  it("accepts a valid submission", () => {
    expect(validateDetails(valid)).toEqual({});
  });
  it.each([
    ["claimedQuantity", "0"],
    ["claimedQuantity", "-3"],
    ["claimedQuantity", ""],
    ["claimedQuantity", "abc"],
    ["claimedQuantity", "Infinity"],
    ["unit", "gallons"],
    ["batchNumber", "   "],
    ["collectionDate", ""],
    ["collectionDate", "2025-13-45"],
    ["processingDate", "not-a-date"],
  ])("rejects %s = %j", (field, value) => {
    expect(validateDetails({ ...valid, [field]: value })[field as keyof DetailsInput]).toBeTruthy();
  });
  it("allows a pending processing date", () => {
    expect(validateDetails({ ...valid, processingDate: "" })).toEqual({});
  });
  it("treats chronology as a warning, not an input error", () => {
    const d = { ...valid, collectionDate: "2025-03-25", processingDate: "2025-02-14" };
    expect(validateDetails(d)).toEqual({});
    expect(chronologyWarning(d.collectionDate, d.processingDate)).toMatch(/before the collection date/);
    expect(chronologyWarning("2025-03-10", "2025-03-14")).toBeNull();
  });
});

describe("evidence policy", () => {
  it("varies by category instead of hardcoding universal requirements", () => {
    const req = (c: Parameters<typeof evidencePolicy>[0]) => evidencePolicy(c).filter((p) => p.level === "required").map((p) => p.type);
    expect(req("it_telecom")).toEqual(["transport_waybill", "weighbridge_record"]);
    expect(req("batteries")).toEqual(["transport_waybill", "weighbridge_record", "recycling_certificate"]);
  });
  it("guesses a type from the file name", () => {
    expect(guessDocumentType("WBR-2025-9912.png")).toBe("weighbridge_record");
    expect(guessDocumentType("waybill.pdf")).toBe("transport_waybill");
    expect(guessDocumentType("CERT-1.pdf")).toBe("recycling_certificate");
    expect(guessDocumentType("notes.pdf")).toBe("other");
  });
});

describe("file validation", () => {
  it("checks type, emptiness and size", () => {
    expect(validateFile({ name: "a.pdf", size: 10, type: "application/pdf" })).toBeNull();
    expect(validateFile({ name: "a.exe", size: 10, type: "" })).toMatch(/Unsupported file type/);
    expect(validateFile({ name: "a.pdf", size: 0, type: "application/pdf" })).toMatch(/empty/);
    expect(validateFile({ name: "a.pdf", size: MAX_FILE_BYTES + 1, type: "application/pdf" })).toMatch(/limit/);
    expect(validateFile({ name: "a.png", size: 10, type: "text/html" })).toMatch(/content type/);
  });
});

describe("submission readiness", () => {
  const ready = [item({ documentType: "transport_waybill", statedWeight: "5000" }), item({ documentType: "weighbridge_record" })];

  it("is submittable with only ready items", () => {
    const r = computeReadiness(valid, ready);
    expect(r.canSubmit).toBe(true);
    expect(r.blocked).toEqual([]);
    expect(r.ready.length).toBeGreaterThan(0);
  });

  it("treats missing required evidence as needs-attention, not blocked", () => {
    const r = computeReadiness(valid, []);
    expect(r.canSubmit).toBe(true);
    expect(r.attention.map((a) => a.text).join(" ")).toMatch(/Weighbridge Record is missing/);
    expect(r.attention.every((a) => a.why.length > 10)).toBe(true);
  });

  it("flags a missing stated quantity as unknown rather than zero", () => {
    const r = computeReadiness(valid, [item({ statedWeight: "" })]);
    expect(r.attention.some((a) => /no received mass entered/.test(a.text))).toBe(true);
  });

  it("blocks only on genuinely blocking conditions", () => {
    expect(computeReadiness({ ...valid, claimedQuantity: "" }, ready).canSubmit).toBe(false);
    expect(computeReadiness(valid, [...ready, item({ state: "reading" })]).blocked[0].text).toMatch(/still being read/);
    expect(computeReadiness(valid, [...ready, item({ state: "error" })]).canSubmit).toBe(false);
    expect(computeReadiness(valid, ready, { duplicateBatchNumber: true }).canSubmit).toBe(false);
  });

  it("does not block on a chronology anomaly", () => {
    const r = computeReadiness({ ...valid, collectionDate: "2025-03-25", processingDate: "2025-02-14" }, ready);
    expect(r.canSubmit).toBe(true);
    expect(r.attention.some((a) => /precedes collection/.test(a.text))).toBe(true);
  });
});
