"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { useRouteId } from "@/lib/route";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Ban, Check, Coins, Copy, ExternalLink, Printer } from "lucide-react";
import type { Batch, CircularityPassport, PublicVerification } from "@/types";
import { errorMessage, fetchPassportRecord, fetchPublicVerification, revokePassport } from "@/lib/api-client";
import { copyText } from "@/lib/clipboard";
import { useAsync, useExecutionMode } from "@/lib/hooks";
import {
  VERIFICATION_STATUS_META,
  formatDate,
  formatKg,
  formatMoney,
  formatNumber,
  formatPercent,
  formatTimestamp,
  passportLifecycle,
  signatureStateFromStatus,
} from "@/lib/domain";
import { IntegrityBadge, PassportStatusBadge, SignatureBadge, SimulatedBadge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ErrorPanel, ModeNotice, NotFoundPanel } from "@/components/ui/Feedback";
import { CardSkeleton } from "@/components/ui/LoadingSkeleton";
import { useToast } from "@/components/ui/Toast";
import { useCrumbs } from "@/components/ui/Breadcrumbs";

export default function CircularityPassportPage() {
  const id = useRouteId("passports");
  const mode = useExecutionMode();
  const { success, error: toastError, warning } = useToast();
  const record = useAsync(() => fetchPassportRecord(id), [id]);
  const publicCheck = useAsync(async (): Promise<PublicVerification | null> => {
    const r = await fetchPassportRecord(id).catch(() => null);
    return r ? fetchPublicVerification(r.passport.passportId) : null;
  }, [id]);

  const [updated, setUpdated] = useState<{ batch: Batch; passport: CircularityPassport } | null>(null);
  const data = updated && record.data && updated.passport.passportId === record.data.passport.passportId ? updated : record.data;
  useEffect(() => setUpdated(null), [record.data]);

  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const [copied, setCopied] = useState<"link" | "hash" | null>(null);
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const fallbackRef = useRef<HTMLInputElement>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [revoking, setRevoking] = useState(false);
  const reasonId = useId();

  useCrumbs(
    data
      ? [
          { label: "Passports", href: "/passports" },
          { label: data.passport.passportId },
        ]
      : null
  );

  useEffect(() => {
    if (copyFallback) {
      fallbackRef.current?.focus();
      fallbackRef.current?.select();
    }
  }, [copyFallback]);

  if (record.loading && !record.data) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 w-full space-y-6">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }
  if (record.error || !data) {
    if (record.status === 404)
      return (
        <NotFoundPanel
          title="Circularity Passport not found"
          message={`No passport matches "${id}" in ${mode === "live" ? "the verification backend" : "the Demo Mode dataset"}.`}
          backHref="/passports"
          backLabel="Back to passports"
        />
      );
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <ErrorPanel title="Could not load this passport" message={record.error ?? "Unknown error"} onRetry={record.reload} mode={mode} />
      </div>
    );
  }

  const { batch, passport } = data;
  const verifyUrl = `${origin}/verify/${encodeURIComponent(passport.passportId)}`;
  const lifecycle = passportLifecycle(batch);
  const est = batch.materialEstimate;
  const issuedValue = passport.estimatedValueUsd;
  const valueDrift = est.isAvailable && Math.abs(est.netEstimatedRecoveryValueUsd - issuedValue) > 0.01;
  const live = publicCheck.data;
  const sigState = live?.signature?.status ?? signatureStateFromStatus(passport.signatureStatus);

  const doCopy = async (text: string, kind: "link" | "hash") => {
    const ok = await copyText(text);
    if (ok) {
      setCopied(kind);
      setCopyFallback(null);
      success(kind === "link" ? "Verification link copied" : "SHA-256 hash copied", text.length > 60 ? `${text.slice(0, 24)}…` : text);
      setTimeout(() => setCopied(null), 2000);
    } else {
      setCopyFallback(text);
      warning("Automatic copy failed", "The text is selected below. Press Ctrl+C (Cmd+C on Mac) to copy it.");
    }
  };

  const doRevoke = async () => {
    if (revoking || !reason.trim()) return;
    setRevoking(true);
    try {
      const res = await revokePassport(passport.passportId, reason.trim());
      setUpdated(res);
      setRevokeOpen(false);
      setReason("");
      success("Passport revoked", `Documentary verification status is unchanged (${VERIFICATION_STATUS_META[res.batch.status].label}).`);
      publicCheck.reload();
    } catch (err) {
      const msg = errorMessage(err);
      toastError("Passport revocation failed", `${msg} Your record has not been changed.`);
      if (/already revoked/i.test(msg)) {
        setRevokeOpen(false);
        record.reload();
      }
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6">
      <div className="no-print flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-darkbg-border">
        <div className="space-y-2 min-w-0">
          <Link href={`/batches/${encodeURIComponent(batch.id)}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-950 dark:text-text-dark-secondary dark:hover:text-white">
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> Back to batch {batch.batchNumber}
          </Link>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Circularity Passport — Evidence-Supported Record</h1>
          <div className="flex flex-wrap gap-2">
            <PassportStatusBadge status={lifecycle} passportId={passport.passportId} />
            <StatusBadge status={batch.status} />
          </div>
          <ModeNotice mode={mode} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" leftIcon={<Printer className="w-4 h-4" aria-hidden="true" />} onClick={() => window.print()}>
            Print
          </Button>
          <Button size="sm" variant="outline" leftIcon={copied === "link" ? <Check className="w-4 h-4 text-emerald-700" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />} onClick={() => doCopy(verifyUrl, "link")} disabled={!origin}>
            {copied === "link" ? "Link copied" : "Copy verification link"}
          </Button>
          <Link href={`/verify/${encodeURIComponent(passport.passportId)}`}>
            <Button size="sm" variant="primary" leftIcon={<ExternalLink className="w-4 h-4" aria-hidden="true" />}>
              Public verification
            </Button>
          </Link>
          {!passport.revoked && (
            <Button size="sm" variant="outline" className="text-rose-800 border-rose-400" leftIcon={<Ban className="w-4 h-4" aria-hidden="true" />} onClick={() => setRevokeOpen(true)}>
              Revoke passport
            </Button>
          )}
        </div>
      </div>

      {copyFallback && (
        <div role="status" className="no-print p-3 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-950 space-y-1.5">
          <label htmlFor="copy-fallback" className="font-bold block">Copy manually</label>
          <input id="copy-fallback" ref={fallbackRef} readOnly value={copyFallback} onFocus={(e) => e.currentTarget.select()} className="w-full px-2 py-1.5 font-mono text-xs rounded border border-amber-400 bg-white text-slate-900" />
        </div>
      )}

      {passport.revoked && (
        <div role="status" className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-rose-950 dark:text-rose-100 flex items-start gap-3">
          <Ban className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-xs space-y-1">
            <p className="font-bold">This passport has been revoked{passport.revokedAt ? ` on ${formatTimestamp(passport.revokedAt)}` : ""}.</p>
            <p>Reason: {passport.revocationReason ?? "not recorded"}</p>
            <p>Revocation changes the passport lifecycle only. The batch&apos;s documentary status ({VERIFICATION_STATUS_META[batch.status].label}) and the payload hash are unaffected.</p>
          </div>
        </div>
      )}

      <article className="passport-sheet rounded-3xl border-2 border-emerald-600/30 bg-white dark:bg-darkbg-card p-5 sm:p-8 shadow-xl space-y-7">
        <header className="flex flex-col sm:flex-row items-start justify-between gap-5 pb-5 border-b border-slate-200 dark:border-darkbg-border">
          <div className="space-y-1 min-w-0">
            <p className="text-xs font-mono font-bold tracking-widest uppercase text-emerald-800 dark:text-mint">E-waste circularity record</p>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">Circularity Passport</h2>
            <dl className="text-xs text-slate-800 dark:text-text-dark-secondary space-y-0.5 pt-1">
              <div className="flex flex-wrap gap-x-2"><dt className="font-bold">Passport ID:</dt><dd className="font-mono break-all">{passport.passportId}</dd></div>
              <div className="flex flex-wrap gap-x-2"><dt className="font-bold">Version:</dt><dd>{passport.version}</dd></div>
              <div className="flex flex-wrap gap-x-2"><dt className="font-bold">Batch:</dt><dd className="font-mono">{passport.batchNumber}</dd></div>
              <div className="flex flex-wrap gap-x-2"><dt className="font-bold">Issued:</dt><dd>{formatTimestamp(passport.issueTimestamp)}</dd></div>
              <div className="flex flex-wrap gap-x-2"><dt className="font-bold">Recycler:</dt><dd>{passport.recyclerName} ({passport.recyclerLicense})</dd></div>
              <div className="flex flex-wrap gap-x-2"><dt className="font-bold">Facility:</dt><dd>{passport.facilityLocation}</dd></div>
            </dl>
          </div>
          <figure className="p-3 bg-white rounded-2xl border border-slate-300 shrink-0 text-center">
            {origin ? <QRCodeSVG value={verifyUrl} size={112} level="M" includeMargin aria-label={`QR code for ${verifyUrl}`} role="img" /> : <div className="w-28 h-28" />}
            <figcaption className="text-[10px] text-slate-700 mt-1 max-w-[7.5rem] break-all font-mono">{origin ? verifyUrl : "Preparing link…"}</figcaption>
          </figure>
        </header>

        {/* Independent states */}
        <section aria-labelledby="states-heading" className="space-y-2">
          <h3 id="states-heading" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-text-dark-muted">Independent states</h3>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-darkbg-hover border border-slate-200 dark:border-darkbg-border space-y-1.5">
              <dt className="font-bold">Documentary verification</dt>
              <dd><StatusBadge status={batch.status} /></dd>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-darkbg-hover border border-slate-200 dark:border-darkbg-border space-y-1.5">
              <dt className="font-bold">Passport lifecycle</dt>
              <dd><PassportStatusBadge status={lifecycle} /></dd>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-darkbg-hover border border-slate-200 dark:border-darkbg-border space-y-1.5">
              <dt className="font-bold">Payload integrity (checked just now)</dt>
              <dd>
                {publicCheck.loading ? <span className="text-slate-700">Checking…</span> : live?.payloadIntegrity ? <IntegrityBadge state={live.payloadIntegrity.status} /> : <IntegrityBadge state="NOT_CHECKED" />}
              </dd>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-darkbg-hover border border-slate-200 dark:border-darkbg-border space-y-1.5">
              <dt className="font-bold">Issuer signature</dt>
              <dd><SignatureBadge state={sigState} /></dd>
            </div>
          </dl>
          {publicCheck.error && <p role="alert" className="text-xs text-rose-800">Integrity check unavailable: {publicCheck.error}</p>}
        </section>

        {/* Lifecycle quantities */}
        <section aria-labelledby="qty-heading" className="space-y-2">
          <h3 id="qty-heading" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-text-dark-muted">Lifecycle quantities</h3>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <Qty label="Claimed mass" value={formatKg(passport.claimedKg)} note="Declared at intake" />
            <Qty label="Received mass" value={formatKg(batch.massBalance.receivedKg)} note="Weighbridge record" />
            <Qty label="Processed input mass" value={formatKg(batch.massBalance.processedKg)} note="Certificate" />
            <Qty label="Evidence-supported mass" value={formatKg(passport.evidenceSupportedKg)} note="Lowest documented downstream stage" strong />
          </dl>
          <p className="text-[11px] text-slate-700 dark:text-text-dark-muted">
            Evidence-supported share of claim: <strong>{formatPercent(passport.recoveryRatePercent)}</strong>. This compares documented quantity with the claim; it is not a measured recovery yield.
            Recovered output mass is not captured by any evidence type.
          </p>
        </section>

        {/* Valuation */}
        <section aria-labelledby="val-heading" className="rounded-2xl border border-slate-200 dark:border-darkbg-border p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 id="val-heading" className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Coins className="w-4 h-4 text-amber-600" aria-hidden="true" /> Modeled material value (estimate)
            </h3>
            <SimulatedBadge label="Illustrative prices" tooltip="Reference prices are an illustrative dataset snapshot, not live market quotations." />
          </div>
          <p className="text-xl font-black font-mono text-slate-900 dark:text-white">
            {formatMoney(issuedValue, est.currency, 2)} <span className="text-xs font-normal text-slate-700">net of modeled processing cost, as recorded at issue</span>
          </p>
          {valueDrift && (
            <p className="text-xs text-amber-950 bg-amber-50 border border-amber-300 rounded-lg p-2">
              The current model output for this batch is {formatMoney(est.netEstimatedRecoveryValueUsd, est.currency, 2)}; it differs from the figure recorded at issue because evidence or the dataset changed afterwards.
            </p>
          )}
          <details className="text-xs">
            <summary className="cursor-pointer font-semibold text-emerald-800 dark:text-mint">View calculation</summary>
            <div className="mt-3 space-y-3 text-slate-800 dark:text-text-dark-secondary">
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <Qty label="Currency" value={est.currency} />
                <Qty label="Basis (input mass)" value={formatKg(est.basisKg)} />
                <Qty label="Gross value" value={formatMoney(est.totalGrossValueUsd, est.currency, 2)} />
                <Qty label="Modeled processing cost" value={`− ${formatMoney(est.modeledProcessingCostUsd, est.currency, 2)}`} />
                <Qty label="Net value (shown above)" value={formatMoney(est.netEstimatedRecoveryValueUsd, est.currency, 2)} />
                <Qty label="Price observation date" value={formatDate(est.referencePriceDate)} />
                <Qty label="Dataset version" value={est.datasetVersion} />
                <Qty label="Price source" value={est.priceBasis} />
              </dl>
              {est.fractions.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px] min-w-[28rem]">
                    <caption className="sr-only">Modeled material fractions</caption>
                    <thead className="uppercase text-slate-700 border-b border-slate-200">
                      <tr>
                        <th scope="col" className="pb-1.5">Material</th>
                        <th scope="col" className="pb-1.5">Assumed share</th>
                        <th scope="col" className="pb-1.5">Est. mass</th>
                        <th scope="col" className="pb-1.5">Ref. price/kg</th>
                        <th scope="col" className="pb-1.5 text-right">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {est.fractions.map((f) => (
                        <tr key={f.materialName}>
                          <th scope="row" className="py-1.5 font-semibold">{f.materialName}</th>
                          <td className="py-1.5 font-mono">{f.fractionPercentage}%</td>
                          <td className="py-1.5 font-mono">{formatKg(f.estimatedQuantityKg)}</td>
                          <td className="py-1.5 font-mono">{formatNumber(f.unitPriceUsd)}</td>
                          <td className="py-1.5 font-mono font-bold text-right">{formatMoney(f.estimatedValueUsd, est.currency, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <ul className="list-disc pl-5 space-y-1">
                {est.methodology.map((m) => <li key={m}>{m}</li>)}
                {est.assumptions.map((a) => <li key={a}>{a}</li>)}
              </ul>
            </div>
          </details>
        </section>

        {/* Cryptographic block */}
        <section aria-labelledby="crypto-heading" className="rounded-2xl bg-slate-50 dark:bg-darkbg-hover p-4 border border-slate-200 dark:border-darkbg-border space-y-2 text-xs">
          <h3 id="crypto-heading" className="font-bold text-slate-900 dark:text-white">Integrity record</h3>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <span className="font-bold shrink-0">SHA-256 digest:</span>
            <code className="font-mono text-[11px] break-all text-slate-900 dark:text-white">{passport.sha256Hash}</code>
            <button type="button" onClick={() => doCopy(passport.sha256Hash, "hash")} aria-label="Copy SHA-256 hash" className="no-print p-1 text-slate-700 hover:text-emerald-700 shrink-0">
              {copied === "hash" ? <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
            </button>
          </div>
          <p>
            <span className="font-bold">Issuing engine:</span> {passport.issuerName}
          </p>
          <p>
            <span className="font-bold">Signature recorded at issuance:</span> {passport.signatureStatus.replace(/_/g, " ").toLowerCase()}
            {sigState === "SIMULATED" && " (a simulated stand-in, not an issuer signature)"}
            {sigState === "NOT_CONFIGURED" && " (issuer authenticity cannot be established)"}
          </p>
          {passport.hashScopeDisclaimer && <p className="text-slate-700 dark:text-text-dark-muted">{passport.hashScopeDisclaimer}</p>}
        </section>

        <footer className="pt-2 text-center text-[11px] text-slate-700 dark:text-text-dark-muted leading-relaxed border-t border-slate-100 dark:border-darkbg-border">
          This record summarizes documentary evidence submitted for the batch. It is not a regulatory certificate, government endorsement or accreditation, and does not independently verify that physical recycling occurred.
        </footer>
      </article>

      <ConfirmDialog
        isOpen={revokeOpen}
        onClose={() => setRevokeOpen(false)}
        onConfirm={doRevoke}
        title="Revoke this Circularity Passport?"
        description={`Public verification will show this passport as Revoked. The batch's documentary status stays unchanged. ${mode === "live" ? "The backend has no authentication; the action is recorded without a verified identity." : "Demo Mode: this only affects this browser's demo dataset."}`}
        confirmText="Revoke passport"
        variant="danger"
        isLoading={revoking}
        confirmDisabled={!reason.trim()}
      >
        <div>
          <label htmlFor={reasonId} className="block text-[11px] font-bold uppercase tracking-wider text-slate-800 dark:text-text-dark-primary mb-1">
            Revocation justification (required)
          </label>
          <textarea
            id={reasonId}
            data-autofocus
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg-hover text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
        </div>
      </ConfirmDialog>
    </div>
  );
}

function Qty({ label, value, note, strong }: { label: string; value: string; note?: string; strong?: boolean }) {
  return (
    <div className="p-3 rounded-xl bg-slate-50 dark:bg-darkbg-hover border border-slate-200/70 dark:border-darkbg-border">
      <dt className="text-[11px] text-slate-700 dark:text-text-dark-muted">{label}</dt>
      <dd className={`font-mono ${strong ? "font-black text-emerald-900 dark:text-mint" : "font-bold text-slate-900 dark:text-white"} break-words`}>{value}</dd>
      {note && <dd className="text-[10px] text-slate-600 dark:text-text-dark-muted">{note}</dd>}
    </div>
  );
}
