"use client";

import React, { useState } from "react";
import { useRouteId } from "@/lib/route";
import Link from "next/link";
import { Ban, Bug, HelpCircle, RefreshCw, ShieldCheck } from "lucide-react";
import type { PublicVerification, TamperDemoResult } from "@/types";
import { errorMessage, fetchPublicVerification, runTamperDemo } from "@/lib/api-client";
import { useAsync, useExecutionMode } from "@/lib/hooks";
import { CATEGORY_LABELS, formatKg, formatMoney, formatPercent, formatTimestamp } from "@/lib/domain";
import { IntegrityBadge, PassportStatusBadge, SignatureBadge, SimulatedBadge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ErrorPanel, ModeNotice } from "@/components/ui/Feedback";
import { CardSkeleton } from "@/components/ui/LoadingSkeleton";
import { useCrumbs } from "@/components/ui/Breadcrumbs";

export default function PublicVerifyPage() {
  const id = useRouteId("verify");
  const mode = useExecutionMode();
  const { data, error, loading, reload } = useAsync(() => fetchPublicVerification(id), [id]);
  const [demo, setDemo] = useState<TamperDemoResult | null>(null);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);

  useCrumbs([{ label: "Public Verification" }, { label: id }]);

  const runDemo = async () => {
    if (demoBusy || !data?.found) return;
    setDemoBusy(true);
    setDemoError(null);
    try {
      setDemo(await runTamperDemo({ passportId: data.passportId }));
    } catch (err) {
      setDemo(null);
      setDemoError(errorMessage(err));
    } finally {
      setDemoBusy(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full space-y-8">
      <header className="text-center space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-900 dark:bg-emerald-950/80 dark:text-mint border border-emerald-300 dark:border-emerald-800">
          <ShieldCheck className="w-4 h-4" aria-hidden="true" />
          <span>Public passport verification</span>
        </div>
        <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Verify a Circularity Passport</h1>
        <p className="text-xs text-slate-700 dark:text-text-dark-secondary font-mono break-all">Passport ID: <strong>{id}</strong></p>
        <ModeNotice mode={mode} />
      </header>

      {loading && !data && <CardSkeleton />}
      {error && <ErrorPanel title="Verification could not be completed" message={error} onRetry={reload} mode={mode} />}

      {data && !data.found && (
        <div className="max-w-xl mx-auto text-center space-y-4 py-6">
          <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-darkbg-card text-slate-600 mx-auto flex items-center justify-center border border-slate-300">
            <HelpCircle className="w-8 h-8" aria-hidden="true" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Passport not found</h2>
          <p className="text-sm text-slate-700 dark:text-text-dark-secondary">
            {data.message ?? `No record matches “${id}”.`} The link may be mistyped, or the passport may belong to a different environment.
          </p>
          <Link href="/passports">
            <Button variant="outline" size="sm">Browse passports</Button>
          </Link>
        </div>
      )}

      {data?.found && <FoundView data={data} onRecheck={reload} rechecking={loading} demo={demo} demoError={demoError} demoBusy={demoBusy} onDemo={runDemo} />}
    </div>
  );
}

function FoundView({
  data,
  onRecheck,
  rechecking,
  demo,
  demoError,
  demoBusy,
  onDemo,
}: {
  data: PublicVerification;
  onRecheck: () => void;
  rechecking: boolean;
  demo: TamperDemoResult | null;
  demoError: string | null;
  demoBusy: boolean;
  onDemo: () => void;
}) {
  const revoked = data.lifecycleStatus === "REVOKED";
  const integrity = data.payloadIntegrity?.status ?? "NOT_CHECKED";
  const signature = data.signature?.status ?? "NOT_CHECKED";

  return (
    <>
      {revoked && (
        <div role="status" className="rounded-3xl border-2 border-rose-500 bg-rose-50 dark:bg-rose-950/60 p-6 text-center space-y-2">
          <Ban className="w-8 h-8 text-rose-700 mx-auto" aria-hidden="true" />
          <h2 className="text-xl font-black text-rose-950 dark:text-rose-100">This passport has been revoked</h2>
          <p className="text-sm text-rose-900 dark:text-rose-200 max-w-md mx-auto">
            {integrity === "VALID" ? "Its payload hash still matches the issued record, but " : ""}a revoked passport is no longer active and must not be relied on.
          </p>
          {data.revocationReason && <p className="text-xs font-mono text-rose-900 dark:text-rose-200">Reason: {data.revocationReason}</p>}
          {data.revokedAt && <p className="text-xs text-rose-900 dark:text-rose-200">Revoked {formatTimestamp(data.revokedAt)}</p>}
        </div>
      )}

      <section aria-labelledby="pillars-heading" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="pillars-heading" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-text-dark-muted">Four independent checks</h2>
          <Button size="sm" variant="outline" onClick={onRecheck} disabled={rechecking} leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${rechecking ? "motion-safe:animate-spin" : ""}`} aria-hidden="true" />}>
            Re-check
          </Button>
        </div>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Pillar n={1} title="Payload integrity" badge={<IntegrityBadge state={integrity} />}>
            {integrity === "VALID" && "The passport fields match the hash recorded at issuance, so they have not been modified since. This does not identify the issuer or prove physical recycling."}
            {integrity === "INVALID" && "The passport fields no longer match the hash recorded at issuance. Do not rely on this record."}
            {integrity === "NOT_CHECKED" && "The service did not report an integrity result."}
          </Pillar>
          <Pillar n={2} title="Issuer signature" badge={<SignatureBadge state={signature} />}>
            {signature === "VALID" && "The issuer signature verified against the configured key service."}
            {signature === "INVALID" && "The issuer signature failed verification."}
            {signature === "SIMULATED" && "The signature value comes from a local simulation, not an issuer key. Issuer authenticity is NOT established."}
            {signature === "NOT_CONFIGURED" && "No issuer signature exists for this passport, so issuer authenticity cannot be established."}
            {(signature === "NOT_CHECKED" || signature === "UNSUPPORTED") && "The signature could not be checked."}
            {data.signature?.detail ? ` ${data.signature.detail}` : ""}
          </Pillar>
          <Pillar n={3} title="Documentary verification" badge={data.documentaryStatus ? <StatusBadge status={data.documentaryStatus} /> : <span className="text-xs font-semibold text-slate-700">Not available</span>}>
            Status of the batch&apos;s documentary evidence review. It is independent of this passport&apos;s revocation and of the hash check.
          </Pillar>
          <Pillar n={4} title="Passport lifecycle" badge={<PassportStatusBadge status={revoked ? "REVOKED" : data.lifecycleStatus === "ACTIVE" ? "ACTIVE" : undefined} />}>
            {revoked ? "Revoked by the issuer. The hash can still be intact." : data.lifecycleStatus === "ACTIVE" ? "Issued and not revoked." : "Lifecycle state not reported."}
          </Pillar>
        </ul>
        {data.checkedAt && <p className="text-[11px] text-slate-700 dark:text-text-dark-muted text-center">Checked {formatTimestamp(data.checkedAt)}</p>}
      </section>

      <section aria-labelledby="public-heading" className="rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-4 sm:p-6 shadow-card space-y-4">
        <h2 id="public-heading" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-text-dark-muted">Public attributes</h2>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <Attr label="Batch" value={data.batchNumber ?? "Not available"} mono />
          <Attr label="Stream category" value={data.category ? CATEGORY_LABELS[data.category] : "Not available"} />
          <Attr label="Evidence-supported mass" value={formatKg(data.evidenceSupportedKg, "Not available")} mono />
          <Attr label="Share of claim documented" value={data.recoveryRatePercent === undefined ? "Not available" : formatPercent(data.recoveryRatePercent)} />
          <Attr label="Modeled value (estimate)" value={formatMoney(data.estimatedValueUsd, "USD", 0)} mono />
          <Attr label="Recycler" value={data.recyclerName ?? "Not available"} />
          <Attr label="Issued" value={formatTimestamp(data.issuedAt)} />
          <Attr label="Version" value={data.version === undefined ? "Not available" : String(data.version)} />
        </dl>
        <p className="text-[11px] text-slate-700 dark:text-text-dark-muted">The modeled value uses illustrative reference prices and is not a market quotation. Private documents and internal notes are never shown here.</p>

        {data.payloadIntegrity && (
          <dl className="space-y-1.5 font-mono text-[11px] bg-slate-50 dark:bg-darkbg-hover p-4 rounded-2xl border border-slate-200/60 dark:border-darkbg-border">
            <div className="flex flex-col sm:flex-row sm:gap-2"><dt className="text-slate-700 shrink-0">Hash recorded at issuance:</dt><dd className="break-all font-bold">{data.payloadIntegrity.storedSha256}</dd></div>
            <div className="flex flex-col sm:flex-row sm:gap-2"><dt className="text-slate-700 shrink-0">Hash recomputed now:</dt><dd className="break-all font-bold">{data.payloadIntegrity.recomputedSha256}</dd></div>
          </dl>
        )}

        {data.disclaimer && <p className="text-[11px] text-slate-700 dark:text-text-dark-muted leading-relaxed">{data.disclaimer}</p>}
      </section>

      <section aria-labelledby="demo-heading" className="rounded-3xl border border-dashed border-slate-400 dark:border-darkbg-border bg-slate-50/60 dark:bg-darkbg-hover/40 p-4 sm:p-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="demo-heading" className="text-sm font-bold text-slate-900 dark:text-white">Tamper demonstration</h2>
          <SimulatedBadge label="Demonstration" tooltip="Runs on an isolated copy of the payload. Nothing is saved." />
        </div>
        <p className="text-xs text-slate-800 dark:text-text-dark-secondary">
          Copies this passport&apos;s payload in memory, changes one value, and recomputes the hash to show how tampering is detected. The issued passport is never modified or saved;
          it stays verifiable afterwards.
        </p>
        <Button size="sm" variant="outline" onClick={onDemo} isLoading={demoBusy} leftIcon={<Bug className="w-3.5 h-3.5" aria-hidden="true" />}>
          Run tamper demonstration
        </Button>
        {demoError && <p role="alert" className="text-xs text-rose-800">Demonstration failed: {demoError}</p>}
        {demo && (
          <div role="status" className="p-4 rounded-2xl bg-white dark:bg-darkbg-card border border-slate-300 dark:border-darkbg-border text-xs space-y-2">
            <p>
              Altered copy: <span className="font-mono font-bold">{demo.alteredField}</span> {demo.originalValue} → <span className="font-mono font-bold">{demo.alteredValue}</span> (test copy only).
            </p>
            <dl className="font-mono text-[11px] space-y-1">
              <div className="flex flex-col sm:flex-row sm:gap-2"><dt className="text-slate-700 shrink-0">Issued hash:</dt><dd className="break-all">{demo.storedSha256}</dd></div>
              <div className="flex flex-col sm:flex-row sm:gap-2"><dt className="text-slate-700 shrink-0">Altered-copy hash:</dt><dd className="break-all">{demo.alteredPayloadSha256}</dd></div>
            </dl>
            <p className="flex flex-wrap items-center gap-2">
              Integrity check on the altered copy: <IntegrityBadge state={demo.integrityCheck} />
            </p>
            <p className="text-slate-700">
              The real passport above was not touched. Use “Re-check” to confirm it still reports {integrity === "VALID" ? "a matching hash" : "its current state"}.
            </p>
          </div>
        )}
      </section>
    </>
  );
}

function Pillar({ n, title, badge, children }: { n: number; title: string; badge: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="p-4 rounded-2xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-text-dark-muted">
          {n}. {title}
        </h3>
        {badge}
      </div>
      <p className="text-xs text-slate-800 dark:text-text-dark-secondary leading-relaxed">{children}</p>
    </li>
  );
}

function Attr({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="p-3 rounded-2xl bg-slate-50 dark:bg-darkbg-hover border border-slate-200/60 dark:border-darkbg-border min-w-0">
      <dt className="text-slate-700 dark:text-text-dark-muted text-[11px]">{label}</dt>
      <dd className={`font-bold text-slate-900 dark:text-white break-words ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
