"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  FileText,
  CheckCircle2,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  Edit3,
  Layers,
  ArrowLeft,
  Eye,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  Sparkles,
  Info,
  X,
  Check,
  AlertCircle,
} from "lucide-react";
import { getBatchById, getStoredBatches, updateBatch } from "@/lib/store";
import { Batch, DocumentEvidence, ExtractedField, Finding } from "@/types";
import { Button } from "@/components/ui/Button";
import { SeverityBadge, StatusBadge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";

export default function EvidenceWorkspacePage() {
  const params = useParams();
  const id = params?.id as string;
  const { success, info: toastInfo } = useToast();

  const [batch, setBatch] = useState<Batch | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string>("");
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [mobileTab, setMobileTab] = useState<"document" | "fields">("document");

  // Manual Correction Modal State
  const [editModalField, setEditModalField] = useState<ExtractedField | null>(null);
  const [editNewValue, setEditNewValue] = useState<string>("");
  const [editAuditNote, setEditAuditNote] = useState<string>("");

  const fieldListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    // 1. Try finding by batch id
    let found = getBatchById(id);
    let targetDocId = "";

    // 2. If not found by batch ID, search all batches for matching document ID
    if (!found) {
      const allBatches = getStoredBatches();
      for (const b of allBatches) {
        const hasDoc = b.documents.find((d) => d.id === id);
        if (hasDoc) {
          found = b;
          targetDocId = id;
          break;
        }
      }
    }

    if (found) {
      setBatch(found);
      if (targetDocId) {
        setSelectedDocId(targetDocId);
      } else if (found.documents.length > 0) {
        setSelectedDocId(found.documents[0].id);
      }
    }
  }, [id]);

  if (!batch) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Evidence Dossier Not Found</h2>
        <p className="text-xs text-slate-500">
          No consignment or document matching &quot;{id}&quot; was found in the active store.
        </p>
        <Link href="/batches">
          <Button variant="outline">Back to Batch Directory</Button>
        </Link>
      </div>
    );
  }

  const currentDoc = batch.documents.find((d) => d.id === selectedDocId) || batch.documents[0];

  const handleOpenEdit = (field: ExtractedField) => {
    setEditModalField(field);
    setEditNewValue(String(field.value));
    setEditAuditNote("");
  };

  const handleSaveCorrection = () => {
    if (!editModalField || !currentDoc) return;

    const updatedDocs = batch.documents.map((doc) => {
      if (doc.id === currentDoc.id) {
        const updatedFields = doc.extractedFields.map((f) => {
          if (f.id === editModalField.id) {
            return {
              ...f,
              originalValue: f.originalValue !== undefined ? f.originalValue : f.value,
              value: isNaN(Number(editNewValue)) ? editNewValue : Number(editNewValue),
              isCorrected: true,
              correctedAt: new Date().toISOString(),
              auditorNotes: editAuditNote || "Manual compliance verification confirmed.",
              confidence: 1.0, // Human audited
            };
          }
          return f;
        });
        return { ...doc, extractedFields: updatedFields };
      }
      return doc;
    });

    const newTimelineEvent = {
      id: `t-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: "Compliance Auditor",
      action: "Document Field Manually Corrected",
      note: `Field '${editModalField.label}' changed from '${editModalField.value}' to '${editNewValue}'. Auditor Note: ${editAuditNote || "Manual verification confirmed."}`,
    };

    updateBatch(batch.id, {
      documents: updatedDocs,
      timeline: [...batch.timeline, newTimelineEvent],
    });

    setBatch(getBatchById(batch.id) || null);
    success("Audit Correction Saved", `Field '${editModalField.label}' updated.`);
    setEditModalField(null);
  };

  const selectFieldWithScroll = (fieldId: string) => {
    setSelectedFieldId(fieldId);
    if (mobileTab === "document") {
      setMobileTab("fields");
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6">
      {/* Top Header & Breadcrumb */}
      <div>
        <Link
          href={`/batches/${batch.id}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-800 dark:hover:text-white mb-2 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Batch {batch.batchNumber}
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-darkbg-border">
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Evidence Review & Inspection Workspace
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-text-dark-secondary mt-0.5">
              Inspect OCR-extracted bounding-box geometry, field confidence metrics, and audited corrections for batch <span className="font-mono font-bold text-slate-900 dark:text-white">{batch.batchNumber}</span>.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-3 py-1 rounded-full bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 font-bold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-violet-500" /> Amazon Textract Engine
            </span>
          </div>
        </div>
      </div>

      {/* Document Selector Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1" role="tablist">
        {batch.documents.map((doc) => (
          <button
            key={doc.id}
            role="tab"
            aria-selected={doc.id === selectedDocId}
            onClick={() => {
              setSelectedDocId(doc.id);
              setSelectedFieldId(null);
            }}
            className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2 ${
              doc.id === selectedDocId
                ? "bg-emerald-600 text-white shadow-card"
                : "bg-white dark:bg-darkbg-card border border-slate-200/80 dark:border-darkbg-border text-slate-700 dark:text-text-dark-secondary hover:border-emerald-500"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{doc.title}</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-black/20 text-white/90">
              {doc.extractedFields.length}
            </span>
          </button>
        ))}
      </div>

      {/* Mobile Tab Switcher (< 1024px) */}
      <div className="lg:hidden flex border border-slate-200 dark:border-darkbg-border rounded-xl p-1 bg-slate-50 dark:bg-darkbg-card">
        <button
          type="button"
          onClick={() => setMobileTab("document")}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${
            mobileTab === "document"
              ? "bg-emerald-600 text-white shadow-xs"
              : "text-slate-600 dark:text-text-dark-secondary hover:text-slate-900"
          }`}
        >
          Document Preview
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("fields")}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${
            mobileTab === "fields"
              ? "bg-emerald-600 text-white shadow-xs"
              : "text-slate-600 dark:text-text-dark-secondary hover:text-slate-900"
          }`}
        >
          Field Inspector & Findings ({currentDoc?.extractedFields.length || 0})
        </button>
      </div>

      {/* Main Workspace: Left = Document Canvas, Right = Extracted Fields */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Document Canvas (with interactive bounding boxes) */}
        <div className={`lg:col-span-7 ${mobileTab === "fields" ? "hidden lg:block" : "block"}`}>
          <div className="rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card shadow-card flex flex-col h-full overflow-hidden">
            <div className="p-3.5 border-b border-slate-200/80 dark:border-darkbg-border flex items-center justify-between text-xs">
              <span className="font-mono font-bold text-slate-700 dark:text-text-dark-primary">
                {currentDoc?.fileName}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setZoomLevel((z) => Math.max(70, z - 10))}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-darkbg-border hover:bg-slate-100 dark:hover:bg-darkbg-hover transition-colors"
                  title="Zoom Out"
                  aria-label="Zoom out document"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-[11px] text-slate-400">{zoomLevel}%</span>
                <button
                  onClick={() => setZoomLevel((z) => Math.min(140, z + 10))}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-darkbg-border hover:bg-slate-100 dark:hover:bg-darkbg-hover transition-colors"
                  title="Zoom In"
                  aria-label="Zoom in document"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Document Canvas Area */}
            <div className="p-6 flex-1 bg-slate-100 dark:bg-darkbg flex flex-col items-center justify-center overflow-auto min-h-[460px]">
              <div
                style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: "top center" }}
                className="w-full max-w-lg aspect-[1/1.3] bg-white text-slate-900 rounded-2xl shadow-xl p-8 relative border border-slate-300 font-sans select-none transition-transform"
              >
                {/* Header of document */}
                <div className="border-b-2 border-slate-900 pb-3 mb-6 flex justify-between items-start">
                  <div>
                    <h2 className="font-black text-sm uppercase tracking-wider text-slate-900">
                      {currentDoc?.title}
                    </h2>
                    <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                      REF: {currentDoc?.fileName}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 border border-emerald-300 rounded">
                      CERTIFIED ATTACHMENT
                    </span>
                  </div>
                </div>

                {/* Content Lines */}
                <div className="space-y-4 text-[11px] text-slate-700">
                  <div className="flex justify-between">
                    <span>Carrier / Operator:</span>
                    <span className="font-semibold">{batch.recyclerName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Facility License:</span>
                    <span className="font-mono">{batch.recyclerRegistrationId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Batch Number:</span>
                    <span className="font-mono font-bold">{batch.batchNumber}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 mt-4 space-y-1">
                    <div className="flex justify-between font-bold text-[11px]">
                      <span>Gross Declared Mass:</span>
                      <span>{batch.claimedQuantity.toLocaleString()} kg</span>
                    </div>
                    <div className="flex justify-between text-slate-600 text-[10px]">
                      <span>Recorded Scale Measurement:</span>
                      <span>{batch.massBalance.receivedKg.toLocaleString()} kg</span>
                    </div>
                    <div className="flex justify-between text-emerald-800 font-bold border-t border-slate-200 pt-1 text-[11px]">
                      <span>Reconciled Mass Balance:</span>
                      <span>{batch.massBalance.evidenceSupportedKg.toLocaleString()} kg</span>
                    </div>
                  </div>
                </div>

                {/* Text Snippet from Document */}
                {currentDoc?.extractedTextSnippet && (
                  <div className="mt-8 p-3 rounded-xl bg-amber-50/70 border border-amber-200 text-[10px] text-amber-900 font-mono leading-relaxed">
                    &quot;{currentDoc.extractedTextSnippet}&quot;
                  </div>
                )}

                {/* Bounding Box Highlights Overlaid */}
                {currentDoc?.extractedFields.map((field) => {
                  const isSelected = selectedFieldId === field.id;
                  const box = field.boundingBox || { top: 30, left: 20, width: 35, height: 8 };

                  return (
                    <div
                      key={field.id}
                      onClick={() => selectFieldWithScroll(field.id)}
                      style={{
                        top: `${box.top}%`,
                        left: `${box.left}%`,
                        width: `${box.width}%`,
                        height: `${box.height}%`,
                      }}
                      className={`absolute rounded cursor-pointer transition-all ${
                        isSelected
                          ? "ring-2 ring-emerald-600 bg-emerald-500/35 border-2 border-emerald-700 shadow-lg"
                          : field.isDiscrepant
                          ? "border border-rose-500 bg-rose-500/20 hover:bg-rose-500/30"
                          : "border border-emerald-500/60 bg-emerald-500/15 hover:bg-emerald-500/25"
                      }`}
                      title={`${field.label}: ${field.value} (${Math.round(field.confidence * 100)}% confidence)`}
                    >
                      <span className="absolute -top-3.5 left-0 text-[8px] font-bold font-mono px-1 rounded bg-slate-900 text-white truncate max-w-[120px]">
                        {field.fieldName}
                      </span>
                    </div>
                  );
                })}
              </div>

              <p className="text-[10px] text-slate-400 mt-4 text-center italic">
                Demonstration Document Preview &bull; Spatial bounding coordinates simulated from Textract extraction geometry.
              </p>
            </div>
          </div>
        </div>

        {/* Right Pane: Extracted Fields & Audit Corrections */}
        <div className={`lg:col-span-5 space-y-5 ${mobileTab === "document" ? "hidden lg:block" : "block"}`}>
          {/* Extracted Fields Section */}
          <div className="rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-6 shadow-card space-y-4">
            <div className="pb-3 border-b border-slate-100 dark:border-darkbg-border">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Extracted Fields ({currentDoc?.extractedFields.length || 0})
              </h2>
              <p className="text-xs text-slate-400 dark:text-text-dark-muted mt-0.5">
                Click any field to highlight its bounding-box coordinates on the document canvas.
              </p>
            </div>

            <div ref={fieldListRef} className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
              {currentDoc?.extractedFields.map((field) => {
                const isSelected = selectedFieldId === field.id;

                return (
                  <div
                    key={field.id}
                    onClick={() => setSelectedFieldId(field.id)}
                    className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                      isSelected
                        ? "border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/60 shadow-xs"
                        : field.isDiscrepant
                        ? "border-rose-300 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20"
                        : "border-slate-200 dark:border-darkbg-border bg-slate-50/70 dark:bg-darkbg-hover/60 hover:border-emerald-400"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-text-dark-muted">
                        {field.label}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-mint font-bold">
                          {Math.round(field.confidence * 100)}% conf
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEdit(field);
                          }}
                          className="p-1 text-slate-400 hover:text-emerald-600 rounded transition-colors"
                          title="Manual audit correction"
                          aria-label={`Edit ${field.label}`}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-1 flex items-baseline justify-between">
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        {field.value} {field.unit && <span className="text-slate-400 font-normal">{field.unit}</span>}
                      </div>

                      {field.isCorrected && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300 font-bold">
                          Audited Correction
                        </span>
                      )}
                    </div>

                    {field.isCorrected && field.originalValue !== undefined && (
                      <div className="mt-1 text-[10px] text-slate-400 font-mono">
                        Original Extracted: {field.originalValue} {field.unit}
                      </div>
                    )}

                    {field.boundingBox ? (
                      <div className="mt-2 text-[10px] font-mono text-slate-400 flex items-center justify-between">
                        <span>Geometry: Page {field.pageNumber}</span>
                        <span>[x:{field.boundingBox.left}%, y:{field.boundingBox.top}%]</span>
                      </div>
                    ) : (
                      <div className="mt-2 text-[10px] text-slate-400 italic">
                        Spatial bounding coordinates not recorded
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-darkbg-border text-[11px] text-slate-400 dark:text-text-dark-muted flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
              <span>
                Note: OCR confidence reflects optical character clarity, not legal authenticity or physical recycling.
              </span>
            </div>
          </div>

          {/* Related Batch Findings */}
          <div className="rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-6 shadow-card space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-text-dark-primary flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-500" /> Related Findings Context ({batch.findings.length})
            </h3>
            <div className="space-y-2">
              {batch.findings.map((f) => (
                <div
                  key={f.id}
                  className="p-3 rounded-2xl border border-slate-200/80 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg-hover/60 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 dark:text-white">{f.title}</span>
                    <SeverityBadge severity={f.severity} />
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-text-dark-secondary">{f.description}</p>
                  {f.difference && (
                    <div className="text-[11px] font-mono font-bold text-amber-700 dark:text-amber-300">
                      Delta: {f.difference}
                    </div>
                  )}
                  <div className="pt-1 text-[10px] text-slate-400 flex items-center justify-between">
                    <span>Rule: {f.ruleName}</span>
                    <span className="font-bold text-emerald-600 dark:text-mint">{f.recommendedAction}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Manual Audit Correction Modal */}
      {editModalField && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-darkbg-border">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Audited Value Correction
                </h3>
                <p className="text-xs text-slate-500 dark:text-text-dark-muted mt-0.5">
                  Field: <strong className="font-mono text-slate-800 dark:text-white">{editModalField.label}</strong>
                </p>
              </div>
              <button
                onClick={() => setEditModalField(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Original Extracted Value
                </label>
                <div className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-darkbg-hover font-mono text-slate-700 dark:text-slate-300">
                  {editModalField.originalValue !== undefined ? editModalField.originalValue : editModalField.value}{" "}
                  {editModalField.unit}
                </div>
              </div>

              <div>
                <label htmlFor="correctedVal" className="block text-[11px] font-bold text-slate-700 dark:text-text-dark-primary uppercase tracking-wider mb-1">
                  Corrected Audited Value *
                </label>
                <input
                  id="correctedVal"
                  type="text"
                  value={editNewValue}
                  onChange={(e) => setEditNewValue(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs font-mono font-bold rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg-hover text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label htmlFor="auditReason" className="block text-[11px] font-bold text-slate-700 dark:text-text-dark-primary uppercase tracking-wider mb-1">
                  Auditor Justification Reason *
                </label>
                <textarea
                  id="auditReason"
                  rows={3}
                  value={editAuditNote}
                  onChange={(e) => setEditAuditNote(e.target.value)}
                  placeholder="e.g. Verified against stamped physical weighbridge ticket slip #4410..."
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg-hover text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-darkbg-border">
              <Button size="sm" variant="outline" onClick={() => setEditModalField(null)}>
                Cancel
              </Button>
              <Button size="sm" variant="primary" onClick={handleSaveCorrection}>
                Save Audit Correction
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
