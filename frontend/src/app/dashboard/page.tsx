"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Layers,
  ShieldCheck,
  AlertTriangle,
  Coins,
  Scale,
  PlusCircle,
  QrCode,
  Search,
  Filter,
  ArrowRight,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  FileText,
  BarChart3,
  PieChart as PieIcon,
  Sparkles,
  Info,
  Table,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { fetchBatches, LiveVerificationError } from "@/lib/api-client";
import { getStoredBatches } from "@/lib/store";
import { computeMetrics } from "@/lib/demo-data";
import { Batch } from "@/types";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge, SeverityBadge, RiskBadge, CategoryBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CardSkeleton } from "@/components/ui/LoadingSkeleton";
import { EmptyState } from "@/components/ui/EmptyState";

export default function DashboardPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"demo" | "live">("demo");
  const [showChartTable, setShowChartTable] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [riskFilter, setRiskFilter] = useState<string>("all");

  const loadBatches = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchBatches();
      setBatches(res.batches);
      setMode(res.mode);
    } catch (err: any) {
      if (err instanceof LiveVerificationError) {
        setError(err.message);
      } else {
        // Fallback for offline demo initial mount
        setBatches(getStoredBatches());
        setMode("demo");
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBatches();
  }, []);

  // Filtered batches
  const filteredBatches = useMemo(() => {
    return batches.filter((b) => {
      const term = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !term ||
        b.batchNumber.toLowerCase().includes(term) ||
        b.recyclerName.toLowerCase().includes(term) ||
        b.originLocation.toLowerCase().includes(term) ||
        (b.passport?.passportId && b.passport.passportId.toLowerCase().includes(term));

      const matchesCategory =
        categoryFilter === "all" || b.category === categoryFilter;

      const matchesStatus =
        statusFilter === "all" || b.status === statusFilter;

      const matchesRisk =
        riskFilter === "all" || b.riskScore.riskLevel === riskFilter;

      return matchesSearch && matchesCategory && matchesStatus && matchesRisk;
    });
  }, [batches, searchTerm, categoryFilter, statusFilter, riskFilter]);

  // Reactive metrics calculated strictly from filtered active batches
  const metrics = useMemo(() => computeMetrics(filteredBatches), [filteredBatches]);

  // Chart 1: Mass Balance Comparison
  const massChartData = useMemo(() => {
    return filteredBatches.map((b) => ({
      name: b.batchNumber,
      "Claimed Mass": b.claimedQuantity,
      "Received Mass": b.massBalance.receivedKg || b.massBalance.evidenceSupportedKg,
    }));
  }, [filteredBatches]);

  // Chart 2: Status Distribution
  const statusPieData = useMemo(() => {
    const supported = filteredBatches.filter((b) => b.status === "SUPPORTED").length;
    const review = filteredBatches.filter((b) => b.status === "REVIEW_REQUIRED").length;
    const rejected = filteredBatches.filter((b) => b.status === "REJECTED").length;
    const processing = filteredBatches.filter((b) => b.status === "PROCESSING").length;

    return [
      { name: "Supported", value: supported, color: "#059669" },
      { name: "Review Required", value: review, color: "#F59E0B" },
      { name: "Rejected", value: rejected, color: "#F43F5E" },
      { name: "Processing", value: processing, color: "#0284C7" },
    ].filter((item) => item.value > 0);
  }, [filteredBatches]);

  // Operational Investigation Queue items (Active findings requiring review)
  const investigationQueue = useMemo(() => {
    const list: {
      batch: Batch;
      finding: Batch["findings"][0];
      quantityDifference?: string;
      missingEvidence?: string;
    }[] = [];

    filteredBatches.forEach((b) => {
      b.findings.forEach((f) => {
        if (f.severity === "critical" || f.severity === "warning" || b.status === "REVIEW_REQUIRED") {
          let diffStr: string | undefined = undefined;
          if (b.massBalance.discrepancyKg > 0) {
            diffStr = `Claimed: ${b.claimedQuantity.toLocaleString()} kg | Recorded receipt: ${b.massBalance.receivedKg.toLocaleString()} kg | Difference: ${b.massBalance.discrepancyKg.toLocaleString()} kg`;
          }

          let missingGap: string | undefined = undefined;
          if (f.title.toLowerCase().includes("missing") || f.sourceDocumentName === "Missing Document") {
            missingGap = f.description.includes("Invoice")
              ? "Certified Final Processing Record missing"
              : "Required documentary proof missing";
          }

          list.push({
            batch: b,
            finding: f,
            quantityDifference: diffStr,
            missingEvidence: missingGap,
          });
        }
      });
    });
    return list;
  }, [filteredBatches]);

  const { criticalCount, warningCount } = useMemo(() => {
    let critical = 0;
    let warning = 0;
    investigationQueue.forEach(({ finding }) => {
      if (finding.severity === "critical") critical++;
      if (finding.severity === "warning") warning++;
    });
    return { criticalCount: critical, warningCount: warning };
  }, [investigationQueue]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
      {/* Page Title & Environment Status */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-darkbg-border">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              Operational Intelligence Dashboard
            </h1>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${
                mode === "live"
                  ? "bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border-sky-300 dark:border-sky-800"
                  : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-mint border-emerald-300 dark:border-emerald-800"
              }`}
            >
              {mode === "live" ? "Live Verification API" : "Synthetic Demo Provider"}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-text-dark-secondary mt-1">
            Real-time mass-balance reconciliation, documentary risk monitoring, and recoverable material asset valuation.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            size="sm"
            variant="outline"
            leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />}
            onClick={loadBatches}
            aria-label="Refresh operational metrics"
          >
            Refresh
          </Button>
          <Link href="/batches/new">
            <Button size="sm" variant="primary" leftIcon={<PlusCircle className="w-4 h-4" />}>
              Create New Intake
            </Button>
          </Link>
        </div>
      </div>

      {/* Error state if Live Mode failure occurs (No silent fallback in live mode) */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800/80 text-rose-800 dark:text-rose-200 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600 dark:text-coral" />
          <div className="flex-1 text-xs">
            <strong className="font-bold">Live Verification Unreachable:</strong> {error}
            <p className="mt-1 opacity-80">
              Demo fallback is explicitly disabled in Live Mode to prevent silent falsification of compliance results.
            </p>
          </div>
          <Button size="sm" variant="danger" onClick={loadBatches}>
            Retry Live Server
          </Button>
        </div>
      )}

      {/* SECTION A: 4 PRIMARY KPI SUMMARY CARDS */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <StatCard
            title="Total Batches"
            value={metrics.totalBatches}
            subtitle={`${metrics.supportedBatchesCount} supported / ${metrics.batchesRequiringReview} review required`}
            icon={Layers}
            accentColor="emerald"
            badge="Portfolio"
            badgeVariant="positive"
          />
          <StatCard
            title="Batches Requiring Review"
            value={metrics.batchesRequiringReview}
            subtitle={`${criticalCount} critical findings / ${warningCount} warnings`}
            icon={AlertTriangle}
            accentColor="amber"
            badge={metrics.batchesRequiringReview > 0 ? "Review Required" : "Clean"}
            badgeVariant={metrics.batchesRequiringReview > 0 ? "warning" : "positive"}
          />
          <StatCard
            title="Evidence-Supported Received Mass"
            value={`${(metrics.evidenceSupportedKg / 1000).toFixed(1)} t`}
            subtitle={`${metrics.evidenceSupportedKg.toLocaleString()} kg supported by weighbridge tickets`}
            icon={Scale}
            accentColor="turquoise"
            badge="Received Stage"
            badgeVariant="positive"
          />
          <StatCard
            title="Estimated Recovery Value"
            value={`$${metrics.estimatedRecoveryValueUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            subtitle="Illustrative valuation based on LME/COMEX 2025.1 dataset"
            icon={Coins}
            accentColor="violet"
            badge="USD Modeled"
            badgeVariant="violet"
          />
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-4 shadow-card">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search batch, recycler, location, passport..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg-hover text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              aria-label="Filter batches"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg-hover text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            aria-label="Filter by e-waste category"
          >
            <option value="all">All E-Waste Categories</option>
            <option value="it_telecom">IT & Telecommunications</option>
            <option value="consumer_electronics">Consumer Electronics</option>
            <option value="large_appliances">Large Appliances</option>
            <option value="small_appliances">Small Appliances</option>
            <option value="batteries">Batteries</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg-hover text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            aria-label="Filter by verification status"
          >
            <option value="all">All Verification Statuses</option>
            <option value="SUPPORTED">Supported</option>
            <option value="REVIEW_REQUIRED">Review Required</option>
            <option value="REJECTED">Rejected</option>
          </select>

          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg-hover text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            aria-label="Filter by risk assessment"
          >
            <option value="all">All Risk Levels</option>
            <option value="low">Low Risk (&le; 25)</option>
            <option value="medium">Medium Risk (26&ndash;70)</option>
            <option value="high">High Risk (&gt; 70)</option>
          </select>
        </div>

        {/* Clear filters shortcut */}
        {(searchTerm || categoryFilter !== "all" || statusFilter !== "all" || riskFilter !== "all") && (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-darkbg-border flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-text-dark-secondary">
              Active filters showing <strong>{filteredBatches.length}</strong> of {batches.length} batches
            </span>
            <button
              onClick={() => {
                setSearchTerm("");
                setCategoryFilter("all");
                setStatusFilter("all");
                setRiskFilter("all");
              }}
              className="font-bold text-emerald-600 dark:text-mint hover:underline"
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>

      {/* SECTION B: INVESTIGATION QUEUE (PRIMARY OPERATIONAL SECTION) */}
      <section className="rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-6 shadow-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-100 dark:border-darkbg-border">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Active Investigations Queue
            </h2>
            <p className="text-xs text-slate-500 dark:text-text-dark-muted mt-0.5">
              Identifies what needs attention, the exact quantity variance or missing evidence, and the immediate auditor next action.
            </p>
          </div>
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shrink-0 w-fit">
            {investigationQueue.length} items flagged for review
          </span>
        </div>

        <div className="space-y-3">
          {investigationQueue.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              All active batches are within policy tolerances. No open discrepancies in the queue.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {investigationQueue.map(({ batch, finding, quantityDifference, missingEvidence }) => (
                <div
                  key={`${batch.id}-${finding.id}`}
                  className="p-4 rounded-2xl border border-slate-200/80 dark:border-darkbg-border bg-slate-50/70 dark:bg-darkbg-hover/60 hover:border-amber-400/80 transition-all flex flex-col justify-between space-y-3 shadow-xs"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                          {batch.batchNumber}
                        </span>
                        <CategoryBadge category={batch.category} />
                      </div>
                      <SeverityBadge severity={finding.severity} />
                    </div>

                    <div>
                      <h3 className="text-xs font-bold text-slate-900 dark:text-emerald-100 leading-snug">
                        {finding.title}
                      </h3>
                      <p className="text-[11px] text-slate-600 dark:text-text-dark-secondary leading-relaxed mt-1">
                        {finding.description}
                      </p>
                    </div>

                    {/* Explicit Quantity Difference Card */}
                    {quantityDifference && (
                      <div className="p-2.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-[11px] font-mono text-amber-900 dark:text-amber-200">
                        <span className="font-sans font-bold block text-[10px] text-amber-700 dark:text-amber-300 uppercase tracking-wider mb-0.5">
                          Quantity Difference:
                        </span>
                        {quantityDifference}
                      </div>
                    )}

                    {/* Missing Evidence Gap Alert */}
                    {missingEvidence && (
                      <div className="p-2 rounded-xl bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 text-[11px] text-rose-800 dark:text-rose-200 flex items-center gap-1.5 font-medium">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                        <span>Evidence Gap: {missingEvidence}</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-200/60 dark:border-darkbg-border flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={batch.status} />
                      <RiskBadge level={batch.riskScore.riskLevel} score={batch.riskScore.overallScore} />
                    </div>

                    <Link
                      href={`/batches/${batch.id}`}
                      className="font-bold text-emerald-600 dark:text-mint hover:underline flex items-center gap-1 text-xs shrink-0"
                    >
                      Review Finding <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* SECTION C: RECHARTS ANALYTICS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Chart 1: Mass Balance Comparison */}
        <div className="lg:col-span-8 rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-6 shadow-card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-100 dark:border-darkbg-border">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-600 dark:text-mint" />
                Mass Balance Reconciliation (Claimed vs Received Mass kg)
              </h3>
              <p className="text-xs text-slate-400 dark:text-text-dark-muted mt-0.5">
                Compares customer-declared mass with certified weighbridge receipt measurements
              </p>
            </div>
            <button
              onClick={() => setShowChartTable(!showChartTable)}
              className="text-xs text-emerald-600 dark:text-mint hover:underline flex items-center gap-1 self-start sm:self-auto"
            >
              <Table className="w-3 h-3" />
              <span>{showChartTable ? "Hide Table" : "View Table"}</span>
            </button>
          </div>

          {showChartTable ? (
            <div className="overflow-x-auto max-h-72">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-darkbg-hover text-slate-500 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="p-2 font-bold">Batch ID</th>
                    <th className="p-2 font-bold">Claimed Mass (kg)</th>
                    <th className="p-2 font-bold">Received Mass (kg)</th>
                    <th className="p-2 font-bold">Difference (kg)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border">
                  {filteredBatches.map((b) => (
                    <tr key={b.id}>
                      <td className="p-2 font-mono font-bold">{b.batchNumber}</td>
                      <td className="p-2">{b.claimedQuantity.toLocaleString()} kg</td>
                      <td className="p-2 text-emerald-600 dark:text-mint font-bold">
                        {b.massBalance.receivedKg.toLocaleString()} kg
                      </td>
                      <td className="p-2 text-amber-600 dark:text-amber-400 font-bold">
                        {b.massBalance.discrepancyKg > 0 ? `${b.massBalance.discrepancyKg.toLocaleString()} kg` : "0 kg"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="h-64 sm:h-72 w-full pt-2">
              {filteredBatches.length === 0 ? (
                <EmptyState title="No batches available" description="No batch records match current filters." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={massChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <XAxis dataKey="name" stroke="#888888" fontSize={11} tickLine={false} />
                    <YAxis stroke="#888888" fontSize={11} tickLine={false} tickFormatter={(val) => `${val / 1000}t`} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "rgba(18, 30, 23, 0.95)",
                        borderRadius: "12px",
                        border: "1px solid #1F3628",
                        color: "#F2F7F4",
                        fontSize: "12px",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                    <Bar dataKey="Claimed Mass" fill="#38BDF8" radius={[6, 6, 0, 0]} name="Claimed Mass (kg)" />
                    <Bar dataKey="Received Mass" fill="#059669" radius={[6, 6, 0, 0]} name="Received Mass (kg)" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          )}
        </div>

        {/* Chart 2: Status Distribution Pie */}
        <div className="lg:col-span-4 rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-6 shadow-card space-y-4">
          <div className="pb-3 border-b border-slate-100 dark:border-darkbg-border">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <PieIcon className="w-4 h-4 text-emerald-600 dark:text-mint" />
              Verification Status Split
            </h3>
            <p className="text-xs text-slate-400 dark:text-text-dark-muted mt-0.5">
              Auditor documentary compliance breakdown
            </p>
          </div>

          <div className="h-48 sm:h-56 w-full flex items-center justify-center">
            {statusPieData.length === 0 ? (
              <EmptyState title="No status data" description="Adjust filters to view distribution." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {statusPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(18, 30, 23, 0.95)",
                      borderRadius: "12px",
                      border: "1px solid #1F3628",
                      color: "#F2F7F4",
                      fontSize: "12px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-darkbg-border text-center text-xs text-slate-500 dark:text-text-dark-muted">
            Eligible for Passport Issuance: <strong className="text-emerald-600 dark:text-mint">{metrics.supportedBatchesCount}</strong> of {metrics.totalBatches}
          </div>
        </div>
      </div>

      {/* SECTION D: RECENT BATCHES COMPACT DIRECTORY */}
      <section className="rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-6 shadow-card space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-darkbg-border">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-emerald-600 dark:text-mint" />
              Recent Batches
            </h2>
            <p className="text-xs text-slate-400 dark:text-text-dark-muted mt-0.5">
              Compact overview of active batches with lifecycle quantities
            </p>
          </div>
          <Link
            href="/batches"
            className="text-xs font-bold text-emerald-600 dark:text-mint hover:underline flex items-center gap-1"
          >
            View Full Directory <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-text-dark-muted border-b border-slate-100 dark:border-darkbg-border">
              <tr>
                <th className="pb-2.5 font-semibold">Batch ID</th>
                <th className="pb-2.5 font-semibold">Category</th>
                <th className="pb-2.5 font-semibold">Recycler</th>
                <th className="pb-2.5 font-semibold">Claimed Mass</th>
                <th className="pb-2.5 font-semibold">Received Mass</th>
                <th className="pb-2.5 font-semibold">Status</th>
                <th className="pb-2.5 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border">
              {filteredBatches.slice(0, 5).map((b) => (
                <tr key={b.id} className="hover:bg-slate-50/60 dark:hover:bg-darkbg-hover transition-colors">
                  <td className="py-3 font-mono font-bold text-slate-900 dark:text-emerald-100">
                    <Link href={`/batches/${b.id}`} className="hover:text-emerald-600 dark:hover:text-mint">
                      {b.batchNumber}
                    </Link>
                  </td>
                  <td className="py-3">
                    <CategoryBadge category={b.category} />
                  </td>
                  <td className="py-3 text-slate-600 dark:text-text-dark-secondary max-w-[150px] truncate">
                    {b.recyclerName}
                  </td>
                  <td className="py-3 text-slate-900 dark:text-white font-medium">
                    {b.claimedQuantity.toLocaleString()} {b.unit}
                  </td>
                  <td className="py-3 font-bold text-emerald-600 dark:text-mint">
                    {b.massBalance.receivedKg.toLocaleString()} kg
                  </td>
                  <td className="py-3">
                    <StatusBadge status={b.status} />
                  </td>
                  <td className="py-3 text-right">
                    <Link href={`/batches/${b.id}`}>
                      <Button size="sm" variant="ghost">
                        Details
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
