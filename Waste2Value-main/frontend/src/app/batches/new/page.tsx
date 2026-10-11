"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileText,
  FolderUp,
  Info,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import type { DocumentType, EwasteCategory } from "@/types";
import { ApiError, attachEvidence, createBatch, errorMessage, EvidenceDraft, storageEnabled } from "@/lib/api-client";
import { useExecutionMode } from "@/lib/hooks";
import { getStoredBatches } from "@/lib/store";
import { sha256HexBytes } from "@/lib/sha256";
import { CATEGORY_LABELS, DOCUMENT_TYPE_LABELS, VERIFICATION_STATUS_META, actionableFindings } from "@/lib/domain";
import {
  DetailsErrors,
  DetailsInput,
  EvidenceItemState,
  STATED_WEIGHT_LABEL,
  chronologyWarning,
  computeReadiness,
  evidencePolicy,
  formatFileSize,
  guessDocumentType,
  isWeightBearing,
  parseQuantity,
  validateDetails,
  validateFile,
} from "@/lib/intake";
import { SUPPORTED_UNITS } from "@/lib/demo-engine";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ModeNotice } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { useCrumbs } from "@/components/ui/Breadcrumbs";

const INPUT =
  "w-full px-3.5 py-2.5 text-sm rounded-xl border bg-slate-50 dark:bg-darkbg-hover text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500";
// Unit selects sit beside a number input: they must not inherit w-full (it would squeeze the number to ~0 width).
const INPUT_UNIT = INPUT.replace("w-full ", "");
const BORDER_OK = "border-slate-300 dark:border-darkbg-border";
const BORDER_ERR = "border-rose-500";
const UNIT_LABEL: Record<string, string> = { kg: "kg", metric_ton: "metric tonnes", lb: "lb" };

interface EvidenceItem extends EvidenceItemState {
  file?: File;
  size: number;
  progress: number;
  hash?: string;
}

const EMPTY_DETAILS: DetailsInput = {
  batchNumber: "",
  category: "it_telecom",
  claimedQuantity: "",
  unit: "kg",
  recyclerName: "",
  recyclerRegistrationId: "",
  collectionDate: "",
  processingDate: "",
  originLocation: "",
  destinationLocation: "",
};

const PRESETS: Record<
  string,
  { label: string; details: Omit<DetailsInput, "batchNumber">; notes: string; evidence: { type: DocumentType; name: string; weight: number }[] }
> = {
  clean: {
    label: "Clean sample",
    details: {
      category: "it_telecom",
      claimedQuantity: "5000",
      unit: "kg",
      recyclerName: "GreenTech Circular Ltd",
      recyclerRegistrationId: "REG-2024-ENV-8841",
      collectionDate: "2025-03-10",
      processingDate: "2025-03-14",
      originLocation: "Munich IT Hub, Germany",
      destinationLocation: "GreenTech Facility 4, Leipzig",
    },
    notes: "Demo sample: consistent waybill, weighbridge and certificate.",
    evidence: [
      { type: "transport_waybill", name: "SAMPLE-waybill-5000kg.pdf", weight: 5000 },
      { type: "weighbridge_record", name: "SAMPLE-weighbridge-4960kg.pdf", weight: 4960 },
      { type: "recycling_certificate", name: "SAMPLE-certificate-4920kg.pdf", weight: 4920 },
    ],
  },
  borderline: {
    label: "Quantity-shortfall sample",
    details: {
      category: "consumer_electronics",
      claimedQuantity: "12000",
      unit: "kg",
      recyclerName: "EcoCycle Logistics & Refurbishment",
      recyclerRegistrationId: "REG-2023-ENV-5510",
      collectionDate: "2025-03-18",
      processingDate: "2025-03-24",
      originLocation: "Rotterdam Port, Netherlands",
      destinationLocation: "EcoCycle Facility B, Antwerp",
    },
    notes: "Demo sample: weighbridge records far less than the claim.",
    evidence: [
      { type: "transport_waybill", name: "SAMPLE-waybill-12000kg.pdf", weight: 12000 },
      { type: "weighbridge_record", name: "SAMPLE-weighbridge-8500kg.pdf", weight: 8500 },
    ],
  },
};

function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

async function hashFileBytes(bytes: ArrayBuffer): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return sha256HexBytes(new Uint8Array(bytes));
}

export default function NewBatchIntakePage() {
  const router = useRouter();
  const { success, error: toastError, info, warning } = useToast();
  const mode = useExecutionMode();
  const uid = useId();
  useCrumbs([{ label: "Batches", href: "/batches" }, { label: "New Batch" }]);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [details, setDetails] = useState<DetailsInput>(() => ({
    ...EMPTY_DETAILS,
    batchNumber: `BATCH-${new Date().getFullYear()}-${String(Math.floor(100 + Math.random() * 900))}`,
  }));
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<DetailsErrors>({});
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const [fileMessages, setFileMessages] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<EvidenceItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; failed: { fileName: string; message: string }[] } | null>(null);
  const submittingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // true: files go to private S3 storage and are read by Amazon Textract; false/null: names + typed quantities only.
  const [storage, setStorage] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    storageEnabled().then((v) => live && setStorage(v));
    return () => {
      live = false;
    };
  }, [mode]);

  const setField = <K extends keyof DetailsInput>(key: K, value: DetailsInput[K]) => {
    setDetails((d) => ({ ...d, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  const duplicateBatchNumber = useMemo(
    () => mode === "demo" && !created && getStoredBatches().some((b) => b.batchNumber === details.batchNumber.trim()),
    [mode, details.batchNumber, created]
  );

  const readiness = useMemo(
    () => computeReadiness(details, items, { duplicateBatchNumber }),
    [details, items, duplicateBatchNumber]
  );
  const policy = useMemo(() => evidencePolicy(details.category as EwasteCategory), [details.category]);
  const chrono = chronologyWarning(details.collectionDate, details.processingDate);

  // ------------------------------------------------------------ step navigation
  const goStep = (target: 1 | 2 | 3): boolean => {
    if (target === 1) {
      setStep(1);
      return true;
    }
    const errs = validateDetails(details);
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      setStep(1);
      toastError("Fix the highlighted fields", "Batch details must be valid before continuing.");
      return false;
    }
    setStep(target);
    return true;
  };

  // ------------------------------------------------------------ files
  const addFiles = useCallback(
    (list: FileList | File[]) => {
      const messages: string[] = [];
      const accepted: { item: EvidenceItem; file: File }[] = [];
      for (const file of Array.from(list)) {
        const problem = validateFile(file);
        const duplicate = items.some((i) => i.fileName === file.name && i.size === file.size) || accepted.some((a) => a.file.name === file.name && a.file.size === file.size);
        if (problem) {
          messages.push(`${file.name}: ${problem}`);
          continue;
        }
        if (duplicate) {
          messages.push(`${file.name}: a file with the same name and size is already attached.`);
          continue;
        }
        accepted.push({
          file,
          item: {
            localId: newId(),
            fileName: file.name,
            file,
            size: file.size,
            documentType: guessDocumentType(file.name),
            statedWeight: "",
            statedUnit: "kg",
            state: "reading",
            progress: 0,
          },
        });
      }
      setFileMessages(messages);
      if (accepted.length === 0) return;
      setItems((prev) => [...prev, ...accepted.map((a) => a.item)]);

      for (const { file, item } of accepted) {
        const reader = new FileReader();
        reader.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            setItems((prev) => prev.map((i) => (i.localId === item.localId ? { ...i, progress: pct } : i)));
          }
        };
        reader.onerror = () =>
          setItems((prev) =>
            prev.map((i) => (i.localId === item.localId ? { ...i, state: "error", error: "The browser could not read this file." } : i))
          );
        reader.onload = async () => {
          try {
            const hash = await hashFileBytes(reader.result as ArrayBuffer);
            setItems((prev) => {
              const dup = prev.find((i) => i.localId !== item.localId && i.hash === hash);
              return prev.map((i) =>
                i.localId !== item.localId
                  ? i
                  : dup
                  ? { ...i, state: "error", progress: 100, hash, error: `Duplicate content: identical to ${dup.fileName}.` }
                  : { ...i, state: "ready", progress: 100, hash }
              );
            });
          } catch {
            setItems((prev) =>
              prev.map((i) => (i.localId === item.localId ? { ...i, state: "error", error: "The file could not be fingerprinted." } : i))
            );
          }
        };
        reader.readAsArrayBuffer(file);
      }
    },
    [items]
  );

  const addSamples = (key: keyof typeof PRESETS) => {
    const p = PRESETS[key];
    setErrors({});
    setDetails((d) => ({ ...d, ...p.details }));
    setNotes(p.notes);
    setItems(
      p.evidence.map((e) => ({
        localId: newId(),
        fileName: e.name,
        size: 0,
        progress: 100,
        documentType: e.type,
        statedWeight: String(e.weight),
        statedUnit: "kg",
        state: "ready",
        isSample: true,
      }))
    );
    setFileMessages([]);
    info(`${p.label} loaded`, "Details and simulated sample evidence were filled in. Sample evidence is not an uploaded file.");
  };

  const updateItem = (localId: string, patch: Partial<EvidenceItem>) =>
    setItems((prev) => prev.map((i) => (i.localId === localId ? { ...i, ...patch } : i)));

  // ------------------------------------------------------------ submit
  const toDrafts = (list: EvidenceItem[]): EvidenceDraft[] =>
    list
      .filter((i) => i.state === "ready")
      .map((i) => {
        const meta = STATED_WEIGHT_LABEL[i.documentType];
        const weight = parseQuantity(i.statedWeight);
        return {
          localId: i.localId,
          title: DOCUMENT_TYPE_LABELS[i.documentType],
          documentType: i.documentType,
          fileName: i.fileName,
          file: storage ? i.file : undefined,
          fileSize: i.isSample ? "Sample (no file)" : formatFileSize(i.size),
          fields:
            meta && weight !== null && weight > 0
              ? [{ fieldName: meta.fieldName, label: meta.label, value: weight, unit: i.statedUnit }]
              : [],
        };
      });

  const handleSubmit = async () => {
    if (submittingRef.current || !readiness.canSubmit) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const drafts = toDrafts(items);
      const result = created
        ? await attachEvidence(
            created.id,
            drafts.filter((d) => created.failed.some((f) => f.fileName === d.fileName)),
            setSubmitStatus
          )
        : await createBatch({
            input: {
              batchNumber: details.batchNumber.trim(),
              category: details.category as EwasteCategory,
              claimedQuantity: parseQuantity(details.claimedQuantity) as number,
              unit: details.unit,
              recyclerName: details.recyclerName.trim(),
              recyclerRegistrationId: details.recyclerRegistrationId.trim(),
              collectionDate: details.collectionDate,
              processingDate: details.processingDate,
              originLocation: details.originLocation.trim(),
              destinationLocation: details.destinationLocation.trim(),
            },
            notes: notes.trim() || undefined,
            evidence: drafts,
            onStatus: setSubmitStatus,
          });

      const { batch, failedEvidence } = result;
      setCreated({ id: batch.id, failed: failedEvidence });
      if (failedEvidence.length > 0) {
        warning(
          "Batch created, evidence incomplete",
          `${failedEvidence.length} evidence record(s) were not registered. The batch exists; retry registration below.`
        );
        return;
      }
      const open = actionableFindings(batch).length;
      success(
        "Batch created. Verification completed",
        `${VERIFICATION_STATUS_META[batch.status].label}. ${open === 0 ? "No findings need review." : `${open} finding${open === 1 ? "" : "s"} need review.`}`
      );
      router.push(`/batches/${encodeURIComponent(batch.id)}`);
    } catch (err) {
      const message = errorMessage(err);
      if (err instanceof ApiError && /already exists/i.test(message)) {
        setErrors((e) => ({ ...e, batchNumber: message }));
        setStep(1);
      }
      setSubmitError(message);
      toastError(created ? "Evidence registration failed" : "Batch was not created", message);
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
      setSubmitStatus(null);
    }
  };

  const errId = (k: keyof DetailsInput) => `${uid}-${k}-error`;
  const fieldProps = (k: keyof DetailsInput) => ({
    id: `${uid}-${k}`,
    "aria-invalid": errors[k] ? true : undefined,
    "aria-describedby": errors[k] ? errId(k) : undefined,
    className: `${INPUT} ${errors[k] ? BORDER_ERR : BORDER_OK}`,
  });
  const labelFor = (k: keyof DetailsInput, text: string, required = true) => (
    <label htmlFor={`${uid}-${k}`} className="block text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-text-dark-primary mb-1">
      {text} {required ? <span aria-hidden="true">*</span> : <span className="font-normal normal-case text-slate-600">(optional)</span>}
    </label>
  );
  const fieldError = (k: keyof DetailsInput) =>
    errors[k] ? (
      <p id={errId(k)} className="text-xs text-rose-700 dark:text-rose-300 mt-1">
        {errors[k]}
      </p>
    ) : null;

  const steps = [
    { n: 1 as const, label: "Batch details", sub: "Category, quantity and recycler" },
    { n: 2 as const, label: "Evidence", sub: "Documents and stated quantities" },
    { n: 3 as const, label: "Submission readiness", sub: "Review and verify" },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-darkbg-border">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">Batch Intake</h1>
          <p className="text-sm text-slate-700 dark:text-text-dark-secondary">
            Register a batch and its evidence, then run verification against the policy.
          </p>
          <ModeNotice mode={mode} />
        </div>
        {mode === "demo" && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Demo samples">
            <span className="text-xs font-bold text-slate-700 dark:text-text-dark-muted">Demo samples:</span>
            {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => addSamples(k)}
                className="px-2.5 py-1 text-xs font-bold rounded-xl bg-violet-50 text-violet-900 dark:bg-violet-950/70 dark:text-violet-200 border border-violet-300 dark:border-violet-800 hover:bg-violet-100"
              >
                {PRESETS[k].label}
              </button>
            ))}
          </div>
        )}
      </div>

      <nav aria-label="Intake steps">
        <ol className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {steps.map((s) => (
            <li key={s.n}>
              <button
                type="button"
                onClick={() => goStep(s.n)}
                aria-current={step === s.n ? "step" : undefined}
                className={`w-full p-3.5 rounded-2xl border text-left ${
                  step === s.n
                    ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-950 dark:text-mint font-bold"
                    : "border-slate-300 dark:border-darkbg-border text-slate-800 dark:text-text-dark-secondary hover:border-emerald-500"
                }`}
              >
                <span className="flex items-center gap-2 text-sm">
                  <span aria-hidden="true" className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${step === s.n ? "bg-emerald-700 text-white" : step > s.n ? "bg-emerald-200 text-emerald-900" : "bg-slate-200 text-slate-800"}`}>
                    {step > s.n ? "✓" : s.n}
                  </span>
                  <span>
                    Step {s.n}: {s.label}
                  </span>
                </span>
                <span className="block text-xs text-slate-600 dark:text-text-dark-muted mt-1">{s.sub}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      {created && created.failed.length === 0 && (
        <p role="status" className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-sm text-emerald-950">
          Batch created. Opening it now…
        </p>
      )}

      {submitError && (
        <div role="alert" className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-sm text-rose-950 dark:text-rose-100">
          <strong>{created ? "Evidence registration failed." : "The batch was not created."}</strong> {submitError}
        </div>
      )}

      {/* STEP 1 */}
      {step === 1 && (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            goStep(2);
          }}
          className="rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-4 sm:p-6 shadow-card space-y-6"
        >
          <div className="pb-3 border-b border-slate-100 dark:border-darkbg-border">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Batch details</h2>
            <p className="text-xs text-slate-700 dark:text-text-dark-muted mt-0.5">Fields marked * are required. Quantities are stated in the unit you choose.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              {labelFor("batchNumber", "Batch identifier")}
              <input type="text" value={details.batchNumber} onChange={(e) => setField("batchNumber", e.target.value)} {...fieldProps("batchNumber")} />
              {fieldError("batchNumber")}
              {!errors.batchNumber && duplicateBatchNumber && <p className="text-xs text-rose-700 mt-1">This identifier already exists in the demo dataset.</p>}
            </div>
            <div>
              {labelFor("category", "E-waste category")}
              <select value={details.category} onChange={(e) => setField("category", e.target.value)} {...fieldProps("category")}>
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              {fieldError("category")}
            </div>
            <div>
              {labelFor("claimedQuantity", "Claimed quantity")}
              <div className="flex gap-2">
                <input type="number" inputMode="decimal" min="0" step="any" value={details.claimedQuantity} onChange={(e) => setField("claimedQuantity", e.target.value)} {...fieldProps("claimedQuantity")} className={`${fieldProps("claimedQuantity").className} flex-1 min-w-0`} />
                <select aria-label="Claimed quantity unit" value={details.unit} onChange={(e) => setField("unit", e.target.value)} className={`${INPUT_UNIT} ${BORDER_OK} w-36 shrink-0`}>
                  {SUPPORTED_UNITS.map((u) => (
                    <option key={u} value={u}>{UNIT_LABEL[u]}</option>
                  ))}
                </select>
              </div>
              {fieldError("claimedQuantity")}
              {fieldError("unit")}
            </div>
            <div>
              {labelFor("recyclerName", "Recycler / operator name")}
              <input type="text" value={details.recyclerName} onChange={(e) => setField("recyclerName", e.target.value)} {...fieldProps("recyclerName")} />
              {fieldError("recyclerName")}
            </div>
            <div>
              {labelFor("recyclerRegistrationId", "Facility registration ID")}
              <input type="text" value={details.recyclerRegistrationId} onChange={(e) => setField("recyclerRegistrationId", e.target.value)} {...fieldProps("recyclerRegistrationId")} />
              {fieldError("recyclerRegistrationId")}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:col-span-1">
              <div>
                {labelFor("collectionDate", "Collection date")}
                <input type="date" value={details.collectionDate} onChange={(e) => setField("collectionDate", e.target.value)} {...fieldProps("collectionDate")} />
                <p className="text-xs text-slate-600 dark:text-text-dark-muted mt-1">When the e-waste was collected and dispatched.</p>
                {fieldError("collectionDate")}
              </div>
              <div>
                {labelFor("processingDate", "Processing date", false)}
                <input type="date" value={details.processingDate} onChange={(e) => setField("processingDate", e.target.value)} {...fieldProps("processingDate")} />
                <p className="text-xs text-slate-600 dark:text-text-dark-muted mt-1">When the recycler processed it. Leave empty if pending. One date is recorded per batch.</p>
                {fieldError("processingDate")}
              </div>
            </div>
            <div>
              {labelFor("originLocation", "Collection origin")}
              <input type="text" value={details.originLocation} onChange={(e) => setField("originLocation", e.target.value)} {...fieldProps("originLocation")} />
              {fieldError("originLocation")}
            </div>
            <div>
              {labelFor("destinationLocation", "Destination facility")}
              <input type="text" value={details.destinationLocation} onChange={(e) => setField("destinationLocation", e.target.value)} {...fieldProps("destinationLocation")} />
              {fieldError("destinationLocation")}
            </div>
            <div className="sm:col-span-2">
              <label htmlFor={`${uid}-notes`} className="block text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-text-dark-primary mb-1">
                Notes <span className="font-normal normal-case text-slate-600">(optional)</span>
              </label>
              <textarea id={`${uid}-notes`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${INPUT} ${BORDER_OK}`} />
            </div>
          </div>

          {chrono && (
            <p role="note" className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-950 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              {chrono}
            </p>
          )}

          <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-darkbg-border">
            <Button type="submit" rightIcon={<ArrowRight className="w-4 h-4" aria-hidden="true" />}>
              Continue to evidence
            </Button>
          </div>
        </form>
      )}

      {/* STEP 2 */}
      {step === 2 && (
        <div className="rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-4 sm:p-6 shadow-card space-y-6">
          <div className="pb-3 border-b border-slate-100 dark:border-darkbg-border">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Evidence documents</h2>
            <p className="text-xs text-slate-700 dark:text-text-dark-muted mt-0.5">
              Requirements below apply to the {CATEGORY_LABELS[details.category as EwasteCategory]} category under the active verification policy.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-darkbg-hover border border-slate-200/80 dark:border-darkbg-border text-xs space-y-2">
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Info className="w-4 h-4 text-emerald-700 dark:text-mint" aria-hidden="true" /> Document requirements
            </h3>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-800 dark:text-text-dark-secondary">
              {policy.filter((p) => p.level === "required").map((p) => (
                <li key={p.type}>
                  <strong className="text-slate-900 dark:text-white">{DOCUMENT_TYPE_LABELS[p.type]} (required):</strong> {p.reason}
                </li>
              ))}
              {policy.filter((p) => p.level === "optional" && p.type !== "other").slice(0, 2).map((p) => (
                <li key={p.type}>
                  <strong className="text-slate-900 dark:text-white">{DOCUMENT_TYPE_LABELS[p.type]} (optional):</strong> {p.reason}
                </li>
              ))}
            </ul>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
            }}
            className={`border-2 border-dashed rounded-3xl p-6 sm:p-8 text-center ${isDragging ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" : "border-emerald-500/50"}`}
          >
            <FolderUp className="w-9 h-9 text-emerald-700 dark:text-mint mx-auto mb-3" aria-hidden="true" />
            <p className="text-sm font-bold text-slate-900 dark:text-white">Drag and drop files here, or choose files</p>
            <p className="text-xs text-slate-700 dark:text-text-dark-muted mt-1 max-w-xl mx-auto">
              PDF, PNG or JPG, up to 25 MB each. Files are read in your browser for validation and duplicate detection.{" "}
              {storage ? (
                <strong>
                  On submit, files are uploaded to private Amazon S3 storage and read by AWS document AI: Amazon Rekognition OCR for PNG/JPG (real confidence and regions) and Amazon Nova for PDFs (AI-read values, up to 4.5 MB). Storage limit: 10 MB. Quantities you type are only a fallback if the OCR cannot read them.
                </strong>
              ) : (
                <strong>The service registers evidence by name, type and the quantities you enter; file contents are not stored or OCR-processed.</strong>
              )}
            </p>
            <input
              ref={fileInputRef}
              id={`${uid}-files`}
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
              className="sr-only"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <div className="mt-4">
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} leftIcon={<FolderUp className="w-4 h-4" aria-hidden="true" />}>
                Choose files
              </Button>
            </div>
          </div>

          {fileMessages.length > 0 && (
            <ul role="alert" className="space-y-1 p-3 rounded-xl bg-rose-50 border border-rose-300 text-xs text-rose-950">
              {fileMessages.map((m) => (
                <li key={m} className="flex items-start gap-1.5">
                  <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" /> {m}
                </li>
              ))}
            </ul>
          )}

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-text-dark-primary mb-3">
              Attached evidence ({items.length})
            </h3>
            {items.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-700 border border-slate-300 dark:border-darkbg-border rounded-2xl">
                No evidence attached. You can still submit; verification will flag missing required documents.
              </p>
            ) : (
              <ul className="space-y-3">
                {items.map((item) => {
                  const meta = STATED_WEIGHT_LABEL[item.documentType];
                  return (
                    <li key={item.localId} className="p-4 rounded-2xl border border-slate-300 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg-hover space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-mint shrink-0" aria-hidden="true">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 dark:text-white font-mono break-all">{item.fileName}</p>
                            <p className="text-xs text-slate-700 dark:text-text-dark-muted">
                              {item.isSample ? "Simulated sample (no file)" : formatFileSize(item.size)}
                              {" · "}
                              {item.state === "reading" && (
                                <span role="status" className="inline-flex items-center gap-1">
                                  <Loader2 className="w-3 h-3 motion-safe:animate-spin" aria-hidden="true" /> Reading {item.progress}%
                                </span>
                              )}
                              {item.state === "ready" && <span className="text-emerald-800 dark:text-mint font-semibold">Ready</span>}
                              {item.state === "error" && <span className="text-rose-800 font-semibold">Not usable</span>}
                            </p>
                            {item.state === "reading" && (
                              <progress className="w-48 h-1.5 mt-1" max={100} value={item.progress} aria-label={`Reading ${item.fileName}`} />
                            )}
                            {item.error && (
                              <p role="alert" className="text-xs text-rose-800 dark:text-rose-200 mt-1">{item.error}</p>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setRemoveTarget(item)}
                          className="text-slate-600 hover:text-rose-700 p-1.5 rounded-lg shrink-0"
                          aria-label={`Remove ${item.fileName}`}
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>

                      {item.state !== "error" && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label htmlFor={`${uid}-type-${item.localId}`} className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                              Document type
                            </label>
                            <select
                              id={`${uid}-type-${item.localId}`}
                              value={item.documentType}
                              onChange={(e) => updateItem(item.localId, { documentType: e.target.value as DocumentType })}
                              className={`${INPUT} ${BORDER_OK}`}
                            >
                              {Object.entries(DOCUMENT_TYPE_LABELS).map(([k, v]) => (
                                <option key={k} value={k}>{v}</option>
                              ))}
                            </select>
                          </div>
                          {meta && isWeightBearing(item.documentType) && (
                            <div>
                              <label htmlFor={`${uid}-w-${item.localId}`} className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                                {meta.label} <span className="font-normal normal-case">{storage && item.file ? "(optional fallback if OCR cannot read it)" : "(manual entry)"}</span>
                              </label>
                              <div className="flex gap-2">
                                <input
                                  id={`${uid}-w-${item.localId}`}
                                  type="number"
                                  inputMode="decimal"
                                  min="0"
                                  step="any"
                                  value={item.statedWeight}
                                  onChange={(e) => updateItem(item.localId, { statedWeight: e.target.value })}
                                  className={`${INPUT} ${BORDER_OK} flex-1 min-w-0`}
                                />
                                <select aria-label="Unit of stated weight" value={item.statedUnit} onChange={(e) => updateItem(item.localId, { statedUnit: e.target.value })} className={`${INPUT_UNIT} ${BORDER_OK} w-32 shrink-0`}>
                                  {SUPPORTED_UNITS.map((u) => (
                                    <option key={u} value={u}>{UNIT_LABEL[u]}</option>
                                  ))}
                                </select>
                              </div>
                              <p className="text-xs text-slate-600 dark:text-text-dark-muted mt-1">
                                {storage && item.file ? `Used as the ${meta.stage} only when the OCR finds no value; OCR results take precedence and stay correctable.` : `Recorded as the ${meta.stage}. Entered by you, not extracted by OCR.`}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex justify-between pt-4 border-t border-slate-100 dark:border-darkbg-border">
            <Button variant="outline" onClick={() => setStep(1)} leftIcon={<ArrowLeft className="w-4 h-4" aria-hidden="true" />}>
              Back to details
            </Button>
            <Button onClick={() => goStep(3)} rightIcon={<ArrowRight className="w-4 h-4" aria-hidden="true" />}>
              Continue to readiness
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3 */}
      {step === 3 && (
        <div className="rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-4 sm:p-6 shadow-card space-y-6">
          <div className="pb-3 border-b border-slate-100 dark:border-darkbg-border">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Submission readiness</h2>
            <p className="text-xs text-slate-700 dark:text-text-dark-muted mt-0.5">
              Only blocked items prevent submission. Items that need attention are allowed and will appear as findings for review.
            </p>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-darkbg-hover border border-slate-200 dark:border-darkbg-border">
              <dt className="text-slate-700">Batch</dt>
              <dd className="font-mono font-bold text-sm text-slate-900 dark:text-white">{details.batchNumber}</dd>
              <dd className="text-slate-700 mt-1">{CATEGORY_LABELS[details.category as EwasteCategory]}</dd>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-darkbg-hover border border-slate-200 dark:border-darkbg-border">
              <dt className="text-slate-700">Claimed quantity</dt>
              <dd className="font-bold text-sm text-slate-900 dark:text-white">
                {details.claimedQuantity || "—"} {UNIT_LABEL[details.unit] ?? details.unit}
              </dd>
              <dd className="text-slate-700 mt-1 truncate">From {details.originLocation || "—"}</dd>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-darkbg-hover border border-slate-200 dark:border-darkbg-border">
              <dt className="text-slate-700">Recycler</dt>
              <dd className="font-bold text-sm text-slate-900 dark:text-white truncate">{details.recyclerName || "—"}</dd>
              <dd className="font-mono text-slate-700 mt-1 truncate">{details.recyclerRegistrationId || "—"}</dd>
            </div>
          </dl>

          <div className="space-y-4">
            {readiness.blocked.length > 0 && (
              <ReadinessGroup tone="blocked" title="Blocked" items={readiness.blocked} />
            )}
            {readiness.attention.length > 0 && (
              <ReadinessGroup tone="attention" title="Needs attention" items={readiness.attention} />
            )}
            {readiness.ready.length > 0 && <ReadinessGroup tone="ready" title="Ready" items={readiness.ready} />}
          </div>

          {created && created.failed.length > 0 && (
            <div role="alert" className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-sm text-amber-950 space-y-2">
              <p className="font-bold">The batch exists, but these evidence records were not registered:</p>
              <ul className="list-disc pl-5 text-xs">
                {created.failed.map((f) => (
                  <li key={f.fileName}>
                    <span className="font-mono">{f.fileName}</span>: {f.message}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" variant="primary" onClick={handleSubmit} isLoading={isSubmitting} leftIcon={<RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}>
                  Retry evidence registration
                </Button>
                <Button size="sm" variant="outline" onClick={() => router.push(`/batches/${encodeURIComponent(created.id)}`)}>
                  Open the batch anyway
                </Button>
              </div>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-3 pt-4 border-t border-slate-100 dark:border-darkbg-border">
            <Button variant="outline" onClick={() => setStep(2)} disabled={isSubmitting} leftIcon={<ArrowLeft className="w-4 h-4" aria-hidden="true" />}>
              Back to evidence
            </Button>
            {!(created && created.failed.length > 0) && (
              <Button
                onClick={handleSubmit}
                disabled={!readiness.canSubmit || isSubmitting || !!created}
                leftIcon={isSubmitting ? <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" /> : <Sparkles className="w-4 h-4" aria-hidden="true" />}
              >
                {isSubmitting ? (storage ? submitStatus ?? "Creating batch…" : "Submitting and verifying…") : "Submit Batch and Run Verification"}
              </Button>
            )}
          </div>
          <p role="status" className="sr-only">
            {isSubmitting ? submitStatus ?? "Submitting the batch and running verification" : ""}
          </p>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={() => {
          if (removeTarget) {
            setItems((prev) => prev.filter((i) => i.localId !== removeTarget.localId));
            setRemoveTarget(null);
          }
        }}
        title="Remove this evidence file?"
        description={removeTarget ? `${removeTarget.fileName} and any quantity you entered for it will be removed from this submission.` : ""}
        confirmText="Remove file"
        variant="warning"
      />
    </div>
  );
}

function ReadinessGroup({
  tone,
  title,
  items,
}: {
  tone: "ready" | "attention" | "blocked";
  title: string;
  items: { text: string; why: string }[];
}) {
  const styles = {
    ready: "border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/20 text-emerald-950 dark:text-mint",
    attention: "border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 text-amber-950 dark:text-amber-100",
    blocked: "border-rose-300 bg-rose-50/60 dark:bg-rose-950/20 text-rose-950 dark:text-rose-100",
  }[tone];
  const Icon = tone === "ready" ? CheckCircle2 : tone === "attention" ? AlertTriangle : XCircle;
  return (
    <section aria-label={`${title} (${items.length})`} className={`rounded-2xl border p-4 space-y-2 ${styles}`}>
      <h3 className="text-sm font-bold flex items-center gap-1.5">
        <Icon className="w-4 h-4" aria-hidden="true" /> {title} ({items.length})
      </h3>
      <ul className="space-y-1.5 text-xs">
        {items.map((i) => (
          <li key={i.text}>
            <span className="font-semibold">{i.text}.</span> <span className="opacity-90">{i.why}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
