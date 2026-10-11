"use client";

import React, { Suspense, useCallback, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, FileText, PlusCircle, RefreshCw, Search, X } from "lucide-react";
import type { Batch } from "@/types";
import { useBatches, useExecutionMode } from "@/lib/hooks";
import {
  BatchFilters,
  CATEGORY_LABELS,
  EMPTY_FILTERS,
  PASSPORT_META,
  RISK_META,
  SortField,
  SortOrder,
  VERIFICATION_STATUS_META,
  filterBatches,
  formatDate,
  formatKg,
  passportLifecycle,
  sortBatches,
} from "@/lib/domain";
import { CategoryBadge, PassportStatusBadge, RiskBadge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { TableRowSkeleton } from "@/components/ui/LoadingSkeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorPanel, ModeNotice } from "@/components/ui/Feedback";

const PAGE_SIZE = 10;
const SORT_FIELDS: { field: SortField; label: string }[] = [
  { field: "date", label: "Collection date" },
  { field: "claimedMass", label: "Claimed mass" },
  { field: "receivedMass", label: "Received mass" },
  { field: "risk", label: "Risk score" },
];

const SELECT_CLASS =
  "w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg-hover text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500";

function readFilters(params: URLSearchParams): BatchFilters {
  return {
    search: params.get("search") ?? "",
    category: params.get("category") ?? "all",
    status: params.get("status") ?? "all",
    risk: params.get("risk") ?? "all",
    passport: params.get("passport") ?? "all",
  };
}

function isSortField(v: string | null): v is SortField {
  return v === "date" || v === "claimedMass" || v === "receivedMass" || v === "risk";
}

export default function BatchesDirectoryPage() {
  // useSearchParams requires a Suspense boundary for static rendering.
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-700">Loading batch directory…</div>}>
      <Directory />
    </Suspense>
  );
}

function Directory() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const mode = useExecutionMode();
  const { data, error, loading, reload } = useBatches();

  const filters = useMemo(() => readFilters(new URLSearchParams(params.toString())), [params]);
  const sortParam = params.get("sort");
  const sortField: SortField = isSortField(sortParam) ? sortParam : "date";
  const sortOrder: SortOrder = params.get("order") === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);

  // Update only the given keys so unrelated filters are never reset.
  const update = useCallback(
    (changes: Record<string, string | null>, resetPage = true) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(changes)) {
        if (v === null || v === "" || v === "all") next.delete(k);
        else next.set(k, v);
      }
      if (resetPage && !("page" in changes)) next.delete("page");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router]
  );

  const batches: Batch[] = useMemo(() => data ?? [], [data]);
  const filtered = useMemo(() => filterBatches(batches, filters), [batches, filters]);
  const sorted = useMemo(() => sortBatches(filtered, sortField, sortOrder), [filtered, sortField, sortOrder]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const chips: { key: string; label: string; clear: Record<string, string | null> }[] = [];
  if (filters.search) chips.push({ key: "search", label: `Search: “${filters.search}”`, clear: { search: null } });
  if (filters.category !== "all")
    chips.push({ key: "category", label: `Category: ${CATEGORY_LABELS[filters.category as keyof typeof CATEGORY_LABELS] ?? filters.category}`, clear: { category: null } });
  if (filters.status !== "all")
    chips.push({
      key: "status",
      label: `Verification: ${VERIFICATION_STATUS_META[filters.status as keyof typeof VERIFICATION_STATUS_META]?.label ?? filters.status}`,
      clear: { status: null },
    });
  if (filters.risk !== "all")
    chips.push({ key: "risk", label: `Risk: ${RISK_META[filters.risk as keyof typeof RISK_META]?.label ?? filters.risk}`, clear: { risk: null } });
  if (filters.passport !== "all")
    chips.push({ key: "passport", label: `Passport: ${PASSPORT_META[filters.passport as keyof typeof PASSPORT_META]?.label ?? filters.passport}`, clear: { passport: null } });

  const clearAll = () => update({ search: null, category: null, status: null, risk: null, passport: null });

  const toggleSort = (field: SortField) => {
    if (field === sortField) update({ order: sortOrder === "asc" ? "desc" : "asc" }, false);
    else update({ sort: field, order: "desc" }, false);
  };

  const goToBatch = (e: React.MouseEvent, id: string) => {
    // Clicks on links/buttons inside the row act on their own; only bare-row clicks navigate.
    if ((e.target as HTMLElement).closest("a, button")) return;
    router.push(`/batches/${encodeURIComponent(id)}`);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-darkbg-border">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">Batch Directory</h1>
          <p className="text-sm text-slate-700 dark:text-text-dark-secondary">
            Search and filter batches. Verification status, risk and passport state are separate columns.
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

      <section aria-label="Search and filters" className="rounded-2xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-4 shadow-card space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="lg:col-span-1">
            <label htmlFor="dir-search" className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-text-dark-muted mb-1">
              Search
            </label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" />
              <input
                id="dir-search"
                type="search"
                placeholder="Batch ID, recycler, destination, passport"
                value={filters.search}
                onChange={(e) => update({ search: e.target.value })}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg-hover text-slate-900 dark:text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
          <div>
            <label htmlFor="dir-category" className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-text-dark-muted mb-1">
              Category
            </label>
            <select id="dir-category" value={filters.category} onChange={(e) => update({ category: e.target.value })} className={SELECT_CLASS}>
              <option value="all">All categories</option>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="dir-status" className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-text-dark-muted mb-1">
              Verification status
            </label>
            <select id="dir-status" value={filters.status} onChange={(e) => update({ status: e.target.value })} className={SELECT_CLASS}>
              <option value="all">All statuses</option>
              {(["SUPPORTED", "REVIEW_REQUIRED", "REJECTED", "PROCESSING", "NOT_VERIFIED"] as const).map((s) => (
                <option key={s} value={s}>{VERIFICATION_STATUS_META[s].label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="dir-risk" className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-text-dark-muted mb-1">
              Risk assessment
            </label>
            <select id="dir-risk" value={filters.risk} onChange={(e) => update({ risk: e.target.value })} className={SELECT_CLASS}>
              <option value="all">All risk levels</option>
              <option value="low">Low (score 25 or below)</option>
              <option value="medium">Medium (26 to 70)</option>
              <option value="high">High (above 70)</option>
            </select>
          </div>
          <div>
            <label htmlFor="dir-passport" className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-text-dark-muted mb-1">
              Passport
            </label>
            <select id="dir-passport" value={filters.passport} onChange={(e) => update({ passport: e.target.value })} className={SELECT_CLASS}>
              <option value="all">Any passport state</option>
              <option value="ACTIVE">Active</option>
              <option value="REVOKED">Revoked</option>
              <option value="NOT_ISSUED">Not issued</option>
            </select>
          </div>
        </div>

        {chips.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-darkbg-border">
            <ul className="flex flex-wrap items-center gap-2" aria-label="Active filters">
              {chips.map((c) => (
                <li key={c.key} className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-mint border border-emerald-300 dark:border-emerald-800 flex items-center gap-1.5 text-xs">
                  <span>{c.label}</span>
                  <button type="button" onClick={() => update(c.clear)} aria-label={`Remove filter ${c.label}`} className="rounded hover:text-rose-700 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" onClick={clearAll} className="text-xs font-bold text-emerald-800 dark:text-mint hover:underline">
              Clear all filters
            </button>
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card shadow-card overflow-hidden">
        <div className="p-4 sm:px-6 border-b border-slate-100 dark:border-darkbg-border flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Batches (<span aria-live="polite">{sorted.length}</span>
              {batches.length !== sorted.length ? ` of ${batches.length}` : ""})
            </h2>
            <p className="text-xs text-slate-700 dark:text-text-dark-muted">Select a batch ID to review reconciliation, findings and evidence.</p>
          </div>
          <div role="group" aria-label="Sort batches" className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-slate-700 dark:text-text-dark-muted mr-1 text-[11px]">Sort by</span>
            {SORT_FIELDS.map(({ field, label }) => {
              const active = sortField === field;
              return (
                <button
                  key={field}
                  type="button"
                  onClick={() => toggleSort(field)}
                  aria-pressed={active}
                  aria-label={active ? `Sort by ${label}, currently ${sortOrder === "asc" ? "ascending" : "descending"}. Activate to reverse.` : `Sort by ${label}`}
                  className={`px-2.5 py-1 rounded-lg font-medium inline-flex items-center gap-1 border ${
                    active
                      ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-mint border-emerald-300 dark:border-emerald-800"
                      : "border-transparent text-slate-700 dark:text-text-dark-secondary hover:bg-slate-100 dark:hover:bg-darkbg-hover"
                  }`}
                >
                  {label}
                  {active ? (sortOrder === "asc" ? <ArrowUp className="w-3 h-3" aria-hidden="true" /> : <ArrowDown className="w-3 h-3" aria-hidden="true" />) : <ArrowUpDown className="w-3 h-3 opacity-50" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[64rem]">
            <caption className="sr-only">Batches with lifecycle masses, verification status, risk and passport state</caption>
            <thead className="bg-slate-50 dark:bg-darkbg-hover/60 text-[11px] uppercase tracking-wider text-slate-700 dark:text-text-dark-muted border-b border-slate-100 dark:border-darkbg-border">
              <tr>
                <th scope="col" className="px-5 py-3.5 font-bold">Batch ID</th>
                <th scope="col" className="px-4 py-3.5 font-bold">Category</th>
                <th scope="col" className="px-4 py-3.5 font-bold">Recycler</th>
                <th scope="col" className="px-4 py-3.5 font-bold">Collected</th>
                <th scope="col" className="px-4 py-3.5 font-bold">Claimed mass</th>
                <th scope="col" className="px-4 py-3.5 font-bold">Received mass</th>
                <th scope="col" className="px-4 py-3.5 font-bold">Processed mass</th>
                <th scope="col" className="px-4 py-3.5 font-bold">Verification status</th>
                <th scope="col" className="px-4 py-3.5 font-bold">Risk assessment</th>
                <th scope="col" className="px-4 py-3.5 font-bold">Passport status</th>
                <th scope="col" className="px-5 py-3.5 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border">
              {loading && !data ? (
                <>
                  <TableRowSkeleton cols={11} />
                  <TableRowSkeleton cols={11} />
                  <TableRowSkeleton cols={11} />
                </>
              ) : error ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-sm text-slate-700 dark:text-text-dark-secondary">
                    Batches could not be loaded. See the error above.
                  </td>
                </tr>
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8">
                    {batches.length === 0 ? (
                      <EmptyState title="No batches yet" description="Submit a batch with evidence to begin verification." actionText="New Batch" actionHref="/batches/new" />
                    ) : (
                      <EmptyState title="No matching batches" description="No batch matches the active search or filters." actionText="Clear all filters" onAction={clearAll} />
                    )}
                  </td>
                </tr>
              ) : (
                pageRows.map((b) => (
                  <tr key={b.id} onClick={(e) => goToBatch(e, b.id)} className="hover:bg-slate-50/80 dark:hover:bg-darkbg-hover/80 cursor-pointer">
                    <th scope="row" className="px-5 py-4 font-mono font-bold text-slate-900 dark:text-emerald-100">
                      <Link href={`/batches/${encodeURIComponent(b.id)}`} className="underline-offset-2 hover:underline focus-visible:underline">
                        {b.batchNumber}
                      </Link>
                    </th>
                    <td className="px-4 py-4"><CategoryBadge category={b.category} /></td>
                    <td className="px-4 py-4 font-medium text-slate-900 dark:text-white max-w-[11rem] truncate" title={b.recyclerName}>{b.recyclerName}</td>
                    <td className="px-4 py-4 whitespace-nowrap">{formatDate(b.collectionDate)}</td>
                    <td className="px-4 py-4">{formatKg(b.massBalance.claimedKg)}</td>
                    <td className="px-4 py-4 font-semibold text-slate-900 dark:text-white">{formatKg(b.massBalance.receivedKg)}</td>
                    <td className="px-4 py-4">{formatKg(b.massBalance.processedKg)}</td>
                    <td className="px-4 py-4"><StatusBadge status={b.status} /></td>
                    <td className="px-4 py-4"><RiskBadge level={b.riskScore.riskLevel} score={b.riskScore.overallScore} /></td>
                    <td className="px-4 py-4"><PassportStatusBadge status={passportLifecycle(b)} passportId={b.passport?.passportId} /></td>
                    <td className="px-5 py-4 text-right whitespace-nowrap">
                      <Link
                        href={`/evidence/${encodeURIComponent(b.id)}`}
                        aria-label={`Inspect evidence for ${b.batchNumber}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-800 dark:text-mint hover:bg-slate-100 dark:hover:bg-darkbg-hover"
                      >
                        <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                        Evidence ({b.documents.length})
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {sorted.length > PAGE_SIZE && (
          <nav aria-label="Pagination" className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-100 dark:border-darkbg-border text-xs">
            <span className="text-slate-700 dark:text-text-dark-secondary">
              Page {currentPage} of {pageCount}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => update({ page: String(currentPage - 1) }, false)}>
                Previous
              </Button>
              <Button size="sm" variant="outline" disabled={currentPage >= pageCount} onClick={() => update({ page: String(currentPage + 1) }, false)}>
                Next
              </Button>
            </div>
          </nav>
        )}
      </section>
    </div>
  );
}
