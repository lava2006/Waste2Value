import { Batch, DocumentEvidence, DocumentType, ExtractedField } from "@/types";
import { BatchInput, runVerification } from "./demo-engine";
import { buildDemoPassport } from "./passport";

/**
 * Deterministic Demo Mode dataset. Mirrors the backend seed scenarios (A clean, B borderline,
 * C high-risk) and derives every verification value from the demo engine, so a batch has one
 * consistent set of values on every screen. Timestamps are fixed for determinism.
 */
const SEED_TS = "2025-03-15T10:30:00Z";

function field(
  id: string,
  documentId: string,
  fieldName: string,
  label: string,
  value: string | number,
  confidence: number,
  extra: Partial<ExtractedField> = {}
): ExtractedField {
  return {
    id,
    documentId,
    fieldName,
    label,
    value,
    confidence,
    pageNumber: 1,
    extractionSource: "seed_demo",
    ...extra,
  };
}

function doc(
  id: string,
  batchId: string,
  title: string,
  documentType: DocumentType,
  fileName: string,
  fileSize: string,
  uploadTimestamp: string,
  snippet: string,
  fields: ExtractedField[]
): DocumentEvidence {
  return {
    id,
    batchId,
    title,
    documentType,
    fileName,
    fileSize,
    uploadTimestamp,
    status: "extracted",
    contentStored: false,
    extractedTextSnippet: snippet,
    extractedFields: fields,
  };
}

function assemble(
  id: string,
  input: BatchInput,
  documents: DocumentEvidence[],
  notes: string,
  createdAt: string,
  timeline: Batch["timeline"]
): Batch {
  const r = runVerification(input, documents);
  return {
    id,
    ...input,
    status: r.status,
    notes,
    riskScore: { ...r.riskScore, calculatedAt: SEED_TS },
    massBalance: r.massBalance,
    materialEstimate: { ...r.materialEstimate, calculatedAt: SEED_TS },
    documents,
    findings: r.findings.map((f) => ({ ...f, createdAt: SEED_TS })),
    timeline,
    createdAt,
    updatedAt: SEED_TS,
  };
}

function buildSeed(): Batch[] {
  const b1 = assemble(
    "batch-001",
    {
      batchNumber: "BATCH-2025-001",
      category: "it_telecom",
      claimedQuantity: 5000,
      unit: "kg",
      recyclerName: "GreenTech Circular Ltd",
      recyclerRegistrationId: "REG-2024-ENV-8841",
      collectionDate: "2025-03-10",
      processingDate: "2025-03-14",
      originLocation: "Munich IT Hub, Germany",
      destinationLocation: "GreenTech Facility 4, Leipzig, Germany",
    },
    [
      doc("doc-101", "batch-001", "Official Recycling Certificate", "recycling_certificate", "CERT-2025-0891.pdf", "1.4 MB", "2025-03-14T14:10:00Z",
        "Certified processed input mass: 4,920 kg. Facility registration REG-2024-ENV-8841.",
        [
          field("f-101-1", "doc-101", "certified_weight", "Certified Input Weight", 4920, 0.98, { unit: "kg", boundingBox: { top: 34, left: 30, width: 22, height: 6 } }),
          field("f-101-2", "doc-101", "recycler_license", "Operator License", "REG-2024-ENV-8841", 0.99, { boundingBox: { top: 78, left: 60, width: 32, height: 4 } }),
        ]),
      doc("doc-102", "batch-001", "Consignment Transport Waybill", "transport_waybill", "WB-2025-4421.pdf", "840 KB", "2025-03-10T09:30:00Z",
        "Freight manifest WB-4421. Declared mass: 5,000 kg. Date: 10-Mar-2025.",
        [field("f-102-1", "doc-102", "manifest_weight", "Shipped Weight", 5000, 0.97, { unit: "kg", boundingBox: { top: 40, left: 45, width: 20, height: 5 } })]),
      doc("doc-103", "batch-001", "Certified Weighbridge Ticket", "weighbridge_record", "WBR-2025-9912.png", "620 KB", "2025-03-11T11:45:00Z",
        "Scale ticket #9912. Net weighbridge inbound: 4,960 kg.",
        [field("f-103-1", "doc-103", "net_weight", "Scale Net Mass", 4960, 0.99, { unit: "kg", boundingBox: { top: 52, left: 35, width: 25, height: 6 } })]),
    ],
    "Decommissioned enterprise blade servers and telecom routing modules.",
    "2025-03-10T09:00:00Z",
    [
      { id: "t-1", timestamp: "2025-03-10T09:00:00Z", actor: "Enterprise Logistics Team", action: "Batch Intake Registered", note: "Initial claim submitted for 5,000 kg." },
      { id: "t-2", timestamp: SEED_TS, actor: "Deterministic Verification Engine (Demo)", action: "Verification Completed", note: "Automated result recorded." },
    ]
  );
  const issuedAt = "2025-03-15T11:00:00Z";
  if (b1.status === "SUPPORTED") {
    b1.passport = buildDemoPassport(b1, { passportId: "W2V-CP-0001", issuedAt, origin: "" });
    b1.timeline.push({
      id: "t-3",
      timestamp: issuedAt,
      actor: "Passport Authority Service (Demo)",
      action: "Circularity Passport Issued",
      note: `Issued W2V-CP-0001 (SHA-256 ${b1.passport.sha256Hash.slice(0, 12)}...). Signature state: NOT_CONFIGURED.`,
    });
  }

  const b2 = assemble(
    "batch-002",
    {
      batchNumber: "BATCH-2025-002",
      category: "consumer_electronics",
      claimedQuantity: 12000,
      unit: "kg",
      recyclerName: "EcoCycle Logistics & Refurbishment",
      recyclerRegistrationId: "REG-2023-ENV-5510",
      collectionDate: "2025-03-18",
      processingDate: "2025-03-24",
      originLocation: "Rotterdam Commercial Port, Netherlands",
      destinationLocation: "EcoCycle Facility B, Antwerp, Belgium",
    },
    [
      doc("doc-201", "batch-002", "Transport Delivery Waybill", "transport_waybill", "WB-2025-8819.pdf", "750 KB", "2025-03-18T10:00:00Z",
        "Freight note WB-8819. Declared weight: 12,000 kg.",
        [field("f-201-1", "doc-201", "manifest_weight", "Manifest Declared Weight", 12000, 0.95, { unit: "kg", boundingBox: { top: 38, left: 40, width: 22, height: 5 } })]),
      doc("doc-202", "batch-002", "Facility Weighbridge Inbound Ticket", "weighbridge_record", "WBR-2025-1104.pdf", "510 KB", "2025-03-19T13:15:00Z",
        "Inbound truck net: 8,500 kg. Discrepancy logged at gate vs manifest.",
        [field("f-202-1", "doc-202", "net_weight", "Weighbridge Inbound Net", 8500, 0.98, { unit: "kg", isDiscrepant: true, boundingBox: { top: 48, left: 32, width: 24, height: 6 } })]),
    ],
    "Mixed enterprise telecom cellular transceivers and microwave radio components.",
    "2025-03-18T10:00:00Z",
    [
      { id: "t-201", timestamp: "2025-03-18T10:00:00Z", actor: "Enterprise Intake Portal", action: "Batch Intake Registered", note: "Claim registered for 12,000 kg." },
      { id: "t-202", timestamp: SEED_TS, actor: "Deterministic Verification Engine (Demo)", action: "Verification Completed", note: "Automated result recorded." },
    ]
  );

  const b3 = assemble(
    "batch-003",
    {
      batchNumber: "BATCH-2025-003",
      category: "large_appliances",
      claimedQuantity: 25000,
      unit: "kg",
      recyclerName: "Apex Metal Recovery Inc",
      recyclerRegistrationId: "REG-2022-UNCONFIRMED",
      collectionDate: "2025-03-25",
      processingDate: "2025-02-14",
      originLocation: "Milan Distribution Hub, Italy",
      destinationLocation: "Apex Yard, Brescia, Italy",
    },
    [
      doc("doc-301", "batch-003", "Alleged Collection Manifest", "transport_waybill", "WB-2024-9901-SUSPECT.pdf", "920 KB", "2025-03-25T11:00:00Z",
        "Dispatch manifest WB-2024-9901. Entity: Apex Logistics LLC.",
        [
          field("f-301-1", "doc-301", "waybill_number", "Waybill Serial", "WB-2024-9901", 0.96, { isDiscrepant: true, boundingBox: { top: 15, left: 65, width: 25, height: 5 } }),
          field("f-301-2", "doc-301", "entity_name", "Entity", "Apex Logistics LLC", 0.94, { boundingBox: { top: 24, left: 15, width: 35, height: 4 } }),
        ]),
      doc("doc-302", "batch-003", "Scale Intake Record", "weighbridge_record", "SCALE-TICKET-FEB14.jpg", "1.1 MB", "2025-03-25T11:05:00Z",
        "Weighbridge automation. Net mass: 11,200 kg. Date: 14-FEB-2025.",
        [field("f-302-1", "doc-302", "net_weight", "Scale Net Mass", 11200, 0.97, { unit: "kg", isDiscrepant: true, boundingBox: { top: 35, left: 45, width: 20, height: 5 } })]),
    ],
    "High-risk demonstration scenario: contradictory dates, entities and scale ticket.",
    "2025-03-25T11:00:00Z",
    [
      { id: "t-301", timestamp: "2025-03-25T11:00:00Z", actor: "External Portal Submitter", action: "Batch Intake Submitted", note: "Claim for 25,000 kg submitted." },
      { id: "t-302", timestamp: SEED_TS, actor: "Deterministic Verification Engine (Demo)", action: "Verification Completed", note: "Automated result recorded.", severity: "critical" },
    ]
  );

  return [b1, b2, b3];
}

let cached: Batch[] | null = null;

/** A fresh deep copy of the seed so callers can never mutate the shared dataset. */
export function getInitialBatches(): Batch[] {
  if (!cached) cached = buildSeed();
  return JSON.parse(JSON.stringify(cached)) as Batch[];
}
