"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouteId } from "@/lib/route";
import Link from "next/link";
import { ArrowLeft, Edit3, FileText, Info, ZoomIn, ZoomOut } from "lucide-react";
import type { Batch, DocumentEvidence, ExtractedField, ExtractionSource, Finding } from "@/types";
import { correctField, errorMessage, fetchEvidenceContentUrl, fetchEvidenceContext, getExecutionMode, getOperatorLabel } from "@/lib/api-client";
import { useAsync, useExecutionMode } from "@/lib/hooks";
import {
  DOCUMENT_TYPE_LABELS,
  LIFECYCLE_STAGE_LABELS,
  VERIFICATION_STATUS_META,
  findingAnchor,
  formatNumber,
  formatTimestamp,
} from "@/lib/domain";
import { SeverityBadge, SimulatedBadge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ErrorPanel, ModeNotice, NotFoundPanel } from "@/components/ui/Feedback";
import { CardSkeleton } from "@/components/ui/LoadingSkeleton";
import { useToast } from "@/components/ui/Toast";
import { useCrumbs } from "@/components/ui/Breadcrumbs";

const SOURCE_LABEL: Record<ExtractionSource, string> = {
  simulated_ocr: "Simulated OCR (demo extraction provider)",
  textract: "Amazon Textract",
  rekognition: "Amazon Rekognition OCR",
  nova_vision: "Amazon Nova (AI-read, not OCR)",
  manual_entry: "Manual entry (no OCR)",
  seed_demo: "Built-in demo dataset",
  unspecified: "Unspecified source",
};

function geometryIsSimulated(source: ExtractionSource): boolean {
  return source === "simulated_ocr" || source === "seed_demo";
}

function validBox(f: ExtractedField): boolean {
  const b = f.boundingBox;
  return !!b && [b.top, b.left, b.width, b.height].every((n) => Number.isFinite(n)) && b.width > 0 && b.height > 0 && b.top >= 0 && b.left >= 0 && b.top + b.height <= 100.5 && b.left + b.width <= 100.5;
}

function validField(f: ExtractedField | undefined): f is ExtractedField {
  return !!f && typeof f.id === "string" && f.label !== undefined && f.value !== undefined && Number.isFinite(f.confidence);
}

export default function EvidenceWorkspacePage() {
  const id = useRouteId("evidence");
  const search = useSearchParams();
  const mode = useExecutionMode();
  const { success, warning, error: toastError } = useToast();
  const { data, error, status, loading, reload } = useAsync(() => fetchEvidenceContext(id), [id]);

  const [override, setOverride] = useState<Batch | null>(null);
  const batch = override && data && override.id === data.batch.id ? override : data?.batch ?? null;
  useEffect(() => setOverride(null), [data]);

  const [selectedDocId, setSelectedDocId] = useState<string>("");
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(search.get("field"));
  const [zoom, setZoom] = useState(100);
  const [tab, setTab] = useState<"document" | "fields">("document");
  const [editField, setEditField] = useState<ExtractedField | null>(null);
  const [newValue, setNewValue] = useState("");
  const [reason, setReason] = useState("");
  const [valueError, setValueError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fieldRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const uid = useId();
  const [contentUrl, setContentUrl] = useState<string | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);

  // Initial selection: the document from the URL, or the first document of the batch.
  useEffect(() => {
    if (!batch) return;
    setSelectedDocId((cur) => (cur && batch.documents.some((d) => d.id === cur) ? cur : data?.documentId && batch.documents.some((d) => d.id === data.documentId) ? data.documentId : batch.documents[0]?.id ?? ""));
  }, [batch, data?.documentId]);

  // Deep link to a field (?field=): switch to its document.
  const deepField = search.get("field");
  useEffect(() => {
    if (!batch || !deepField) return;
    const owner = batch.documents.find((d) => d.extractedFields.some((f) => f.id === deepField));
    if (owner) {
      setSelectedDocId(owner.id);
      setSelectedFieldId(deepField);
    }
  }, [batch, deepField]);

  const doc: DocumentEvidence | undefined = batch?.documents.find((d) => d.id === selectedDocId) ?? batch?.documents[0];
  const storageKey = doc?.storageKey;
  const docId = doc?.id;
  useEffect(() => {
    setContentUrl(null);
    setContentError(null);
    if (!storageKey || !docId || getExecutionMode() !== "live") return;
    let live = true;
    fetchEvidenceContentUrl(docId)
      .then((u) => live && setContentUrl(u))
      .catch((e: unknown) => live && setContentError(errorMessage(e)));
    return () => {
      live = false;
    };
  }, [storageKey, docId]);
  const isImage = !!doc && /\.(png|jpe?g)$/i.test(doc.fileName);
  const fields = useMemo(() => (doc?.extractedFields ?? []).filter(validField), [doc]);
  const selectedField = fields.find((f) => f.id === selectedFieldId) ?? null;

  useCrumbs(
    batch
      ? [
          { label: "Batches", href: "/batches" },
          { label: batch.batchNumber, href: `/batches/${encodeURIComponent(batch.id)}` },
          { label: "Evidence", href: "/evidence" },
          ...(doc ? [{ label: doc.fileName }] : []),
        ]
      : null
  );

  const docFindings: Finding[] = useMemo(() => {
    if (!batch || !doc) return [];
    return batch.findings.filter((f) => f.sourceDocumentId === doc.id);
  }, [batch, doc]);
  const otherFindings = useMemo(() => (batch ? batch.findings.filter((f) => !docFindings.includes(f)) : []), [batch, docFindings]);
  const fieldFindings = selectedField ? docFindings.filter((f) => f.sourceFieldId === selectedField.id) : [];

  const selectFromCanvas = (fieldId: string) => {
    setSelectedFieldId(fieldId);
    setTab("fields");
    // Move keyboard/AT focus to the matching card once the panel is visible.
    requestAnimationFrame(() => fieldRefs.current[fieldId]?.focus());
  };

  const openEdit = (f: ExtractedField) => {
    setEditField(f);
    setNewValue(String(f.value));
    setReason("");
    setValueError(null);
  };

  const saveCorrection = async () => {
    if (!batch || !doc || !editField || saving) return;
    const trimmed = newValue.trim();
    if (trimmed === "") {
      setValueError("Enter the corrected value.");
      return;
    }
    const numericField = typeof editField.value === "number";
    const parsed: string | number = numericField ? Number(trimmed) : trimmed;
    if (numericField && !Number.isFinite(parsed as number)) {
      setValueError("This field is numeric; enter a valid number.");
      return;
    }
    if (parsed === editField.value) {
      setValueError("The corrected value is the same as the current value.");
      return;
    }
    if (!reason.trim()) return;
    setSaving(true);
    try {
      const before = batch.status;
      const updated = await correctField(batch.id, doc.id, editField.id, parsed, reason.trim());
      setOverride(updated);
      setEditField(null);
      const changed = before !== updated.status;
      (changed ? warning : success)(
        "Correction saved. Verification re-run",
        `${editField.label} is now ${String(parsed)}. Status: ${VERIFICATION_STATUS_META[updated.status].label}${changed ? ` (was ${VERIFICATION_STATUS_META[before].label})` : ""}.${
          updated.passport ? " An existing passport was not re-issued." : ""
        }`
      );
    } catch (err) {
      toastError("Correction was not saved", `${errorMessage(err)} The extracted value is unchanged.`);
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }
  if (error || !batch) {
    if (status === 404)
      return (
        <NotFoundPanel
          title="Evidence not found"
          message={`No batch or evidence document matches "${id}" in ${mode === "live" ? "the verification backend" : "the Demo Mode dataset"}.`}
          backHref="/evidence"
          backLabel="Back to evidence"
        />
      );
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <ErrorPanel title="Could not load evidence" message={error ?? "Unknown error"} onRetry={reload} mode={mode} />
      </div>
    );
  }

  const boxLayer = (
    <>
                      {fields.filter(validBoxField).map((f) => {
                        const b = f.boundingBox!;
                        const selected = selectedFieldId === f.id;
                        return (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => selectFromCanvas(f.id)}
                            aria-pressed={selected}
                            aria-label={`Region for ${f.label}: ${String(f.value)}${f.unit ? ` ${f.unit}` : ""}${f.isDiscrepant ? ", flagged discrepant" : ""}`}
                            style={{ top: `${b.top}%`, left: `${b.left}%`, width: `${b.width}%`, height: `${b.height}%` }}
                            className={`absolute rounded border-2 text-left overflow-hidden ${
                              selected
                                ? "border-emerald-700 bg-emerald-500/35 ring-2 ring-emerald-600"
                                : f.isDiscrepant
                                ? "border-rose-600 border-dashed bg-rose-500/15 hover:bg-rose-500/25"
                                : "border-emerald-600/70 bg-emerald-500/10 hover:bg-emerald-500/25"
                            }`}
                          >
                            <span className="absolute -top-0 left-0 text-[8px] font-bold font-mono px-1 bg-slate-900 text-white truncate max-w-full">{f.fieldName}</span>
                          </button>
                        );
                      })}
    </>
  );

  const authenticityNote = "No document-authenticity check is configured, so none is shown. Extraction confidence is not proof of authenticity.";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6">
      <div className="space-y-2 pb-4 border-b border-slate-200/80 dark:border-darkbg-border">
        <Link href={`/batches/${encodeURIComponent(batch.id)}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-950 dark:text-text-dark-secondary dark:hover:text-white">
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> Back to batch {batch.batchNumber}
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Evidence Review</h1>
            <p className="text-sm text-slate-700 dark:text-text-dark-secondary">
              Extracted fields and findings for <span className="font-mono font-bold">{batch.batchNumber}</span>.
            </p>
            <ModeNotice mode={mode} />
          </div>
          <StatusBadge status={batch.status} />
        </div>
      </div>

      {batch.documents.length === 0 || !doc ? (
        <div className="p-8 rounded-3xl border border-dashed border-slate-300 text-center text-sm text-slate-700">
          No evidence documents are attached to this batch. Findings:{" "}
          {batch.findings.length === 0 ? "none." : batch.findings.map((f) => f.title).join("; ")}
        </div>
      ) : (
        <>
          <div role="tablist" aria-label="Evidence documents" className="flex items-center gap-2 overflow-x-auto pb-1">
            {batch.documents.map((d) => (
              <button
                key={d.id}
                role="tab"
                id={`${uid}-doctab-${d.id}`}
                aria-selected={d.id === doc.id}
                onClick={() => {
                  setSelectedDocId(d.id);
                  setSelectedFieldId(null);
                }}
                className={`px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap flex items-center gap-2 border ${
                  d.id === doc.id
                    ? "bg-emerald-700 text-white border-emerald-700"
                    : "bg-white dark:bg-darkbg-card border-slate-300 dark:border-darkbg-border text-slate-800 dark:text-text-dark-secondary hover:border-emerald-600"
                }`}
              >
                <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{d.title}</span>
                <span className="text-[10px] px-1.5 rounded-md bg-black/15">{d.extractedFields.length}</span>
              </button>
            ))}
          </div>

          {/* Mobile switcher */}
          <div role="group" aria-label="Workspace panel" className="lg:hidden flex border border-slate-300 dark:border-darkbg-border rounded-xl p-1 bg-slate-50 dark:bg-darkbg-card">
            {(
              [
                ["document", "Document Preview"],
                ["fields", `Field Inspector & Findings (${fields.length})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={tab === key}
                onClick={() => setTab(key)}
                className={`flex-1 py-2 text-xs font-bold rounded-lg ${tab === key ? "bg-emerald-700 text-white" : "text-slate-800 dark:text-text-dark-secondary"}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Document preview */}
            <section aria-label="Document preview" className={`lg:col-span-7 min-w-0 ${tab === "fields" ? "hidden lg:block" : "block"}`}>
              <div className="rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card shadow-card overflow-hidden">
                <div className="p-3.5 border-b border-slate-200/80 dark:border-darkbg-border flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-mono font-bold text-slate-900 dark:text-text-dark-primary break-all">{doc.fileName}</span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setZoom((z) => Math.max(70, z - 10))} disabled={zoom <= 70} className="p-1.5 rounded-lg border border-slate-300 dark:border-darkbg-border hover:bg-slate-100 dark:hover:bg-darkbg-hover disabled:opacity-40" aria-label="Zoom out preview">
                      <ZoomOut className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <span className="font-mono text-[11px] text-slate-700 w-10 text-center" aria-live="polite">{zoom}%</span>
                    <button type="button" onClick={() => setZoom((z) => Math.min(140, z + 10))} disabled={zoom >= 140} className="p-1.5 rounded-lg border border-slate-300 dark:border-darkbg-border hover:bg-slate-100 dark:hover:bg-darkbg-hover disabled:opacity-40" aria-label="Zoom in preview">
                      <ZoomIn className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="p-4 sm:p-6 bg-slate-100 dark:bg-darkbg overflow-auto max-h-[70vh]">
                  <div style={{ width: `${zoom}%`, minWidth: "16rem" }} className="mx-auto">
                    {contentUrl && isImage ? (
                      <div className="relative w-full bg-white rounded-xl shadow-lg border border-slate-300 overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={contentUrl} alt={`Uploaded document ${doc.fileName}`} className="block w-full h-auto" />
                        {boxLayer}
                      </div>
                    ) : contentUrl ? (
                      <iframe src={contentUrl} title={`Uploaded document ${doc.fileName}`} className="w-full h-[60vh] bg-white rounded-xl border border-slate-300" />
                    ) : (
                    <div className="relative w-full aspect-[1/1.3] bg-white text-slate-900 rounded-xl shadow-lg p-5 border border-slate-300">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-700">{doc.title}</p>
                      <p className="text-[10px] font-mono text-slate-600 mt-0.5">
                        {DOCUMENT_TYPE_LABELS[doc.documentType]} · page 1
                      </p>
                      {doc.extractedTextSnippet && (
                        <p className="mt-4 p-2 rounded bg-amber-50 border border-amber-200 text-[10px] font-mono text-amber-950 leading-relaxed">
                          <span className="block font-sans font-bold mb-0.5">Extracted text</span>
                          {doc.extractedTextSnippet}
                        </p>
                      )}
                      {boxLayer}
                    </div>
                    )}
                  </div>
                </div>

                <div className="p-3.5 border-t border-slate-200/80 dark:border-darkbg-border text-xs text-slate-800 dark:text-text-dark-secondary space-y-1.5">
                  <p className="flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>
                      {contentUrl ? (
                        <>
                          This is the <strong>original uploaded file</strong> from private storage (link expires in 10 minutes).
                          {!isImage && " Region overlay is available for image evidence; PDFs open in the browser viewer."}
                        </>
                      ) : storageKey && !contentError ? (
                        "Loading the stored document…"
                      ) : (
                        <>
                          This is a <strong>reconstruction from extracted data</strong>, not the original document: no uploaded file is stored for it.
                        </>
                      )}
                      {contentError ? ` The stored file could not be loaded: ${contentError}` : ""}
                    </span>
                  </p>
                  {fields.some((f) => validBoxField(f) && (f.extractionSource === "textract" || f.extractionSource === "rekognition")) && (
                    <p className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-900 border border-emerald-300">Real OCR regions</span>
                      <span>Region positions come from the OCR service geometry (Amazon Textract / Rekognition).</span>
                    </p>
                  )}
                  {fields.some((f) => validBoxField(f) && geometryIsSimulated(f.extractionSource)) && (
                    <p className="flex items-center gap-1.5">
                      <SimulatedBadge label="Simulated regions" tooltip="Region positions come from the demo dataset/provider, not from real OCR geometry." />
                      <span>Region positions are simulated and do not point at real text.</span>
                    </p>
                  )}
                  {fields.some((f) => !validBoxField(f)) && <p>Fields without a valid region are listed in the inspector and cannot be highlighted here.</p>}
                </div>
              </div>
            </section>

            {/* Inspector */}
            <section aria-label="Field inspector and findings" className={`lg:col-span-5 min-w-0 space-y-5 ${tab === "document" ? "hidden lg:block" : "block"}`}>
              <div className="rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-4 sm:p-6 shadow-card space-y-4">
                <div className="pb-3 border-b border-slate-100 dark:border-darkbg-border">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">Extracted fields ({fields.length})</h2>
                  <p className="text-xs text-slate-700 dark:text-text-dark-muted mt-0.5">Select a field to highlight its region on the preview.</p>
                </div>

                {fields.length === 0 ? (
                  <p className="text-sm text-slate-700">No usable extracted fields on this document.</p>
                ) : (
                  <ul className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
                    {fields.map((f) => {
                      const selected = selectedFieldId === f.id;
                      return (
                        <li key={f.id}>
                          <div
                            className={`rounded-2xl border p-3.5 ${
                              selected
                                ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/50"
                                : f.isDiscrepant
                                ? "border-rose-300 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20"
                                : "border-slate-200 dark:border-darkbg-border bg-slate-50/70 dark:bg-darkbg-hover/60"
                            }`}
                          >
                            <button
                              type="button"
                              ref={(el) => {
                                fieldRefs.current[f.id] = el;
                              }}
                              aria-pressed={selected}
                              onClick={() => setSelectedFieldId(selected ? null : f.id)}
                              className="w-full text-left rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                            >
                              <span className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-text-dark-muted">{f.label}</span>
                                {f.isDiscrepant && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-900 border border-rose-300">Flagged discrepant</span>}
                              </span>
                              <span className="mt-1 block text-sm font-bold text-slate-900 dark:text-white break-words">
                                {typeof f.value === "number" ? formatNumber(f.value) : String(f.value)}{" "}
                                {f.unit && <span className="text-slate-600 font-normal">{f.unit}</span>}
                              </span>
                            </button>

                            <p className="mt-1.5 text-[11px] text-slate-700 dark:text-text-dark-secondary">
                              {f.extractionSource === "manual_entry" ? (
                                "Manual entry: no OCR confidence."
                              ) : f.extractionSource === "nova_vision" ? (
                                <strong>AI-read value: no OCR confidence or region exists. Confirm it against the document or correct it.</strong>
                              ) : (
                                <>
                                  OCR extraction confidence <strong>{Math.round(f.confidence * 100)}%</strong> (how clearly text was read).
                                </>
                              )}{" "}
                              Source: {SOURCE_LABEL[f.extractionSource]}.
                            </p>
                            {f.isCorrected && (
                              <div className="mt-2 p-2 rounded-lg bg-violet-50 dark:bg-violet-950/40 border border-violet-300 dark:border-violet-800 text-[11px] text-violet-950 dark:text-violet-100 space-y-0.5">
                                <p className="font-bold">Audited correction</p>
                                <p>Original extracted value: <span className="font-mono">{String(f.originalValue)}</span></p>
                                <p>Reason: {f.correctionReason ?? "not recorded"}</p>
                                <p>By unverified label “{f.correctedBy ?? "unknown"}” on {formatTimestamp(f.correctedAt)}</p>
                              </div>
                            )}
                            <p className="mt-1.5 text-[10px] font-mono text-slate-600">
                              {validBoxField(f) ? `Region: x ${f.boundingBox!.left}%, y ${f.boundingBox!.top}%${geometryIsSimulated(f.extractionSource) ? " (simulated)" : ""}` : "No region recorded for this field."}
                            </p>
                            <div className="mt-2">
                              <button
                                type="button"
                                onClick={() => openEdit(f)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-800 dark:text-mint border border-slate-300 dark:border-darkbg-border hover:bg-slate-100 dark:hover:bg-darkbg-hover"
                              >
                                <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                                Correct value<span className="sr-only"> for {f.label}</span>
                              </button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className="pt-2 border-t border-slate-100 dark:border-darkbg-border text-[11px] text-slate-700 dark:text-text-dark-muted flex items-start gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>
                    OCR confidence reflects how confidently text was extracted. It is not legal authenticity or proof that recycling occurred. {authenticityNote}
                  </span>
                </p>
              </div>

              <div className="rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-4 sm:p-6 shadow-card space-y-3">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  {selectedField ? `Findings for “${selectedField.label}”` : `Findings on this document (${docFindings.length})`}
                </h2>
                {(selectedField ? fieldFindings : docFindings).length === 0 && (
                  <p className="text-xs text-slate-700">
                    {selectedField ? "No finding points at this specific field." : "No finding points at this document."}
                  </p>
                )}
                <ul className="space-y-2">
                  {(selectedField ? fieldFindings : docFindings).map((f) => (
                    <FindingRow key={f.id} f={f} batchId={batch.id} />
                  ))}
                </ul>
                {otherFindings.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer font-semibold text-emerald-800 dark:text-mint">Other batch findings ({otherFindings.length})</summary>
                    <ul className="space-y-2 mt-2">
                      {otherFindings.map((f) => (
                        <FindingRow key={f.id} f={f} batchId={batch.id} />
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </section>
          </div>
        </>
      )}

      <ConfirmDialog
        isOpen={!!editField}
        onClose={() => setEditField(null)}
        onConfirm={saveCorrection}
        title="Correct extracted value"
        description={`${mode === "live" ? "Recorded by the backend with an unverified operator label (the API has no authentication)." : "Demo Mode: stored in this browser only; not an authoritative audit record."} The original value is kept, the field is marked corrected, and verification is re-run.`}
        confirmText="Save correction and re-verify"
        variant="primary"
        isLoading={saving}
        confirmDisabled={!reason.trim() || !newValue.trim()}
      >
        {editField && (
          <div className="space-y-3 text-xs">
            <p>
              Field <strong>{editField.label}</strong>. Current value <span className="font-mono">{String(editField.value)}</span>
              {editField.isCorrected ? `, originally ${String(editField.originalValue)}` : ""}. Operator label: <span className="font-mono">{getOperatorLabel()}</span>.
            </p>
            <div>
              <label htmlFor={`${uid}-new`} className="block text-[11px] font-bold uppercase tracking-wider text-slate-800 mb-1">Corrected value (required)</label>
              <input
                id={`${uid}-new`}
                data-autofocus
                type="text"
                value={newValue}
                onChange={(e) => {
                  setNewValue(e.target.value);
                  setValueError(null);
                }}
                aria-invalid={valueError ? true : undefined}
                aria-describedby={valueError ? `${uid}-new-err` : undefined}
                className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-slate-300 bg-slate-50 dark:bg-darkbg-hover dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              {valueError && (
                <p id={`${uid}-new-err`} role="alert" className="text-rose-700 mt-1">{valueError}</p>
              )}
            </div>
            <div>
              <label htmlFor={`${uid}-reason`} className="block text-[11px] font-bold uppercase tracking-wider text-slate-800 mb-1">Reason for correction (required)</label>
              <textarea
                id={`${uid}-reason`}
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-slate-50 dark:bg-darkbg-hover dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}

function validBoxField(f: ExtractedField): boolean {
  return validBox(f);
}

function FindingRow({ f, batchId }: { f: Finding; batchId: string }) {
  return (
    <li className="p-3 rounded-2xl border border-slate-200/80 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg-hover/60 text-xs space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold text-slate-900 dark:text-white">{f.title}</span>
        <SeverityBadge severity={f.severity} />
      </div>
      <p className="text-slate-800 dark:text-text-dark-secondary">{f.description}</p>
      <dl className="grid grid-cols-3 gap-2 text-[11px]">
        <div><dt className="text-slate-600">Observed</dt><dd className="font-mono font-bold">{f.observedValue ?? "—"}</dd></div>
        <div><dt className="text-slate-600">Expected</dt><dd className="font-mono font-bold">{f.expectedValue ?? "—"}</dd></div>
        <div><dt className="text-slate-600">Difference</dt><dd className="font-mono font-bold">{f.difference ?? "—"}</dd></div>
      </dl>
      <p className="text-[11px] text-slate-700">
        Rule {f.ruleId}
        {f.lifecycleStage ? ` · ${LIFECYCLE_STAGE_LABELS[f.lifecycleStage] ?? f.lifecycleStage}` : ""}
      </p>
      <p className="text-[11px] font-semibold text-amber-950 dark:text-amber-200">Next action: {f.recommendedAction}</p>
      <Link href={`/batches/${encodeURIComponent(batchId)}#${findingAnchor(f.id)}`} className="inline-block text-[11px] font-bold text-emerald-800 dark:text-mint hover:underline">
        Open full finding on batch
      </Link>
    </li>
  );
}
