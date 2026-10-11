/**
 * Shared presentation + aggregation rules. Every page derives displayed values from these
 * helpers so one batch can never acquire different numbers or labels on different screens.
 */
import type {
  Batch,
  DashboardMetrics,
  DocumentType,
  EwasteCategory,
  Finding,
  PassportLifecycleStatus,
  PayloadIntegrityState,
  RiskLevel,
  Severity,
  SignatureState,
  VerificationStatus,
} from "@/types";

// ---------------------------------------------------------------- formatting
export const NOT_RECORDED = "Not recorded";
export const NOT_AVAILABLE = "Not available";

const NUM = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const INT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function formatNumber(n: number): string {
  return NUM.format(n);
}

/** Formats a kg quantity; null/undefined is shown as "Not recorded", never as 0. */
export function formatKg(n: number | null | undefined, fallback: string = NOT_RECORDED): string {
  return n === null || n === undefined || Number.isNaN(n) ? fallback : `${NUM.format(n)} kg`;
}

export function formatTonnes(kg: number): string {
  return `${NUM.format(Math.round(kg) / 1000)} t`;
}

export function formatPercent(n: number | null | undefined, digits = 1): string {
  return n === null || n === undefined || Number.isNaN(n) ? NOT_RECORDED : `${n.toFixed(digits)}%`;
}

export function formatMoney(n: number | null | undefined, currency = "USD", fractionDigits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return NOT_AVAILABLE;
  return `${currency} ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(n)}`;
}

const DATE_FMT = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const TIME_FMT = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });

function toDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const d = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "05 Apr 2025" (UTC). */
export function formatDate(value: string | undefined | null): string {
  const d = toDate(value);
  return d ? DATE_FMT.format(d) : NOT_RECORDED;
}

/** "05 Apr 2025, 14:10 UTC" - for audit/operational timestamps. */
export function formatTimestamp(value: string | undefined | null): string {
  const d = toDate(value);
  return d ? `${DATE_FMT.format(d)}, ${TIME_FMT.format(d)} UTC` : NOT_RECORDED;
}

export { INT as integerFormat };

// ---------------------------------------------------------------- labels
export const CATEGORY_LABELS: Record<EwasteCategory, string> = {
  it_telecom: "IT & Telecom",
  consumer_electronics: "Consumer Electronics",
  large_appliances: "Large Appliances",
  small_appliances: "Small Appliances",
  batteries: "Batteries",
};

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  recycling_certificate: "Recycling Certificate",
  transport_waybill: "Transport Waybill",
  weighbridge_record: "Weighbridge Record",
  processing_invoice: "Processing Invoice",
  facility_photo: "Facility Photo",
  recycler_registration: "Recycler Registration",
  other: "Other Evidence",
};

export const LIFECYCLE_STAGE_LABELS: Record<string, string> = {
  received: "Received (weighbridge)",
  processed: "Processed input (certificate)",
  transported: "Transported (waybill)",
  timeline: "Timeline",
  identity: "Recycler identity",
  evidence_uniqueness: "Evidence uniqueness",
};

export interface StatusMeta {
  label: string;
  tooltip: string;
}

/** A. Documentary verification status. */
export const VERIFICATION_STATUS_META: Record<VerificationStatus, StatusMeta> = {
  SUPPORTED: {
    label: "Evidence Supported",
    tooltip: "The submitted documents reconcile within policy tolerance. This is a documentary result, not proof that recycling physically occurred.",
  },
  REVIEW_REQUIRED: {
    label: "Review Required",
    tooltip: "Discrepancies or missing evidence need a human auditor. This is not a rejection.",
  },
  REJECTED: {
    label: "Rejected",
    tooltip: "An authorized auditor decision rejected this batch. Historical findings remain visible.",
  },
  NOT_VERIFIED: { label: "Not Verified", tooltip: "Verification has not been run for this batch." },
  PROCESSING: { label: "Verification Processing", tooltip: "Verification is still running; no result is available yet." },
  REVOKED: {
    label: "Legacy: Revoked",
    tooltip: "Legacy value from older records. Passport revocation is now tracked separately and does not change documentary status.",
  },
};

export const RISK_META: Record<RiskLevel, StatusMeta> = {
  low: { label: "Low Risk", tooltip: "Risk score 25 or below. Risk assessment is separate from the verification status." },
  medium: { label: "Medium Risk", tooltip: "Risk score 26 to 70. Risk assessment is separate from the verification status." },
  high: { label: "High Risk", tooltip: "Risk score above 70. A high score alone never rejects a batch." },
};

export const SEVERITY_META: Record<Severity, StatusMeta> = {
  critical: { label: "Critical finding", tooltip: "A rule produced a critical documentary discrepancy." },
  warning: { label: "Warning finding", tooltip: "A rule produced a discrepancy that needs investigation." },
  info: { label: "Informational note", tooltip: "A rule passed or produced a note; no action required." },
};

/** C. Passport lifecycle. */
export const PASSPORT_META: Record<PassportLifecycleStatus, StatusMeta> = {
  ACTIVE: { label: "Passport Active", tooltip: "A passport has been issued and has not been revoked." },
  REVOKED: {
    label: "Passport Revoked",
    tooltip: "The passport was revoked. The batch's documentary status and the payload hash are unaffected.",
  },
  NOT_ISSUED: { label: "No Passport Issued", tooltip: "No passport has been issued for this batch." },
};

/** D. Payload integrity. */
export const INTEGRITY_META: Record<PayloadIntegrityState, StatusMeta> = {
  VALID: {
    label: "Hash Matches",
    tooltip: "The payload matches the reference hash recorded at issuance. This does not identify the issuer or prove physical recycling.",
  },
  INVALID: { label: "Hash Mismatch", tooltip: "The payload does not match the reference hash recorded at issuance." },
  NOT_CHECKED: { label: "Not Checked", tooltip: "Payload integrity was not checked." },
};

/** E. Issuer signature. */
export const SIGNATURE_META: Record<SignatureState, StatusMeta> = {
  VALID: { label: "Signature Valid", tooltip: "The issuer signature verified against a configured key service." },
  INVALID: { label: "Signature Invalid", tooltip: "The issuer signature failed verification." },
  SIMULATED: {
    label: "Simulated (not authentic)",
    tooltip: "A local stand-in produced this value. It is NOT an issuer signature and does not establish who issued the passport.",
  },
  NOT_CONFIGURED: { label: "Not Configured", tooltip: "No issuer signature exists for this passport, so issuer authenticity cannot be established." },
  UNSUPPORTED: { label: "Unsupported", tooltip: "The signature scheme is not supported by this verifier." },
  NOT_CHECKED: { label: "Not Checked", tooltip: "The signature was not checked." },
};

/** Map a stored backend signature_status string to the independent signature state. */
export function signatureStateFromStatus(status: string): SignatureState {
  if (status === "DEMO_SIMULATED_KMS_SIGNATURE") return "SIMULATED";
  if (status === "NOT_CONFIGURED") return "NOT_CONFIGURED";
  // A stored "valid" label is not proof: only a verification call may report VALID.
  return "NOT_CHECKED";
}

export function passportLifecycle(batch: Pick<Batch, "passport">): PassportLifecycleStatus {
  if (!batch.passport) return "NOT_ISSUED";
  return batch.passport.revoked ? "REVOKED" : "ACTIVE";
}

export function isEligibleForPassport(batch: Batch): boolean {
  return batch.status === "SUPPORTED" && !batch.passport && batch.massBalance.evidenceSupportedKg !== null;
}

// ---------------------------------------------------------------- lifecycle quantities
export interface LifecycleRow {
  key: "claimed" | "transported" | "received" | "processed" | "recovered" | "supported";
  label: string;
  value: number | null;
  basis: string;
}

/** The ordered lifecycle quantities with their evidence basis. null = unknown. */
export function lifecycleRows(b: Batch): LifecycleRow[] {
  const m = b.massBalance;
  return [
    { key: "claimed", label: "Claimed mass", value: m.claimedKg, basis: "Declared on the intake record" },
    { key: "transported", label: "Transported mass", value: m.transportedKg, basis: "Transport waybill / manifest" },
    { key: "received", label: "Received mass", value: m.receivedKg, basis: "Weighbridge / scale record at intake" },
    { key: "processed", label: "Processed input mass", value: m.processedKg, basis: "Processing / recycling certificate" },
    { key: "recovered", label: "Recovered output mass", value: m.recoveredKg, basis: "No evidence type captures recovered output yet" },
    {
      key: "supported",
      label: "Evidence-supported mass",
      value: m.evidenceSupportedKg,
      basis: "Lowest documented downstream stage (received or processed); basis for valuation",
    },
  ];
}

// ---------------------------------------------------------------- findings helpers
export function actionableFindings(b: Batch): Finding[] {
  return b.findings.filter((f) => f.severity !== "info");
}

export function findingAnchor(findingId: string): string {
  return `finding-${findingId}`;
}

export function findingHref(batchId: string, findingId: string): string {
  return `/batches/${encodeURIComponent(batchId)}#${findingAnchor(findingId)}`;
}

export function evidenceHref(batchId: string, documentId?: string, fieldId?: string): string {
  const base = `/evidence/${encodeURIComponent(documentId ?? batchId)}`;
  return fieldId ? `${base}?field=${encodeURIComponent(fieldId)}` : base;
}

// ---------------------------------------------------------------- dashboard
export function computeDashboardMetrics(batches: Batch[]): DashboardMetrics {
  let supportedReceivedKg = 0;
  let supportedWithReceived = 0;
  let unverifiedReceivedKg = 0;
  let missingReceived = 0;
  let supportedValue = 0;
  let unverifiedValue = 0;
  let critical = 0;
  let warning = 0;

  for (const b of batches) {
    const received = b.massBalance.receivedKg;
    if (received === null) missingReceived += 1;
    if (b.status === "SUPPORTED") {
      if (received !== null) {
        supportedReceivedKg += received;
        supportedWithReceived += 1;
      }
    } else if (received !== null) {
      unverifiedReceivedKg += received;
    }
    if (b.materialEstimate.isAvailable) {
      if (b.status === "SUPPORTED") supportedValue += b.materialEstimate.netEstimatedRecoveryValueUsd;
      else unverifiedValue += b.materialEstimate.netEstimatedRecoveryValueUsd;
    }
    for (const f of b.findings) {
      if (f.severity === "critical") critical += 1;
      else if (f.severity === "warning") warning += 1;
    }
  }

  const reviewRequired = batches.filter((b) => b.status === "REVIEW_REQUIRED").length;
  const rejected = batches.filter((b) => b.status === "REJECTED").length;
  return {
    totalBatches: batches.length,
    supportedBatchesCount: batches.filter((b) => b.status === "SUPPORTED").length,
    reviewRequiredCount: reviewRequired,
    rejectedCount: rejected,
    batchesRequiringReview: reviewRequired,
    supportedReceivedKg,
    supportedBatchesWithReceived: supportedWithReceived,
    unverifiedReceivedKg,
    batchesMissingReceived: missingReceived,
    supportedValueUsd: supportedValue,
    unverifiedValueUsd: unverifiedValue,
    criticalFindings: critical,
    warningFindings: warning,
  };
}

export type QueueSection = "review_required" | "rejected_followup" | "historical";

export interface QueueItem {
  section: QueueSection;
  batch: Batch;
  finding: Finding;
  /** Present only when the finding concerns a quantity stage and that stage is recorded. */
  quantityNote?: string;
  missingEvidence?: string;
  nextAction: string;
  href: string;
}

const MISSING_EVIDENCE_RULES = new Set(["EC-001", "MB-000"]);

export function buildInvestigationQueue(batches: Batch[]): QueueItem[] {
  const items: QueueItem[] = [];
  for (const b of batches) {
    const section: QueueSection =
      b.status === "REVIEW_REQUIRED" ? "review_required" : b.status === "REJECTED" ? "rejected_followup" : "historical";
    for (const f of actionableFindings(b)) {
      const isMassFinding = f.ruleId.startsWith("MB-") && f.ruleId !== "MB-000";
      const m = b.massBalance;
      items.push({
        section,
        batch: b,
        finding: f,
        quantityNote: isMassFinding
          ? `Claimed ${formatKg(m.claimedKg)} · ${f.lifecycleStage === "processed" ? "Processed" : "Received"} ${formatKg(
              f.lifecycleStage === "processed" ? m.processedKg : m.receivedKg
            )} · Difference ${formatKg(m.discrepancyKg)}`
          : undefined,
        missingEvidence: MISSING_EVIDENCE_RULES.has(f.ruleId) ? f.observedValue ?? f.title : undefined,
        nextAction: f.recommendedAction,
        href: findingHref(b.id, f.id),
      });
    }
  }
  const order: Record<QueueSection, number> = { review_required: 0, rejected_followup: 1, historical: 2 };
  const sev: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  return items.sort((a, b) => order[a.section] - order[b.section] || sev[a.finding.severity] - sev[b.finding.severity]);
}

export interface MassChartRow {
  batchNumber: string;
  claimedKg: number;
  receivedKg: number | null;
  processedKg: number | null;
}

export function massChartRows(batches: Batch[]): MassChartRow[] {
  return batches.map((b) => ({
    batchNumber: b.batchNumber,
    claimedKg: b.massBalance.claimedKg,
    receivedKg: b.massBalance.receivedKg,
    processedKg: b.massBalance.processedKg,
  }));
}

export function statusCounts(batches: Batch[]): { status: VerificationStatus; count: number }[] {
  const order: VerificationStatus[] = ["SUPPORTED", "REVIEW_REQUIRED", "REJECTED", "PROCESSING", "NOT_VERIFIED", "REVOKED"];
  return order.map((status) => ({ status, count: batches.filter((b) => b.status === status).length })).filter((s) => s.count > 0);
}

// ---------------------------------------------------------------- directory filtering
export type SortField = "date" | "claimedMass" | "receivedMass" | "risk";
export type SortOrder = "asc" | "desc";

export interface BatchFilters {
  search: string;
  category: string;
  status: string;
  risk: string;
  passport: string;
}

export const EMPTY_FILTERS: BatchFilters = { search: "", category: "all", status: "all", risk: "all", passport: "all" };

function searchHaystack(b: Batch): string[] {
  return [
    b.id,
    b.batchNumber,
    b.recyclerName,
    b.recyclerRegistrationId,
    b.category,
    CATEGORY_LABELS[b.category],
    b.originLocation,
    b.destinationLocation,
    b.passport?.passportId ?? "",
  ].map((v) => v.toLowerCase());
}

export function filterBatches(batches: Batch[], f: BatchFilters): Batch[] {
  const term = f.search.trim().toLowerCase();
  return batches.filter((b) => {
    if (term && !searchHaystack(b).some((h) => h.includes(term))) return false;
    if (f.category !== "all" && b.category !== f.category) return false;
    if (f.status !== "all" && b.status !== f.status) return false;
    if (f.risk !== "all" && b.riskScore.riskLevel !== f.risk) return false;
    if (f.passport !== "all" && passportLifecycle(b) !== f.passport) return false;
    return true;
  });
}

export function sortBatches(batches: Batch[], field: SortField, order: SortOrder): Batch[] {
  const dir = order === "asc" ? 1 : -1;
  const key = (b: Batch): number | null => {
    switch (field) {
      case "date":
        return toDate(b.collectionDate)?.getTime() ?? null;
      case "claimedMass":
        return b.massBalance.claimedKg;
      case "receivedMass":
        return b.massBalance.receivedKg;
      case "risk":
        return b.riskScore.overallScore;
    }
  };
  // Unknown values always sort last regardless of direction.
  return [...batches].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka === null && kb === null) return 0;
    if (ka === null) return 1;
    if (kb === null) return -1;
    return (ka - kb) * dir;
  });
}

// ---------------------------------------------------------------- global search
export interface SearchResult {
  kind: "batch" | "passport" | "evidence";
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

export function searchEntities(batches: Batch[], query: string, limit = 12): SearchResult[] {
  const term = query.trim().toLowerCase();
  if (!term) return [];
  const results: SearchResult[] = [];
  for (const b of batches) {
    if (searchHaystack(b).some((h) => h.includes(term))) {
      results.push({
        kind: "batch",
        id: b.id,
        title: b.batchNumber,
        subtitle: `${b.recyclerName} · ${CATEGORY_LABELS[b.category]}`,
        href: `/batches/${encodeURIComponent(b.id)}`,
      });
    }
    if (b.passport && b.passport.passportId.toLowerCase().includes(term)) {
      results.push({
        kind: "passport",
        id: b.passport.passportId,
        title: b.passport.passportId,
        subtitle: `Passport for ${b.batchNumber}`,
        href: `/passports/${encodeURIComponent(b.passport.passportId)}`,
      });
    }
    for (const d of b.documents) {
      if (d.fileName.toLowerCase().includes(term) || d.id.toLowerCase().includes(term) || d.title.toLowerCase().includes(term)) {
        results.push({
          kind: "evidence",
          id: d.id,
          title: d.fileName,
          subtitle: `${DOCUMENT_TYPE_LABELS[d.documentType]} · ${b.batchNumber}`,
          href: `/evidence/${encodeURIComponent(d.id)}`,
        });
      }
    }
  }
  return results.slice(0, limit);
}
