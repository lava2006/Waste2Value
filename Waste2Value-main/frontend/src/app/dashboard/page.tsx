"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Coins,
  Layers,
  PieChart as PieIcon,
  PlusCircle,
  RefreshCw,
  Scale,
  Table as TableIcon,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Batch } from "@/types";
import { useBatches, useExecutionMode } from "@/lib/hooks";
import {
  CATEGORY_LABELS,
  QueueItem,
  QueueSection,
  VERIFICATION_STATUS_META,
  buildInvestigationQueue,
  computeDashboardMetrics,
  formatDate,
  formatKg,
  formatMoney,
  formatTonnes,
  massChartRows,
  statusCounts,
  NOT_RECORDED,
} from "@/lib/domain";
import { StatCard } from "@/components/ui/StatCard";
import { CategoryBadge, RiskBadge, SeverityBadge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CardSkeleton } from "@/components/ui/LoadingSkeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorPanel, ModeNotice } from "@/components/ui/Feedback";

const STATUS_COLORS: Record<string, string> = {
  SUPPORTED: "#059669",
  REVIEW_REQUIRED: "#D97706",
  REJECTED: "#E11D48",
  PROCESSING: "#0284C7",
  NOT_VERIFIED: "#64748B",
  REVOKED: "#7C3AED",
};

const SECTION_META: Record<QueueSection, { title: string; description: string }> = {
  review_required: {
    title: "Review required",
    description: "Batches awaiting a human auditor. Findings here are not rejections.",
  },
  rejected_followup: {
    title: "Rejected cases requiring authorized follow-up",
    description: "An authorized decision rejected these batches. The findings below are historical context for follow-up.",
  },
  historical: {
    title: "Other unresolved historical findings",
    description: "Batches that are no longer in review but still carry warning or critical findings.",
  },
};

const TOOLTIP_STYLE = {
  backgroundColor: "rgba(18, 30, 23, 0.97)",
  borderRadius: "12px",
  border: "1px solid #1F3628",
  color: "#F2F7F4",
  fontSize: "12px",
} as const;

export default function DashboardPage() {
  const mode = useExecutionMode();
  const { data, error, loading, reload } = useBatches();
  const [showMassTable, setShowMassTable] = useState(false);
  const [showStatusTable, setShowStatusTable] = useState(false);
  const batches: Batch[] = useMemo(() => data ?? [], [data]);

  const metrics = useMemo(() => computeDashboardMetrics(batches), [batches]);
  const queue = useMemo(() => buildInvestigationQueue(batches), [batches]);
  const massRows = useMemo(() => massChartRows(batches), [batches]);
  const counts = useMemo(() => statusCounts(batches), [batches]);
  const recent = useMemo(
    () => [...batches].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, 5),
    [batches]
  );
  const estimateRef = batches.find((b) => b.materialEstimate.isAvailable)?.materialEstimate;

  const queueSections = (["review_required", "rejected_followup", "historical"] as QueueSection[])
    .map((section) => ({ section, items: queue.filter((q) => q.section === section) }))
    .filter((s) => s.items.length > 0);

  const massChartHasData = massRows.some((r) => r.receivedKg !== null || r.processedKg !== null);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-darkbg-border">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">Operational Overview</h1>
          <p className="text-sm text-slate-700 dark:text-text-dark-secondary">
            Operational priorities first: what needs review, what the evidence supports, and the modeled value attached to it.
          </p>
          <ModeNotice mode={mode} />
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            size="sm"
            variant="outline"
            leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? "motion-safe:animate-spin" : ""}`} aria-hidden="true" />}
            onClick={reload}
            disabled={loading}
          >
            Refresh
          </Button>
          <Link href="/batches/new">
            <Button size="sm" variant="primary" leftIcon={<PlusCircle className="w-4 h-4" aria-hidden="true" />}>
              New Batch
            </Button>
          </Link>
        </div>
      </div>

      {error && <ErrorPanel title="Could not load batches" message={error} onRetry={reload} mode={mode} />}

      {/* FIRST: KPI cards */}
      <section aria-labelledby="kpi-heading" className="space-y-3">
        <h2 id="kpi-heading" className="sr-only">
          Key metrics
        </h2>
        {loading && !data ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : !error && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
            <StatCard
              title="Total batches"
              value={metrics.totalBatches}
              subtitle={`${metrics.supportedBatchesCount} evidence supported · ${metrics.reviewRequiredCount} review required · ${metrics.rejectedCount} rejected`}
              notes={["Counts every batch in the current dataset regardless of verification status."]}
              icon={Layers}
              accentColor="emerald"
            />
            <StatCard
              title="Batches requiring review"
              value={metrics.batchesRequiringReview}
              subtitle={`${metrics.criticalFindings} critical and ${metrics.warningFindings} warning findings across all batches`}
              notes={[
                metrics.rejectedCount > 0
                  ? `${metrics.rejectedCount} rejected case${metrics.rejectedCount === 1 ? "" : "s"} listed separately (authorized follow-up).`
                  : "Status = Review Required. Rejected batches are counted separately.",
              ]}
              icon={AlertTriangle}
              accentColor="amber"
            />
            <StatCard
              title="Evidence-supported received mass"
              value={formatTonnes(metrics.supportedReceivedKg)}
              subtitle={`${formatKg(metrics.supportedReceivedKg)} recorded at weighbridge intake on ${metrics.supportedBatchesWithReceived} of ${metrics.supportedBatchesCount} evidence-supported batches`}
              notes={[
                "Received stage only: not processed or recovered mass.",
                metrics.unverifiedReceivedKg > 0
                  ? `Not counted: ${formatKg(metrics.unverifiedReceivedKg)} documented on batches that are not evidence supported.`
                  : "No received mass is documented on unverified batches.",
                ...(metrics.batchesMissingReceived > 0 ? [`${metrics.batchesMissingReceived} batch(es) have no received mass recorded (unknown, not zero).`] : []),
              ]}
              icon={Scale}
              accentColor="turquoise"
            />
            <StatCard
              title="Estimated recovery value"
              value={formatMoney(metrics.supportedValueUsd)}
              subtitle="Net modeled value on evidence-supported batches only"
              notes={[
                `Illustrative reference prices${estimateRef ? ` (${estimateRef.datasetVersion}, ${formatDate(estimateRef.referencePriceDate)})` : ""}, not live quotes. Net of modeled processing cost.`,
                metrics.unverifiedValueUsd > 0
                  ? `Not counted: ${formatMoney(metrics.unverifiedValueUsd)} modeled on batches that are not evidence supported.`
                  : "No modeled value is attached to unverified batches.",
              ]}
              icon={Coins}
              accentColor="violet"
            />
          </div>
        )}
      </section>

      {/* SECOND: Active investigation queue */}
      <section aria-labelledby="queue-heading" className="rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-4 sm:p-6 shadow-card space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-100 dark:border-darkbg-border">
          <div>
            <h2 id="queue-heading" className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" aria-hidden="true" />
              Active investigations queue
            </h2>
            <p className="text-xs text-slate-700 dark:text-text-dark-muted mt-0.5">
              Each item links to the exact finding. Quantities shown are only those the evidence records.
            </p>
          </div>
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-800 shrink-0 w-fit">
            {queue.length} finding{queue.length === 1 ? "" : "s"} to follow up
          </span>
        </div>

        {loading && !data ? (
          <CardSkeleton />
        ) : queue.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-700 dark:text-text-dark-secondary">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" aria-hidden="true" />
            {error ? "Queue unavailable while data failed to load." : "No batch carries an unresolved warning or critical finding."}
          </div>
        ) : (
          queueSections.map(({ section, items }) => (
            <div key={section} className="space-y-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {SECTION_META[section].title} <span className="font-normal text-slate-600 dark:text-text-dark-muted">({items.length})</span>
                </h3>
                <p className="text-xs text-slate-600 dark:text-text-dark-muted">{SECTION_META[section].description}</p>
              </div>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {items.map((item) => (
                  <QueueCard key={`${item.batch.id}-${item.finding.id}`} item={item} />
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      {/* THIRD: Analytics */}
      <section aria-labelledby="analytics-heading" className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <h2 id="analytics-heading" className="sr-only">
          Analytics
        </h2>
        <div className="lg:col-span-8 rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-4 sm:p-6 shadow-card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 pb-3 border-b border-slate-100 dark:border-darkbg-border">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-700 dark:text-mint" aria-hidden="true" />
                Lifecycle quantities by batch (kg)
              </h3>
              <p className="text-xs text-slate-700 dark:text-text-dark-muted mt-0.5">
                Claimed, received (weighbridge) and processed (certificate) are different stages and are not expected to be equal. A missing bar means the stage is not recorded, not zero.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowMassTable((s) => !s)}
              aria-expanded={showMassTable}
              className="text-xs font-semibold text-emerald-800 dark:text-mint hover:underline inline-flex items-center gap-1 self-start shrink-0"
            >
              <TableIcon className="w-3 h-3" aria-hidden="true" />
              {showMassTable ? "Hide data table" : "Show data table"}
            </button>
          </div>

          {massRows.length === 0 ? (
            <EmptyState title="No batches yet" description="Create a batch to see lifecycle quantities." actionText="New Batch" actionHref="/batches/new" />
          ) : (
            <>
              <figure
                aria-label={`Bar chart of claimed, received and processed kilograms for ${massRows.length} batches. ${
                  massChartHasData ? "Use the data table for exact values." : "No received or processed quantities are recorded yet."
                }`}
                role="img"
                className={`h-64 sm:h-72 w-full ${showMassTable ? "hidden" : ""}`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={massRows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94A3B8" strokeOpacity={0.25} />
                    <XAxis dataKey="batchNumber" stroke="#64748B" fontSize={11} tickLine={false} />
                    <YAxis stroke="#64748B" fontSize={11} tickLine={false} tickFormatter={(v: number) => `${v / 1000} t`} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number | string) => (typeof v === "number" ? `${v.toLocaleString("en-US")} kg` : NOT_RECORDED)} />
                    <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                    <Bar dataKey="claimedKg" name="Claimed mass (kg)" fill="#0284C7" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="receivedKg" name="Received mass (kg)" fill="#059669" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="processedKg" name="Processed input mass (kg)" fill="#7C3AED" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </figure>
              {showMassTable && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <caption className="sr-only">Claimed, received and processed mass per batch in kilograms</caption>
                    <thead className="bg-slate-50 dark:bg-darkbg-hover text-slate-700 dark:text-text-dark-muted uppercase tracking-wider text-[11px]">
                      <tr>
                        <th scope="col" className="p-2 font-bold">Batch</th>
                        <th scope="col" className="p-2 font-bold">Claimed</th>
                        <th scope="col" className="p-2 font-bold">Received</th>
                        <th scope="col" className="p-2 font-bold">Processed input</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border">
                      {massRows.map((r) => (
                        <tr key={r.batchNumber}>
                          <th scope="row" className="p-2 font-mono font-bold">{r.batchNumber}</th>
                          <td className="p-2">{formatKg(r.claimedKg)}</td>
                          <td className="p-2">{formatKg(r.receivedKg)}</td>
                          <td className="p-2">{formatKg(r.processedKg)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        <div className="lg:col-span-4 rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-4 sm:p-6 shadow-card space-y-4">
          <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-100 dark:border-darkbg-border">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <PieIcon className="w-4 h-4 text-emerald-700 dark:text-mint" aria-hidden="true" />
                Verification status
              </h3>
              <p className="text-xs text-slate-700 dark:text-text-dark-muted mt-0.5">Batches by documentary status.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowStatusTable((s) => !s)}
              aria-expanded={showStatusTable}
              className="text-xs font-semibold text-emerald-800 dark:text-mint hover:underline inline-flex items-center gap-1 shrink-0"
            >
              <TableIcon className="w-3 h-3" aria-hidden="true" />
              {showStatusTable ? "Hide table" : "Show table"}
            </button>
          </div>

          {counts.length === 0 ? (
            <EmptyState title="No status data" description="Status distribution appears once batches exist." />
          ) : showStatusTable ? (
            <table className="w-full text-left text-xs">
              <caption className="sr-only">Number of batches per verification status</caption>
              <thead className="text-slate-700 dark:text-text-dark-muted uppercase tracking-wider text-[11px]">
                <tr>
                  <th scope="col" className="p-2 font-bold">Status</th>
                  <th scope="col" className="p-2 font-bold">Batches</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border">
                {counts.map((c) => (
                  <tr key={c.status}>
                    <th scope="row" className="p-2 font-semibold">{VERIFICATION_STATUS_META[c.status].label}</th>
                    <td className="p-2">{c.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <figure
              role="img"
              aria-label={`Doughnut chart of batches by verification status: ${counts.map((c) => `${VERIFICATION_STATUS_META[c.status].label} ${c.count}`).join(", ")}`}
              className="h-56 w-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={counts.map((c) => ({ name: VERIFICATION_STATUS_META[c.status].label, value: c.count, status: c.status }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={78}
                    paddingAngle={4}
                    dataKey="value"
                    nameKey="name"
                  >
                    {counts.map((c) => (
                      <Cell key={c.status} fill={STATUS_COLORS[c.status]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                </PieChart>
              </ResponsiveContainer>
            </figure>
          )}
          <p className="pt-2 border-t border-slate-100 dark:border-darkbg-border text-center text-xs text-slate-700 dark:text-text-dark-muted">
            Eligible to issue a passport (evidence supported, none issued yet):{" "}
            <strong className="text-emerald-800 dark:text-mint">
              {batches.filter((b) => b.status === "SUPPORTED" && !b.passport).length}
            </strong>
          </p>
        </div>
      </section>

      {/* FOURTH: Recent batches */}
      <section aria-labelledby="recent-heading" className="rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-4 sm:p-6 shadow-card space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-darkbg-border">
          <div>
            <h2 id="recent-heading" className="text-base font-bold text-slate-900 dark:text-white">Recent batches</h2>
            <p className="text-xs text-slate-700 dark:text-text-dark-muted mt-0.5">Most recently updated, with lifecycle stage named per column.</p>
          </div>
          <Link href="/batches" className="text-xs font-bold text-emerald-800 dark:text-mint hover:underline flex items-center gap-1 shrink-0">
            View all batches <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </div>

        {recent.length === 0 ? (
          <EmptyState title="No batches" description="Create the first batch to start verification." actionText="New Batch" actionHref="/batches/new" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[44rem]">
              <caption className="sr-only">Most recently updated batches</caption>
              <thead className="text-[11px] uppercase tracking-wider text-slate-700 dark:text-text-dark-muted border-b border-slate-100 dark:border-darkbg-border">
                <tr>
                  <th scope="col" className="pb-2.5 font-semibold">Batch</th>
                  <th scope="col" className="pb-2.5 font-semibold">Category</th>
                  <th scope="col" className="pb-2.5 font-semibold">Claimed mass</th>
                  <th scope="col" className="pb-2.5 font-semibold">Received mass</th>
                  <th scope="col" className="pb-2.5 font-semibold">Verification</th>
                  <th scope="col" className="pb-2.5 font-semibold">Risk</th>
                  <th scope="col" className="pb-2.5 font-semibold">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border">
                {recent.map((b) => (
                  <tr key={b.id}>
                    <th scope="row" className="py-3 font-mono font-bold text-slate-900 dark:text-emerald-100">
                      <Link href={`/batches/${encodeURIComponent(b.id)}`} className="hover:underline">
                        {b.batchNumber}
                      </Link>
                    </th>
                    <td className="py-3"><CategoryBadge category={b.category} /></td>
                    <td className="py-3">{formatKg(b.massBalance.claimedKg)}</td>
                    <td className="py-3">{formatKg(b.massBalance.receivedKg)}</td>
                    <td className="py-3"><StatusBadge status={b.status} /></td>
                    <td className="py-3"><RiskBadge level={b.riskScore.riskLevel} /></td>
                    <td className="py-3 whitespace-nowrap">{formatDate(b.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function QueueCard({ item }: { item: QueueItem }) {
  const { batch, finding } = item;
  return (
    <li className="p-4 rounded-2xl border border-slate-200/80 dark:border-darkbg-border bg-slate-50/70 dark:bg-darkbg-hover/60 flex flex-col justify-between gap-3">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/batches/${encodeURIComponent(batch.id)}`} className="font-mono text-xs font-bold text-slate-900 dark:text-white hover:underline">
              {batch.batchNumber}
            </Link>
            <span className="text-[11px] text-slate-600 dark:text-text-dark-muted">{CATEGORY_LABELS[batch.category]}</span>
          </div>
          <SeverityBadge severity={finding.severity} />
        </div>
        <div>
          <h4 className="text-xs font-bold text-slate-900 dark:text-emerald-100 leading-snug">{finding.title}</h4>
          <p className="text-xs text-slate-700 dark:text-text-dark-secondary leading-relaxed mt-1">{finding.description}</p>
        </div>
        {item.quantityNote && (
          <p className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-900/60 text-[11px] text-amber-950 dark:text-amber-100">
            <span className="font-bold">Quantity difference: </span>
            {item.quantityNote}
          </p>
        )}
        {item.missingEvidence && (
          <p className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-900/60 text-[11px] text-rose-950 dark:text-rose-100 flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              <span className="font-bold">Missing or unrecorded evidence: </span>
              {item.missingEvidence}
            </span>
          </p>
        )}
        <p className="text-[11px] text-slate-800 dark:text-slate-200">
          <span className="font-bold">Next action: </span>
          {item.nextAction}
        </p>
      </div>
      <div className="pt-2 border-t border-slate-200/60 dark:border-darkbg-border flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={batch.status} />
          <RiskBadge level={batch.riskScore.riskLevel} />
        </div>
        <Link
          href={item.href}
          aria-label={`Review finding "${finding.title}" on ${batch.batchNumber}`}
          className="font-bold text-emerald-800 dark:text-mint hover:underline inline-flex items-center gap-1 text-xs shrink-0"
        >
          Review finding <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </Link>
      </div>
    </li>
  );
}
