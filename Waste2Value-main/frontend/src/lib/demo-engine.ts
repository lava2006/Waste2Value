/**
 * Demo Mode verification engine.
 *
 * A TypeScript port of the backend rules (backend/app/verification, scoring, materials) so
 * Demo Mode can run offline. It is a SIMULATION used only when the execution mode is "demo";
 * Live Mode never calls it. Parity with the Python engine is covered by tests that replay
 * the backend scenarios (src/lib/__tests__/demo-engine.test.ts).
 */
import {
  Batch,
  CircularPathway,
  DocumentEvidence,
  DocumentType,
  EwasteCategory,
  Finding,
  MassBalance,
  MaterialEstimate,
  RiskLevel,
  RiskScore,
  Severity,
  VerificationStatus,
} from "@/types";

export interface BatchInput {
  batchNumber: string;
  category: EwasteCategory;
  claimedQuantity: number;
  unit: string;
  recyclerName: string;
  recyclerRegistrationId: string;
  collectionDate: string;
  processingDate: string;
  originLocation: string;
  destinationLocation: string;
}

export const POLICY_VERSION = "v2.1-circ-standard";

export const CATEGORY_TOLERANCE: Record<EwasteCategory, number> = {
  it_telecom: 2.0,
  consumer_electronics: 3.5,
  large_appliances: 5.0,
  small_appliances: 4.0,
  batteries: 1.5,
};

export const MANDATORY_DOCUMENTS: Record<EwasteCategory, DocumentType[]> = {
  it_telecom: ["transport_waybill", "weighbridge_record"],
  consumer_electronics: ["transport_waybill", "weighbridge_record"],
  large_appliances: ["transport_waybill", "weighbridge_record"],
  small_appliances: ["transport_waybill", "weighbridge_record"],
  batteries: ["transport_waybill", "weighbridge_record", "recycling_certificate"],
};

export const SUPPORTED_UNITS = ["kg", "metric_ton", "lb"] as const;

const UNIT_FACTORS: Record<string, number> = {
  kg: 1,
  kilogram: 1,
  kilograms: 1,
  metric_ton: 1000,
  ton: 1000,
  tonne: 1000,
  tonnes: 1000,
  t: 1000,
  lb: 0.45359237,
  lbs: 0.45359237,
  pound: 0.45359237,
  pounds: 0.45359237,
};

export function normalizeToKg(quantity: number, unit: string): { kg: number; error?: string } {
  const factor = UNIT_FACTORS[unit.toLowerCase().trim()];
  if (factor === undefined) {
    return { kg: quantity, error: `Unsupported unit '${unit}'. Standard canonical unit is 'kg'.` };
  }
  return { kg: quantity * factor };
}

export function parseIsoDate(value: string): Date | null {
  if (!value) return null;
  const d = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const STAGE_FIELDS: Record<"received" | "transported" | "processed", { names: string[]; canonical: DocumentType }> = {
  received: { names: ["net_weight", "weighbridge_intake", "scale_weight"], canonical: "weighbridge_record" },
  transported: { names: ["manifest_weight", "declared_weight"], canonical: "transport_waybill" },
  processed: { names: ["certified_weight", "processed_weight"], canonical: "recycling_certificate" },
};

const KNOWN_DUPLICATE_SERIALS = ["WB-2024-9901"];

/** Python-style rounding (half to even) so scores match the backend exactly. */
export function pyRound(x: number, digits = 0): number {
  const m = 10 ** digits;
  const y = x * m;
  const f = Math.floor(y);
  if (Math.abs(y - f - 0.5) < 1e-9) return (f % 2 === 0 ? f : f + 1) / m;
  return Math.round(y) / m;
}

const fmt0 = (n: number) => Math.round(n).toLocaleString("en-US");
const fmt1 = (n: number) => n.toFixed(1);

interface FindingBase {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: Severity;
  title: string;
  description: string;
  recommendedAction: string;
}

function mk(base: FindingBase, extra: Partial<Finding> = {}): Finding {
  return { ...base, policyVersion: POLICY_VERSION, createdAt: new Date().toISOString(), ...extra };
}

function evaluateMassBalance(
  claimedKg: number,
  transportedKg: number,
  receivedKg: number,
  processedKg: number,
  tolerance: number
): { supported: number; lossPct: number; within: boolean; findings: Finding[] } {
  const supported = processedKg > 0 ? Math.min(receivedKg, processedKg) : receivedKg;
  const discrepancy = Math.abs(claimedKg - supported);
  const lossPct = claimedKg > 0 ? (discrepancy / claimedKg) * 100 : 0;
  const within = lossPct <= tolerance;
  let finding: Finding;
  if (within) {
    finding = mk(
      {
        id: "find-MB-001",
        ruleId: "MB-001",
        ruleName: "Mass-Balance Loss Tolerance Check",
        severity: "info",
        title: "Mass Balance Variance Conforms to Standard Loss Policy",
        description: `Observed variance of ${fmt1(discrepancy)} kg (${fmt1(lossPct)}%) is within configured tolerance (${fmt1(tolerance)}%).`,
        recommendedAction: "Documented variance is within tolerance. Eligible for Circularity Passport.",
      },
      {
        observedValue: `${fmt1(discrepancy)} kg (${fmt1(lossPct)}%)`,
        expectedValue: `≤ ${fmt1(tolerance)}% tolerance`,
        difference: `${fmt1(discrepancy)} kg`,
        unit: "kg",
      }
    );
  } else if (lossPct > 30) {
    finding = mk(
      {
        id: "find-MB-003",
        ruleId: "MB-003",
        ruleName: "Severe Mass-Balance Reconciliation Deficit",
        severity: "critical",
        title: `Severe Mass Balance Deficit: ${fmt1(lossPct)}% Shortfall`,
        description: `Claim declares ${fmt0(claimedKg)} kg, but the documented downstream quantity is only ${fmt0(supported)} kg (${fmt0(discrepancy)} kg deficit). Exceeds the allowable loss threshold.`,
        recommendedAction: "Initiate formal physical audit. Passport issuance prohibited.",
      },
      {
        observedValue: `${fmt0(receivedKg)} kg`,
        expectedValue: `${fmt0(claimedKg)} kg (± ${tolerance}%)`,
        difference: `${fmt0(discrepancy)} kg shortfall`,
        unit: "kg",
      }
    );
  } else {
    finding = mk(
      {
        id: "find-MB-002",
        ruleId: "MB-002",
        ruleName: "Collection-to-Receipt Reconciliation",
        severity: "warning",
        title: `Material Quantity Shortfall: ${fmt1(lossPct)}% Variance`,
        description: `Observed variance of ${fmt1(discrepancy)} kg exceeds configured ${fmt1(tolerance)}% tolerance. Transported ${fmt0(transportedKg)} kg vs intake ${fmt0(receivedKg)} kg.`,
        recommendedAction: "Request carrier explanation or consignment second-truck waybill.",
      },
      {
        observedValue: `${fmt0(receivedKg)} kg`,
        expectedValue: `${fmt0(claimedKg)} kg (± ${tolerance}%)`,
        difference: `${fmt0(discrepancy)} kg shortfall`,
        unit: "kg",
      }
    );
  }
  return { supported, lossPct, within, findings: [finding] };
}

// ---------------------------------------------------------------- risk scoring
function calculateRisk(findings: Finding[], extractionConf: number, completeness: number, consistency: number): RiskScore {
  const critical = findings.filter((f) => f.severity === "critical").length;
  const warning = findings.filter((f) => f.severity === "warning").length;
  const operationalRisk = Math.min(100, critical * 50 + warning * 25);
  const base =
    (100 - consistency) * 0.25 + (100 - completeness) * 0.15 + (100 - extractionConf) * 0.05 + operationalRisk * 0.55;
  let overall: number;
  if (critical > 0) overall = Math.max(75, Math.min(99, pyRound(base + 25 * critical)));
  else if (warning > 0) overall = Math.max(35, Math.min(70, pyRound(base + 15 * warning)));
  else overall = Math.max(5, Math.min(25, pyRound(base)));

  let level: RiskLevel;
  let summary: string;
  if (overall <= 25) {
    level = "low";
    summary = "All documentary evidence is consistent and verified within allowable processing tolerances.";
  } else if (overall <= 70) {
    level = "medium";
    summary = "Requires human compliance auditor review due to moderate quantity variance or incomplete records.";
  } else {
    level = "high";
    summary = "Critical failure across multiple verification rules. Significant mass-balance deficit or timeline conflict detected.";
  }
  return {
    overallScore: overall,
    riskLevel: level,
    policyVersion: "v1.2-synthetic",
    summaryExplanation: summary,
    calculatedAt: new Date().toISOString(),
    breakdown: {
      extractionConfidence: extractionConf,
      evidenceCompleteness: completeness,
      crossDocumentConsistency: consistency,
      operationalRisk,
    },
  };
}

// ---------------------------------------------------------------- valuation
interface MaterialProfile {
  pathway: CircularPathway;
  processingCostPerKg: number;
  fractions: { name: string; cat: string; pct: number; price: number }[];
  assumptions: string[];
}

const MATERIALS: Record<EwasteCategory, MaterialProfile> = {
  it_telecom: {
    pathway: "material_recovery",
    processingCostPerKg: 2.84,
    fractions: [
      { name: "Gold (Au 99.9%)", cat: "precious_metal", pct: 0.025, price: 82500 },
      { name: "Silver (Ag)", cat: "precious_metal", pct: 0.096, price: 980 },
      { name: "Copper Cathode (Cu)", cat: "base_metal", pct: 14.4, price: 9.4 },
      { name: "Aluminum Ingot (Al)", cat: "base_metal", pct: 9.2, price: 2.45 },
      { name: "Engineered Polymer (ABS/PC)", cat: "polymer", pct: 36.8, price: 1.5 },
    ],
    assumptions: [
      "Composition fractions are reference averages for high-grade server PCBs; no separate recovery-efficiency factor is applied by this model.",
      "Spot pricing based on March 2025 benchmark rates (Au: $82,500/kg, Cu: $9.40/kg).",
      "Refining and pyrometallurgical cost modeled at $2.84/kg input mass.",
    ],
  },
  consumer_electronics: {
    pathway: "component_recovery",
    processingCostPerKg: 1.18,
    fractions: [
      { name: "Gold (Au Contacts)", cat: "precious_metal", pct: 0.015, price: 82500 },
      { name: "Copper Busbars (Cu)", cat: "base_metal", pct: 16.5, price: 9.4 },
      { name: "Structural Aluminum (Al)", cat: "base_metal", pct: 22.0, price: 2.45 },
      { name: "Technical Plastics", cat: "polymer", pct: 32.0, price: 1.93 },
    ],
    assumptions: [
      "Refurbishable cellular transceiver RF modules prioritized for component harvesting.",
      "Secondary copper and high-spec aluminum ingots recovered from chassis.",
    ],
  },
  large_appliances: {
    pathway: "material_recovery",
    processingCostPerKg: 0.36,
    fractions: [
      { name: "Heavy Steel Scrap", cat: "base_metal", pct: 64.0, price: 0.38 },
      { name: "Secondary Copper", cat: "base_metal", pct: 12.0, price: 8.8 },
      { name: "Cast Aluminum", cat: "base_metal", pct: 18.0, price: 2.1 },
    ],
    assumptions: [
      "Predominantly ferrous steel scrap and compressor copper windings.",
      "Mechanical shredding and magnetic separation cost estimated at $0.36/kg.",
    ],
  },
  small_appliances: {
    pathway: "recycling",
    processingCostPerKg: 0.55,
    fractions: [
      { name: "Copper Windings", cat: "base_metal", pct: 9.5, price: 9.0 },
      { name: "Recycled Steel", cat: "base_metal", pct: 48.0, price: 0.35 },
      { name: "Mixed Polymers", cat: "polymer", pct: 34.0, price: 0.85 },
    ],
    assumptions: ["Low-grade consumer electronics with mixed housing."],
  },
  batteries: {
    pathway: "material_recovery",
    processingCostPerKg: 4.1,
    fractions: [
      { name: "Lithium Carbonate (Li2CO3)", cat: "base_metal", pct: 6.8, price: 18.5 },
      { name: "Cobalt (Co)", cat: "base_metal", pct: 12.0, price: 28.0 },
      { name: "Nickel Cathode (Ni)", cat: "base_metal", pct: 22.0, price: 16.2 },
      { name: "Battery-Grade Graphite", cat: "other", pct: 18.0, price: 1.4 },
    ],
    assumptions: [
      "Hydrometallurgical black-mass fractions are reference values; no separate leaching-yield factor is applied by this model.",
    ],
  },
};

export const VALUATION_METHODOLOGY = [
  "Gross value = evidence-supported input mass x assumed material fraction x reference unit price, summed over fractions.",
  "Net value = gross value minus modeled processing cost (per-kg input mass), floored at zero.",
  "Reference prices are an illustrative dataset snapshot, not live market quotations. No recovery-efficiency or yield factor is applied beyond the listed composition fractions.",
  "The figure estimates potential material value only; it is not a transaction price, an audit result, or proof that recycling occurred.",
];

const round2 = (n: number) => Math.round(n * 100) / 100;

export function estimateMaterialValue(category: EwasteCategory, supportedKg: number | null): MaterialEstimate {
  const profile = MATERIALS[category];
  const common = {
    currency: "USD",
    recommendedPathway: profile.pathway,
    assumptions: [...profile.assumptions],
    methodology: [...VALUATION_METHODOLOGY],
    priceBasis: "Illustrative reference price table (not a live market quotation)",
    referencePriceDate: "2025-03-01",
    datasetVersion: "LME-COMEX-2025.1",
    calculatedAt: new Date().toISOString(),
  };
  if (supportedKg === null) {
    return {
      ...common,
      totalGrossValueUsd: 0,
      modeledProcessingCostUsd: 0,
      netEstimatedRecoveryValueUsd: 0,
      fractions: [],
      basisKg: null,
      isAvailable: false,
    };
  }
  let gross = 0;
  const fractions = profile.fractions.map((f) => {
    const qty = round2(supportedKg * (f.pct / 100));
    const val = round2(qty * f.price);
    gross += val;
    return {
      materialName: f.name,
      category: f.cat,
      fractionPercentage: f.pct,
      estimatedQuantityKg: qty,
      unitPriceUsd: f.price,
      estimatedValueUsd: val,
    };
  });
  const cost = round2(supportedKg * profile.processingCostPerKg);
  return {
    ...common,
    totalGrossValueUsd: round2(gross),
    modeledProcessingCostUsd: cost,
    netEstimatedRecoveryValueUsd: Math.max(0, round2(gross - cost)),
    fractions,
    basisKg: supportedKg,
    isAvailable: true,
  };
}

// ---------------------------------------------------------------- engine
export interface VerificationResult {
  status: VerificationStatus;
  massBalance: MassBalance;
  riskScore: RiskScore;
  materialEstimate: MaterialEstimate;
  findings: Finding[];
}

export function runVerification(input: BatchInput, documents: DocumentEvidence[]): VerificationResult {
  const tolerance = CATEGORY_TOLERANCE[input.category] ?? 2.0;
  const findings: Finding[] = [];
  const claimed = normalizeToKg(input.claimedQuantity, input.unit).kg;

  const value: Partial<Record<"received" | "transported" | "processed", number>> = {};
  const source: Partial<Record<"received" | "transported" | "processed", { doc: DocumentEvidence; fieldId: string; canonical: boolean }>> = {};

  for (const doc of documents) {
    for (const f of doc.extractedFields) {
      for (const stage of Object.keys(STAGE_FIELDS) as (keyof typeof STAGE_FIELDS)[]) {
        const { names, canonical } = STAGE_FIELDS[stage];
        if (!names.includes(f.fieldName)) continue;
        const num = Number(f.value);
        if (f.value === "" || !Number.isFinite(num)) continue;
        const { kg, error } = normalizeToKg(num, f.unit || "kg");
        if (error) {
          findings.push(
            mk(
              {
                id: `find-UN-001-${doc.id}-${f.id}`,
                ruleId: "UN-001",
                ruleName: "Unit Normalization",
                severity: "warning",
                title: "Unsupported Unit on Extracted Quantity",
                description: `Field '${f.label}' in '${doc.fileName}' uses unit '${f.unit}'. ${error} The value was not used for mass reconciliation.`,
                recommendedAction: "Correct the unit on the extracted field or re-extract the document.",
              },
              {
                observedValue: `${f.value} ${f.unit}`,
                expectedValue: "kg, metric_ton, or lb",
                sourceDocumentId: doc.id,
                sourceDocumentName: doc.fileName,
                sourceFieldId: f.id,
                lifecycleStage: stage,
              }
            )
          );
          continue;
        }
        const isCanonical = doc.documentType === canonical;
        const prior = source[stage];
        if (!prior || isCanonical || !prior.canonical) {
          value[stage] = kg;
          source[stage] = { doc, fieldId: f.id, canonical: isCanonical };
        }
      }
    }
  }

  const transported = value.transported ?? null;
  const received = value.received ?? null;
  const processed = value.processed ?? null;

  let supported: number | null = null;
  let lossPct = 0;
  let within = false;
  if (received === null && processed === null) {
    findings.push(
      mk(
        {
          id: "find-MB-000",
          ruleId: "MB-000",
          ruleName: "Mass-Balance Evidence Availability",
          severity: "warning",
          title: "Mass Balance Cannot Be Assessed: No Received or Processed Quantity Documented",
          description: `The claim declares ${fmt0(claimed)} kg but no weighbridge/scale record or processing certificate states a received or processed quantity, so no quantity is evidence-supported.`,
          recommendedAction: "Attach a weighbridge scale record for the received quantity.",
        },
        {
          observedValue: "Not recorded",
          expectedValue: `${fmt0(claimed)} kg (± ${tolerance}%) documented at intake`,
          lifecycleStage: "received",
        }
      )
    );
  } else {
    const r = evaluateMassBalance(
      claimed,
      transported ?? claimed,
      received ?? (processed as number),
      processed ?? (received as number),
      tolerance
    );
    supported = r.supported;
    lossPct = r.lossPct;
    within = r.within;
    const limiting = processed !== null && (received === null || processed <= received) ? "processed" : "received";
    const src = source[limiting] ?? source.received ?? source.processed;
    for (const f of r.findings) {
      f.lifecycleStage = limiting;
      if (src) {
        f.sourceDocumentId = src.doc.id;
        f.sourceDocumentName = src.doc.fileName;
        f.sourceFieldId = src.fieldId;
      }
      findings.push(f);
    }
  }

  // Timeline
  const c = parseIsoDate(input.collectionDate);
  const p = parseIsoDate(input.processingDate);
  if (c && p && p < c) {
    const days = Math.floor((c.getTime() - p.getTime()) / 86400000);
    findings.push(
      mk(
        {
          id: "find-TL-001",
          ruleId: "TL-001",
          ruleName: "Timeline Plausibility Validation",
          severity: "critical",
          title: "Chronological Anachronism in Consignment Sequence",
          description: `Processing scale date (${input.processingDate}) precedes collection date (${input.collectionDate}) by ${days} days. Material cannot be weighed prior to physical collection.`,
          recommendedAction: "Flag for compliance review. Suspected reused or fraudulent weighbridge ticket.",
        },
        {
          observedValue: `Processing: ${input.processingDate} < Collection: ${input.collectionDate}`,
          expectedValue: "Collection Date ≤ Processing Date",
          lifecycleStage: "timeline",
        }
      )
    );
  }

  // Recycler consistency + duplicates
  for (const doc of documents) {
    for (const f of doc.extractedFields) {
      if (["recycler_name", "operator_name", "entity_name"].includes(f.fieldName)) {
        const val = String(f.value).trim().toLowerCase();
        const claimedName = input.recyclerName.trim().toLowerCase();
        if (!val.includes(claimedName) && !claimedName.includes(val)) {
          findings.push(
            mk(
              {
                id: `find-ID-001-${doc.id}-${f.id}`,
                ruleId: "ID-001",
                ruleName: "Recycler Identity & Registration Consistency",
                severity: "critical",
                title: "Unregistered Recycler Entity Invoiced",
                description: `Document '${doc.fileName}' specifies entity '${f.value}' which conflicts with claimed licensed operator '${input.recyclerName}'.`,
                recommendedAction: "Verify corporate affiliation or request accredited sub-contractor license.",
              },
              {
                observedValue: String(f.value),
                expectedValue: input.recyclerName,
                sourceDocumentId: doc.id,
                sourceDocumentName: doc.fileName,
                sourceFieldId: f.id,
                lifecycleStage: "identity",
              }
            )
          );
        }
      }
    }
  }
  for (const doc of documents) {
    for (const f of doc.extractedFields) {
      if (["waybill_number", "serial_number", "certificate_id"].includes(f.fieldName)) {
        const val = String(f.value).trim();
        if (KNOWN_DUPLICATE_SERIALS.includes(val)) {
          findings.push(
            mk(
              {
                id: `find-DP-001-${doc.id}-${f.id}`,
                ruleId: "DP-001",
                ruleName: "Duplicate Evidence Identification",
                severity: "warning",
                title: "Manifest Serial Collision with Archive Records",
                description: `Document serial '${val}' matches an archived consignment in the historical registry.`,
                recommendedAction: "Verify physical manifest against carrier master dispatch log.",
              },
              {
                observedValue: `Serial ${val} previously used`,
                expectedValue: "Unique consignment serial",
                sourceDocumentId: doc.id,
                sourceDocumentName: doc.fileName,
                sourceFieldId: f.id,
                lifecycleStage: "evidence_uniqueness",
              }
            )
          );
        }
      }
    }
  }

  // Completeness
  const required = MANDATORY_DOCUMENTS[input.category] ?? MANDATORY_DOCUMENTS.it_telecom;
  const present = new Set(documents.map((d) => d.documentType));
  const missing = required.filter((t) => !present.has(t));
  const completeness = required.length ? 100 - (missing.length / required.length) * 50 : 100;
  if (missing.length) {
    const names = missing.map((t) => t.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())).join(", ");
    findings.push(
      mk(
        {
          id: "find-EC-001",
          ruleId: "EC-001",
          ruleName: "Evidence Completeness Verification",
          severity: "warning",
          title: "Mandatory Consignment Records Missing",
          description: `Dossier lacks required documentary evidence: ${names}.`,
          recommendedAction: "Attach certified document before requesting Circularity Passport issuance.",
        },
        { observedValue: `Missing: ${names}`, expectedValue: "All mandatory documents attached" }
      )
    );
  }

  // Scoring
  const confs = documents.flatMap((d) => d.extractedFields.map((f) => (f.confidence <= 1 ? f.confidence * 100 : f.confidence)));
  const extractionConf = confs.length ? pyRound(confs.reduce((a, b) => a + b, 0) / confs.length, 1) : 95;
  let consistency = Math.max(20, 100 - lossPct * 1.5);
  if (findings.some((f) => f.severity === "critical")) consistency = Math.min(consistency, 30);
  else if (findings.some((f) => f.severity === "warning")) consistency = Math.min(consistency, 65);
  const riskScore = calculateRisk(findings, extractionConf, completeness, consistency);

  const hasCritical = findings.some((f) => f.severity === "critical");
  const hasWarning = findings.some((f) => f.severity === "warning");
  const status: VerificationStatus = hasCritical || hasWarning || !within || completeness < 100 ? "REVIEW_REQUIRED" : "SUPPORTED";

  const massBalance: MassBalance = {
    claimedKg: claimed,
    transportedKg: transported,
    receivedKg: received,
    processedKg: processed,
    recoveredKg: null,
    evidenceSupportedKg: supported,
    discrepancyKg: supported === null ? null : Math.abs(claimed - supported),
    lossPercentage: supported === null ? null : pyRound(lossPct, 1),
    tolerancePercentage: tolerance,
    isWithinTolerance: within,
  };

  return {
    status,
    massBalance,
    riskScore,
    materialEstimate: estimateMaterialValue(input.category, supported),
    findings,
  };
}

export function batchToInput(b: Batch): BatchInput {
  return {
    batchNumber: b.batchNumber,
    category: b.category,
    claimedQuantity: b.claimedQuantity,
    unit: b.unit,
    recyclerName: b.recyclerName,
    recyclerRegistrationId: b.recyclerRegistrationId,
    collectionDate: b.collectionDate,
    processingDate: b.processingDate,
    originLocation: b.originLocation,
    destinationLocation: b.destinationLocation,
  };
}

/**
 * Re-run verification on an existing batch (in place copy). An explicit auditor decision is
 * never silently overridden; the automated result is recorded on the timeline instead.
 */
export function reverifyBatch(batch: Batch, reason: string, actor = "Deterministic Verification Engine (Demo)"): Batch {
  const r = runVerification(batchToInput(batch), batch.documents);
  const retained = batch.auditorDecision?.decision;
  let note = `${reason}. Automated result: ${r.status}.`;
  if (retained && retained !== r.status) note += ` Authorized auditor decision ${retained} retained pending re-review.`;
  return {
    ...batch,
    status: retained ?? r.status,
    massBalance: r.massBalance,
    riskScore: r.riskScore,
    materialEstimate: r.materialEstimate,
    findings: r.findings,
    timeline: [
      ...batch.timeline,
      {
        id: `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        actor,
        action: "Verification Re-run",
        note,
        severity: "info",
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}
