/**
 * Pure intake-wizard logic (validation, evidence policy, readiness) so it can be unit tested.
 * Input validation (is this a well-formed submission?) is deliberately separate from
 * verification findings (does the evidence reconcile?): a chronology or quantity anomaly is
 * never an input error - it is surfaced as a finding after submission.
 */
import type { DocumentType, EwasteCategory } from "@/types";
import { MANDATORY_DOCUMENTS, SUPPORTED_UNITS, parseIsoDate } from "./demo-engine";
import { DOCUMENT_TYPE_LABELS } from "./domain";

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const ACCEPTED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg"] as const;
export const ACCEPTED_MIME = ["application/pdf", "image/png", "image/jpeg"];

export interface DetailsInput {
  batchNumber: string;
  category: string;
  claimedQuantity: string;
  unit: string;
  recyclerName: string;
  recyclerRegistrationId: string;
  collectionDate: string;
  processingDate: string;
  originLocation: string;
  destinationLocation: string;
}

export type DetailsErrors = Partial<Record<keyof DetailsInput, string>>;

const CATEGORIES: EwasteCategory[] = ["it_telecom", "consumer_electronics", "large_appliances", "small_appliances", "batteries"];

export function parseQuantity(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function validateDetails(d: DetailsInput): DetailsErrors {
  const e: DetailsErrors = {};
  if (!d.batchNumber.trim()) e.batchNumber = "Batch identifier is required.";
  if (!CATEGORIES.includes(d.category as EwasteCategory)) e.category = "Choose a supported e-waste category.";

  const q = parseQuantity(d.claimedQuantity);
  if (q === null) e.claimedQuantity = "Claimed quantity is required and must be a number.";
  else if (q <= 0) e.claimedQuantity = "Claimed quantity must be greater than 0.";

  if (!(SUPPORTED_UNITS as readonly string[]).includes(d.unit)) e.unit = "Choose a supported unit (kg, metric ton or lb).";
  if (!d.recyclerName.trim()) e.recyclerName = "Recycler or operator name is required.";
  if (!d.recyclerRegistrationId.trim()) e.recyclerRegistrationId = "Facility registration ID is required.";

  if (!d.collectionDate) e.collectionDate = "Collection date is required.";
  else if (!parseIsoDate(d.collectionDate)) e.collectionDate = "Enter a valid collection date.";

  if (d.processingDate && !parseIsoDate(d.processingDate)) e.processingDate = "Enter a valid processing date or leave it empty while processing is pending.";
  if (!d.originLocation.trim()) e.originLocation = "Collection origin is required.";
  if (!d.destinationLocation.trim()) e.destinationLocation = "Destination facility is required.";
  return e;
}

/** A non-blocking note: this input is valid but verification will flag it. */
export function chronologyWarning(collectionDate: string, processingDate: string): string | null {
  const c = parseIsoDate(collectionDate);
  const p = parseIsoDate(processingDate);
  if (c && p && p < c) {
    return "The processing date is before the collection date. This is accepted as input but verification will raise a critical timeline finding for review.";
  }
  return null;
}

// ---------------------------------------------------------------- evidence policy
export type RequirementLevel = "required" | "optional";

export interface PolicyEntry {
  type: DocumentType;
  level: RequirementLevel;
  reason: string;
}

const WEIGHT_BEARING: DocumentType[] = ["transport_waybill", "weighbridge_record", "recycling_certificate"];

export function isWeightBearing(type: DocumentType): boolean {
  return WEIGHT_BEARING.includes(type);
}

export const STATED_WEIGHT_LABEL: Partial<Record<DocumentType, { label: string; fieldName: string; stage: string }>> = {
  transport_waybill: { label: "Weight stated on the waybill", fieldName: "manifest_weight", stage: "transported mass" },
  weighbridge_record: { label: "Net weight stated on the weighbridge record", fieldName: "net_weight", stage: "received mass" },
  recycling_certificate: { label: "Processed weight stated on the certificate", fieldName: "certified_weight", stage: "processed input mass" },
};

/** Document requirements for a category, mirroring backend policy v2.1 (VerificationPolicy.mandatory_documents). */
export function evidencePolicy(category: EwasteCategory): PolicyEntry[] {
  const mandatory = MANDATORY_DOCUMENTS[category] ?? MANDATORY_DOCUMENTS.it_telecom;
  const reasons: Partial<Record<DocumentType, string>> = {
    transport_waybill: "States the dispatched quantity and collection trace.",
    weighbridge_record: "Records the received quantity; the basis for mass reconciliation.",
    recycling_certificate: "States the processed input quantity.",
  };
  const entries: PolicyEntry[] = mandatory.map((type) => ({
    type,
    level: "required",
    reason: reasons[type] ?? "Required by the verification policy for this category.",
  }));
  const optional: DocumentType[] = ["recycling_certificate", "processing_invoice", "facility_photo", "recycler_registration", "other"].filter(
    (t) => !mandatory.includes(t as DocumentType)
  ) as DocumentType[];
  for (const type of optional) {
    entries.push({
      type,
      level: "optional",
      reason:
        type === "recycling_certificate"
          ? "Not required for this category; adds processed-stage evidence if attached."
          : "Supplementary evidence; not evaluated by the mass-balance rules.",
    });
  }
  return entries;
}

export function guessDocumentType(fileName: string): DocumentType {
  const fn = fileName.toLowerCase();
  if (/(weighbridge|scale|wbr|ticket)/.test(fn)) return "weighbridge_record";
  if (/(waybill|manifest|^wb-)/.test(fn)) return "transport_waybill";
  if (/(cert|certificate)/.test(fn)) return "recycling_certificate";
  if (/(invoice)/.test(fn)) return "processing_invoice";
  if (/(photo|image|img)/.test(fn)) return "facility_photo";
  return "other";
}

// ---------------------------------------------------------------- file validation
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function validateFile(file: { name: string; size: number; type: string }): string | null {
  const lower = file.name.toLowerCase();
  if (!ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return `Unsupported file type. Accepted: ${ACCEPTED_EXTENSIONS.join(", ")}.`;
  }
  if (file.type && !ACCEPTED_MIME.includes(file.type)) return `Unsupported content type '${file.type}'.`;
  if (file.size === 0) return "The file is empty.";
  if (file.size > MAX_FILE_BYTES) return `The file is ${formatFileSize(file.size)}; the limit is ${formatFileSize(MAX_FILE_BYTES)}.`;
  return null;
}

// ---------------------------------------------------------------- readiness
export interface EvidenceItemState {
  localId: string;
  fileName: string;
  documentType: DocumentType;
  statedWeight: string;
  statedUnit: string;
  state: "reading" | "ready" | "error";
  error?: string;
  isSample?: boolean;
}

export interface ReadinessItem {
  text: string;
  why: string;
}

export interface Readiness {
  ready: ReadinessItem[];
  attention: ReadinessItem[];
  blocked: ReadinessItem[];
  canSubmit: boolean;
}

export function computeReadiness(
  details: DetailsInput,
  items: EvidenceItemState[],
  extra: { duplicateBatchNumber?: boolean } = {}
): Readiness {
  const ready: ReadinessItem[] = [];
  const attention: ReadinessItem[] = [];
  const blocked: ReadinessItem[] = [];

  const errs = validateDetails(details);
  if (Object.keys(errs).length > 0) {
    blocked.push({
      text: "Batch details are incomplete or invalid",
      why: `A batch cannot be created until step 1 is valid (${Object.values(errs).length} issue(s)).`,
    });
  } else {
    ready.push({ text: "Batch details are valid", why: "All required fields passed input validation." });
  }
  if (extra.duplicateBatchNumber) {
    blocked.push({ text: "Batch identifier already exists", why: "Batch identifiers must be unique." });
  }

  const reading = items.filter((i) => i.state === "reading");
  if (reading.length > 0) blocked.push({ text: `${reading.length} file(s) are still being read`, why: "Wait for processing to finish before submitting." });
  const errored = items.filter((i) => i.state === "error");
  if (errored.length > 0) {
    blocked.push({ text: `${errored.length} file(s) failed validation`, why: "Remove or replace files that could not be read." });
  }

  const usable = items.filter((i) => i.state === "ready");
  const policy = evidencePolicy(details.category as EwasteCategory);
  for (const entry of policy.filter((p) => p.level === "required")) {
    const have = usable.some((i) => i.documentType === entry.type);
    const name = DOCUMENT_TYPE_LABELS[entry.type];
    if (have) ready.push({ text: `${name} attached (required)`, why: entry.reason });
    else
      attention.push({
        text: `${name} is missing (required by policy)`,
        why: "Submission is allowed, but verification will raise a completeness finding and the batch will need review.",
      });
  }
  for (const entry of policy.filter((p) => p.level === "optional")) {
    if (usable.some((i) => i.documentType === entry.type)) ready.push({ text: `${DOCUMENT_TYPE_LABELS[entry.type]} attached (optional)`, why: entry.reason });
  }

  for (const i of usable) {
    const meta = STATED_WEIGHT_LABEL[i.documentType];
    if (!meta) continue;
    const n = parseQuantity(i.statedWeight);
    if (n === null || n <= 0) {
      attention.push({
        text: `${i.fileName}: no ${meta.stage} entered`,
        why: `Without it the ${meta.stage} stays "Not recorded" and mass reconciliation cannot use this document.`,
      });
    }
  }

  if (!details.processingDate) {
    attention.push({ text: "Processing date not set", why: "Allowed while processing is pending; the timeline rule is skipped until it is provided." });
  }
  const chrono = chronologyWarning(details.collectionDate, details.processingDate);
  if (chrono) attention.push({ text: "Processing date precedes collection date", why: chrono });
  if (usable.some((i) => i.isSample)) {
    attention.push({ text: "Sample evidence is attached (Demo Mode)", why: "Sample documents are simulated; they are not uploaded files." });
  }

  return { ready, attention, blocked, canSubmit: blocked.length === 0 };
}
