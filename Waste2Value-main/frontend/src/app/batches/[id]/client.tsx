"use client";

import React, { useEffect, useId, useState } from "react";
import { useRouteId } from "@/lib/route";
import Link from "next/link";
import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  Clock,
  Coins,
  FileText,
  History,
  RefreshCw,
  Scale,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import type { Batch, Finding, VerificationStatus } from "@/types";
import { errorMessage, fetchBatch, issuePassport, recordDecision, verifyBatch } from "@/lib/api-client";
import { useAsync, useExecutionMode } from "@/lib/hooks";
import {
  DOCUMENT_TYPE_LABELS,
  LIFECYCLE_STAGE_LABELS,
  VERIFICATION_STATUS_META,
  evidenceHref,
  findingAnchor,
  formatDate,
  formatKg,
  formatMoney,
  formatNumber,
  formatPercent,
  formatTimestamp,
  isEligibleForPassport,
  lifecycleRows,
  passportLifecycle,
} from "@/lib/domain";
import { CategoryBadge, PassportStatusBadge, RiskBadge, SeverityBadge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CardSkeleton } from "@/components/ui/LoadingSkeleton";
import { ErrorPanel, ModeNotice, NotFoundPanel } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { useCrumbs } from "@/components/ui/Breadcrumbs";
import { InvestigatorPanel, WorkflowButton, useIntegrations } from "@/components/AwsPanels";

type Decision = Extract<VerificationStatus, "SUPPORTED" | "REJECTED">;

export default function BatchDetailsPage() {
  const id = useRouteId("batches");
  const mode = useExecutionMode();
  const { success, error: toastError } = useToast();
  const integrations = useIntegrations(mode);
  const { data: batch, error, status, loading, reload } = useAsync(() => fetchBatch(id), [id]);

  const [local, setLocal] = useState<Batch | null>(null);
  const current = local && batch && local.id === batch.id ? local : batch;
  useEffect(() => setLocal(null), [batch]);

  const [busy, setBusy] = useState<null | "issue" | "verify">(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reason, setReason] = useState("");
  const [deciding, setDeciding] = useState(false);
  const reasonId = useId();
  const [hashTarget, setHashTarget] = useState<string | null>(null);

  useCrumbs(current ? [{ label: "Batches", href: "/batches" }, { label: current.batchNumber }] : null);

  // Deep link: #finding-<id>. Scroll + focus once the batch is rendered; track whether it exists.
  useEffect(() => {
    const sync = () => setHashTarget(window.location.hash.startsWith("#finding-") ? window.location.hash.slice(1) : null);
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const targetFinding = current && hashTarget ? current.findings.find((f) => findingAnchor(f.id) === hashTarget) : undefined;
  const missingTarget = !!current && !!hashTarget && !targetFinding;
  useEffect(() => {
    if (!targetFinding || !hashTarget) return;
    const el = document.getElementById(hashTarget);
    if (el) {
      el.scrollIntoView({ block: "center" });
      el.focus({ preventScroll: true });
    }
  }, [targetFinding, hashTarget]);

  const run = async (kind: "issue" | "verify") => {
    if (!current || busy) return;
    setBusy(kind);
    try {
      if (kind === "issue") {
        const res = await issuePassport(current.id);
        setLocal(res.batch);
        success("Passport issued", `Circularity Passport ${res.passport.passportId} was issued. Open it to view the public verification link.`);
      } else {
        const res = await verifyBatch(current.id);
        setLocal(res);
        success("Verification re-run", `Result: ${VERIFICATION_STATUS_META[res.status].label}.`);
      }
    } catch (err) {
      toastError(kind === "issue" ? "Passport was not issued" : "Verification failed", `${errorMessage(err)} No record was changed.`);
    } finally {
      setBusy(null);
    }
  };

  const openDecision = (d: Decision) => {
    setDecision(d);
    setReason("");
  };

  const confirmDecision = async () => {
    if (!current || !decision || deciding || !reason.trim()) return;
    setDeciding(true);
    try {
      const updated = await recordDecision(current.id, decision, reason.trim());
      setLocal(updated);
      success("Decision recorded", `Verification status is now ${VERIFICATION_STATUS_META[updated.status].label}.`);
      setDecision(null);
    } catch (err) {
      toastError("Decision was not recorded", `${errorMessage(err)} The batch status is unchanged.`);
    } finally {
      setDeciding(false);
    }
  };

  if (loading && !batch) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (error || !current) {
    if (status === 404) {
      return (
        <NotFoundPanel
          title="Batch not found"
          message={`No batch matches "${id}" in ${mode === "live" ? "the verification backend" : "the Demo Mode dataset"}.`}
          backHref="/batches"
          backLabel="Back to batch directory"
        />
      );
    }
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-4">
        <ErrorPanel title="Could not load this batch" message={error ?? "Unknown error"} onRetry={reload} mode={mode} />
        <Link href="/batches" className="text-sm font-semibold text-emerald-800 hover:underline">
          Back to batch directory
        </Link>
      </div>
    );
  }

  const b = current;
  const lifecycle = lifecycleRows(b);
  const eligible = isEligibleForPassport(b);
  const decided = b.auditorDecision;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
      {/* Header */}
      <div className="space-y-3 pb-4 border-b border-slate-200/80 dark:border-darkbg-border">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-black font-mono text-slate-900 dark:text-white break-all">{b.batchNumber}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={b.status} />
              <RiskBadge level={b.riskScore.riskLevel} score={b.riskScore.overallScore} />
              <PassportStatusBadge status={passportLifecycle(b)} passportId={b.passport?.passportId} />
              <CategoryBadge category={b.category} />
            </div>
            <p className="text-xs text-slate-700 dark:text-text-dark-secondary">
              Recycler: <strong className="text-slate-900 dark:text-white">{b.recyclerName}</strong> · Registration <span className="font-mono">{b.recyclerRegistrationId}</span>
            </p>
            <ModeNotice mode={mode} />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link href={evidenceHref(b.id)}>
              <Button size="sm" variant="outline" leftIcon={<FileText className="w-4 h-4" aria-hidden="true" />}>
                Evidence ({b.documents.length})
              </Button>
            </Link>
            <WorkflowButton batch={b} integrations={integrations} onFinished={reload} />
            <Button size="sm" variant="outline" onClick={() => run("verify")} isLoading={busy === "verify"} disabled={!!busy} leftIcon={<RefreshCw className="w-4 h-4" aria-hidden="true" />}>
              Re-run verification
            </Button>
            {b.passport && (
              <Link href={`/passports/${encodeURIComponent(b.passport.passportId)}`}>
                <Button size="sm" variant="lime" leftIcon={<ShieldCheck className="w-4 h-4" aria-hidden="true" />}>
                  View passport
                </Button>
              </Link>
            )}
            {eligible && (
              <Button size="sm" variant="primary" onClick={() => run("issue")} isLoading={busy === "issue"} disabled={!!busy} leftIcon={<Sparkles className="w-4 h-4" aria-hidden="true" />}>
                Issue Circularity Passport
              </Button>
            )}
          </div>
        </div>
      </div>

      {missingTarget && (
        <div role="alert" className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-sm text-amber-950">
          The finding linked here (<span className="font-mono">{hashTarget?.replace("finding-", "")}</span>) no longer exists on this batch. Findings are recalculated whenever evidence or
          batch details change. The current findings are listed below.
        </div>
      )}

      {/* Status panels: each concept is its own panel, never merged into one badge */}
      <section aria-label="Statuses" className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-4 space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-text-dark-muted">Documentary verification</h2>
          <StatusBadge status={b.status} />
          <p className="text-xs text-slate-800 dark:text-text-dark-secondary leading-relaxed">{VERIFICATION_STATUS_META[b.status].tooltip}</p>
          {decided && (
            <p className="text-xs text-slate-800 dark:text-text-dark-secondary border-t border-slate-100 dark:border-darkbg-border pt-2">
              <strong>Current decision:</strong> {VERIFICATION_STATUS_META[decided.decision].label} by auditor label “{decided.auditorId}” on {formatTimestamp(decided.timestamp)}.
              {" "}Reason: {decided.reason}
            </p>
          )}
          {b.status === "REJECTED" && actionableCount(b) > 0 && (
            <p className="text-xs text-slate-700 dark:text-text-dark-muted">The findings below are historical context for the rejection and follow-up.</p>
          )}
        </div>
        <div className="rounded-2xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-4 space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-text-dark-muted">Risk assessment</h2>
          <RiskBadge level={b.riskScore.riskLevel} score={b.riskScore.overallScore} />
          <p className="text-xs text-slate-800 dark:text-text-dark-secondary leading-relaxed">{b.riskScore.summaryExplanation}</p>
          <p className="text-[11px] text-slate-600">Policy {b.riskScore.policyVersion}. Calculated {formatTimestamp(b.riskScore.calculatedAt)}.</p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-4 space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-text-dark-muted">Passport lifecycle</h2>
          <PassportStatusBadge status={passportLifecycle(b)} passportId={b.passport?.passportId} />
          <p className="text-xs text-slate-800 dark:text-text-dark-secondary leading-relaxed">
            {!b.passport
              ? eligible
                ? "Evidence supported. A passport can be issued."
                : `A passport can only be issued when the batch is Evidence Supported with a recorded evidence-supported mass. Current status: ${VERIFICATION_STATUS_META[b.status].label}.`
              : b.passport.revoked
              ? `Revoked ${formatTimestamp(b.passport.revokedAt)}: ${b.passport.revocationReason ?? "no reason recorded"}. Documentary status above is unaffected.`
              : `Issued ${formatTimestamp(b.passport.issueTimestamp)}.`}
          </p>
        </div>
      </section>

      {/* Actions available for the current state */}
      {(b.status === "REVIEW_REQUIRED" || b.status === "SUPPORTED" || b.status === "REJECTED") && (
        <section aria-label="Auditor decision" className="rounded-2xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-4 space-y-2">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Record an audit decision</h2>
          <p className="text-xs text-slate-700 dark:text-text-dark-secondary">
            {mode === "live"
              ? "This API has no authentication: the decision is recorded with the unverified operator label from Settings."
              : "Demo Mode: the decision is stored in this browser only and is not an authoritative audit record."}
          </p>
          <div className="flex flex-wrap gap-2">
            {b.status !== "SUPPORTED" && (
              <Button size="sm" variant="outline" onClick={() => openDecision("SUPPORTED")} leftIcon={<Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />}>
                Authorize as Evidence Supported
              </Button>
            )}
            {b.status !== "REJECTED" && (
              <Button size="sm" variant="outline" onClick={() => openDecision("REJECTED")} leftIcon={<Ban className="w-3.5 h-3.5 text-rose-700" aria-hidden="true" />}>
                Reject batch
              </Button>
            )}
          </div>
          {b.passport && !b.passport.revoked && (
            <p className="text-xs text-amber-900 dark:text-amber-200">
              An active passport exists. A decision does not revoke it; use the passport page to revoke separately.
            </p>
          )}
        </section>
      )}

      {/* Metadata */}
      <section aria-labelledby="meta-heading" className="rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-4 sm:p-6 shadow-card">
        <h2 id="meta-heading" className="text-sm font-bold text-slate-900 dark:text-white pb-3 border-b border-slate-100 dark:border-darkbg-border">Batch metadata</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 text-xs pt-3">
          <Meta label="Collection date" value={formatDate(b.collectionDate)} />
          <Meta label="Processing date" value={b.processingDate ? formatDate(b.processingDate) : "Pending / not recorded"} />
          <Meta label="Claimed quantity as entered" value={`${formatNumber(b.claimedQuantity)} ${b.unit}`} />
          <Meta label="Origin" value={b.originLocation} />
          <Meta label="Destination" value={b.destinationLocation} />
          <Meta label="Last updated" value={formatTimestamp(b.updatedAt)} />
          {b.notes && <Meta label="Notes" value={b.notes} />}
        </dl>
      </section>

      {/* Lifecycle quantities */}
      <section aria-labelledby="mass-heading" className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-4 sm:p-6 shadow-card space-y-4">
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-darkbg-border">
            <h2 id="mass-heading" className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Scale className="w-4 h-4 text-emerald-700 dark:text-mint" aria-hidden="true" />
              Lifecycle quantities
            </h2>
            <span className="text-[11px] font-mono font-bold text-slate-700">Tolerance ±{b.massBalance.tolerancePercentage}%</span>
          </div>
          <table className="w-full text-xs text-left">
            <caption className="sr-only">Quantity at each lifecycle stage with its evidence basis</caption>
            <thead className="text-[11px] uppercase tracking-wider text-slate-700 dark:text-text-dark-muted">
              <tr>
                <th scope="col" className="pb-2 font-bold">Stage</th>
                <th scope="col" className="pb-2 font-bold">Quantity</th>
                <th scope="col" className="pb-2 font-bold hidden sm:table-cell">Evidence basis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border">
              {lifecycle.map((r) => (
                <tr key={r.key}>
                  <th scope="row" className="py-2.5 pr-3 font-semibold text-slate-900 dark:text-white">{r.label}</th>
                  <td className={`py-2.5 pr-3 font-mono ${r.value === null ? "text-slate-600 italic" : "font-bold text-slate-900 dark:text-white"}`}>{formatKg(r.value)}</td>
                  <td className="py-2.5 text-slate-700 dark:text-text-dark-secondary hidden sm:table-cell">{r.basis}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-darkbg-hover border border-slate-200/60 dark:border-darkbg-border flex flex-wrap items-center justify-between gap-2 text-xs">
            <div>
              <span className="text-slate-700 block text-[11px]">Variance versus claim (claimed − evidence-supported)</span>
              <span className="font-bold text-slate-900 dark:text-white font-mono text-sm">
                {b.massBalance.discrepancyKg === null ? "Not assessable" : `${formatKg(b.massBalance.discrepancyKg)} (${formatPercent(b.massBalance.lossPercentage)})`}
              </span>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold border ${
                b.massBalance.evidenceSupportedKg === null
                  ? "bg-slate-100 text-slate-800 border-slate-300"
                  : b.massBalance.isWithinTolerance
                  ? "bg-emerald-50 text-emerald-900 border-emerald-300"
                  : "bg-amber-50 text-amber-950 border-amber-300"
              }`}
            >
              {b.massBalance.evidenceSupportedKg === null ? "No evidence-supported quantity" : b.massBalance.isWithinTolerance ? "Within tolerance" : "Exceeds tolerance"}
            </span>
          </div>
        </div>

        {/* Risk breakdown */}
        <div className="lg:col-span-5 rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-4 sm:p-6 shadow-card space-y-3">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white pb-3 border-b border-slate-100 dark:border-darkbg-border">Risk score breakdown</h2>
          <dl className="space-y-2 text-xs">
            <Meta row label="Extraction confidence (OCR, not authenticity)" value={`${b.riskScore.breakdown.extractionConfidence.toFixed(1)}%`} />
            <Meta row label="Evidence completeness" value={`${b.riskScore.breakdown.evidenceCompleteness.toFixed(1)}%`} />
            <Meta row label="Cross-document consistency" value={`${b.riskScore.breakdown.crossDocumentConsistency.toFixed(1)}%`} />
            <Meta row label="Operational risk" value={`${b.riskScore.breakdown.operationalRisk.toFixed(1)}%`} />
          </dl>
          <p className="text-[11px] text-slate-700 dark:text-text-dark-muted">
            Document authenticity is not checked by any configured service; these figures describe extraction and consistency only.
          </p>
        </div>
      </section>

      {/* Valuation */}
      <section aria-labelledby="value-heading" className="rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-4 sm:p-6 shadow-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 pb-3 border-b border-slate-100 dark:border-darkbg-border">
          <div>
            <h2 id="value-heading" className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Coins className="w-4 h-4 text-amber-600" aria-hidden="true" /> Material valuation (modeled estimate)
            </h2>
            <p className="text-xs text-slate-700 dark:text-text-dark-muted mt-0.5">
              {b.materialEstimate.priceBasis} · Dataset {b.materialEstimate.datasetVersion} · Prices as of {formatDate(b.materialEstimate.referencePriceDate)}
            </p>
          </div>
          <div className="text-left sm:text-right">
            <span className="block text-[11px] text-slate-700">Net of modeled processing cost · {b.materialEstimate.currency}</span>
            <span className="text-lg font-black text-slate-900 dark:text-white font-mono">
              {b.materialEstimate.isAvailable ? formatMoney(b.materialEstimate.netEstimatedRecoveryValueUsd, b.materialEstimate.currency, 2) : "Not available"}
            </span>
          </div>
        </div>

        {!b.materialEstimate.isAvailable ? (
          <p className="p-4 rounded-2xl bg-slate-50 dark:bg-darkbg-hover text-sm text-slate-800 dark:text-text-dark-secondary">
            No valuation is available because no quantity is evidence-supported yet. Attach a weighbridge record with a recorded received mass.
          </p>
        ) : (
          <>
            <p className="text-xs text-slate-800 dark:text-text-dark-secondary">
              Computed on <strong>{formatKg(b.materialEstimate.basisKg)}</strong> of evidence-supported input mass. Gross {formatMoney(b.materialEstimate.totalGrossValueUsd, b.materialEstimate.currency, 2)} − modeled
              processing cost {formatMoney(b.materialEstimate.modeledProcessingCostUsd, b.materialEstimate.currency, 2)}.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[34rem]">
                <caption className="sr-only">Modeled material fractions, quantities, unit prices and values</caption>
                <thead className="text-[11px] uppercase tracking-wider text-slate-700 dark:text-text-dark-muted border-b border-slate-100 dark:border-darkbg-border">
                  <tr>
                    <th scope="col" className="pb-2.5 font-bold">Fraction</th>
                    <th scope="col" className="pb-2.5 font-bold">Share of input</th>
                    <th scope="col" className="pb-2.5 font-bold">Estimated mass</th>
                    <th scope="col" className="pb-2.5 font-bold">Reference price</th>
                    <th scope="col" className="pb-2.5 font-bold text-right">Modeled value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border">
                  {b.materialEstimate.fractions.map((f) => (
                    <tr key={f.materialName}>
                      <th scope="row" className="py-2.5 font-semibold text-slate-900 dark:text-white">{f.materialName}</th>
                      <td className="py-2.5 font-mono">{f.fractionPercentage.toFixed(3)}%</td>
                      <td className="py-2.5 font-mono">{formatKg(f.estimatedQuantityKg)}</td>
                      <td className="py-2.5 font-mono">{formatMoney(f.unitPriceUsd, b.materialEstimate.currency, 2)}/kg</td>
                      <td className="py-2.5 text-right font-mono font-bold">{formatMoney(f.estimatedValueUsd, b.materialEstimate.currency, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <details className="text-xs">
              <summary className="cursor-pointer font-semibold text-emerald-800 dark:text-mint">View calculation and assumptions</summary>
              <div className="mt-2 space-y-2 text-slate-800 dark:text-text-dark-secondary">
                <ul className="list-disc pl-5 space-y-1">
                  {b.materialEstimate.methodology.map((m) => <li key={m}>{m}</li>)}
                  {b.materialEstimate.assumptions.map((a) => <li key={a}>{a}</li>)}
                </ul>
              </div>
            </details>
          </>
        )}
      </section>

      {/* Evidence inventory */}
      <section aria-labelledby="evidence-heading" className="rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-4 sm:p-6 shadow-card space-y-3">
        <h2 id="evidence-heading" className="text-sm font-bold text-slate-900 dark:text-white pb-3 border-b border-slate-100 dark:border-darkbg-border">Evidence inventory ({b.documents.length})</h2>
        {b.documents.length === 0 ? (
          <p className="text-sm text-slate-700 dark:text-text-dark-secondary">No evidence documents are attached to this batch.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-darkbg-border">
            {b.documents.map((d) => (
              <li key={d.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <Link href={evidenceHref(b.id, d.id)} className="font-mono font-bold text-slate-900 dark:text-white hover:underline break-all">
                    {d.fileName}
                  </Link>
                  <p className="text-slate-700 dark:text-text-dark-muted">
                    {DOCUMENT_TYPE_LABELS[d.documentType]} · {d.extractedFields.length} field(s) · uploaded {formatTimestamp(d.uploadTimestamp)}
                    {d.extractedFields.some((f) => f.isCorrected) && " · contains audited corrections"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Findings */}
      <section aria-labelledby="findings-heading" className="rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-4 sm:p-6 shadow-card space-y-4">
        <h2 id="findings-heading" className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-darkbg-border">
          <FileText className="w-4 h-4 text-emerald-700 dark:text-mint" aria-hidden="true" />
          Verification findings ({b.findings.length})
        </h2>
        {b.findings.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-700">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" aria-hidden="true" />
            No findings were produced for this batch.
          </p>
        ) : (
          <ul className="space-y-3">
            {b.findings.map((f) => (
              <FindingCard key={f.id} finding={f} batch={b} highlighted={targetFinding?.id === f.id} />
            ))}
          </ul>
        )}
      </section>

      {mode === "live" && <InvestigatorPanel batch={b} integrations={integrations} />}

      {/* Timeline */}
      <section aria-labelledby="timeline-heading" className="rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-4 sm:p-6 shadow-card space-y-3">
        <h2 id="timeline-heading" className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-darkbg-border">
          <History className="w-4 h-4 text-emerald-700 dark:text-mint" aria-hidden="true" /> Audit and decision history
        </h2>
        <ol className="space-y-3 text-xs">
          {[...b.timeline].reverse().map((t) => (
            <li key={t.id} className="flex gap-3">
              <span aria-hidden="true" className="mt-0.5">
                {t.severity === "critical" ? <XCircle className="w-4 h-4 text-rose-600" /> : <Clock className="w-4 h-4 text-slate-500" />}
              </span>
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">{t.action}</p>
                <p className="text-slate-700 dark:text-text-dark-muted">
                  {t.actor} · {formatTimestamp(t.timestamp)}
                </p>
                {t.note && <p className="text-slate-800 dark:text-text-dark-secondary mt-0.5">{t.note}</p>}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <ConfirmDialog
        isOpen={!!decision}
        onClose={() => setDecision(null)}
        onConfirm={confirmDecision}
        title={decision === "REJECTED" ? "Reject this batch?" : "Authorize as Evidence Supported?"}
        description={
          decision === "REJECTED"
            ? "The batch's documentary status becomes Rejected. Existing findings stay visible as history."
            : "The batch's documentary status becomes Evidence Supported by auditor decision, even though automated findings may remain."
        }
        confirmText={decision === "REJECTED" ? "Reject batch" : "Authorize"}
        variant={decision === "REJECTED" ? "danger" : "primary"}
        isLoading={deciding}
        confirmDisabled={!reason.trim()}
      >
        <div>
          <label htmlFor={reasonId} className="block text-[11px] font-bold uppercase tracking-wider text-slate-800 dark:text-text-dark-primary mb-1">
            Justification (required)
          </label>
          <textarea
            id={reasonId}
            data-autofocus
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg-hover text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </ConfirmDialog>
    </div>
  );
}

function actionableCount(b: Batch): number {
  return b.findings.filter((f) => f.severity !== "info").length;
}

function Meta({ label, value, row }: { label: string; value: string; row?: boolean }) {
  if (row) {
    return (
      <div className="flex justify-between gap-3">
        <dt className="text-slate-700 dark:text-text-dark-secondary">{label}</dt>
        <dd className="font-bold text-slate-900 dark:text-white">{value}</dd>
      </div>
    );
  }
  return (
    <div>
      <dt className="text-[11px] text-slate-700 dark:text-text-dark-muted">{label}</dt>
      <dd className="font-medium text-slate-900 dark:text-white">{value}</dd>
    </div>
  );
}

function FindingCard({ finding: f, batch, highlighted }: { finding: Finding; batch: Batch; highlighted: boolean }) {
  const sourceDoc = f.sourceDocumentId ? batch.documents.find((d) => d.id === f.sourceDocumentId) : undefined;
  return (
    <li
      id={findingAnchor(f.id)}
      tabIndex={-1}
      className={`p-4 rounded-2xl border bg-slate-50/70 dark:bg-darkbg-hover/70 space-y-2.5 scroll-mt-24 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
        highlighted ? "border-amber-500 ring-2 ring-amber-400" : "border-slate-200 dark:border-darkbg-border"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-xs font-bold text-slate-800 dark:text-white">
          {f.ruleId} · {f.ruleName}
        </span>
        <SeverityBadge severity={f.severity} />
      </div>
      <h3 className="text-sm font-bold text-slate-900 dark:text-white">{f.title}</h3>
      <p className="text-xs text-slate-800 dark:text-text-dark-secondary leading-relaxed">{f.description}</p>
      <dl className="p-3 rounded-xl bg-white dark:bg-darkbg-card border border-slate-200/60 dark:border-darkbg-border text-xs grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <dt className="text-slate-700">Observed</dt>
          <dd className="font-mono font-bold text-slate-900 dark:text-white">{f.observedValue ?? "Not recorded"}</dd>
        </div>
        <div>
          <dt className="text-slate-700">Expected</dt>
          <dd className="font-mono font-bold text-emerald-800 dark:text-mint">{f.expectedValue ?? "Not recorded"}</dd>
        </div>
        <div>
          <dt className="text-slate-700">Difference</dt>
          <dd className="font-mono font-bold text-amber-900 dark:text-amber-200">{f.difference ?? "Not applicable"}</dd>
        </div>
        <div>
          <dt className="text-slate-700">Lifecycle stage</dt>
          <dd className="font-medium">{f.lifecycleStage ? LIFECYCLE_STAGE_LABELS[f.lifecycleStage] ?? f.lifecycleStage : "Not specified"}</dd>
        </div>
        <div>
          <dt className="text-slate-700">Applied rule / policy</dt>
          <dd className="font-medium">
            {f.ruleId}
            {f.policyVersion ? ` · ${f.policyVersion}` : ""}
          </dd>
        </div>
        <div>
          <dt className="text-slate-700">Source evidence</dt>
          <dd className="font-medium">
            {sourceDoc ? (
              <Link href={evidenceHref(batch.id, sourceDoc.id, f.sourceFieldId)} className="text-emerald-800 dark:text-mint hover:underline font-mono break-all">
                {sourceDoc.fileName}
                {f.sourceFieldId ? " (field)" : ""}
              </Link>
            ) : f.sourceDocumentName ? (
              f.sourceDocumentName
            ) : (
              "No document (batch-level finding)"
            )}
          </dd>
        </div>
      </dl>
      <p className="text-xs text-amber-950 dark:text-amber-200 font-semibold">
        <AlertTriangle className="w-3.5 h-3.5 inline -mt-0.5 mr-1" aria-hidden="true" />
        Recommended action: {f.recommendedAction}
      </p>
    </li>
  );
}
