"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Layers,
  Search,
  Filter,
  PlusCircle,
  ArrowUpDown,
  FileText,
  ShieldCheck,
  ExternalLink,
  QrCode,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  Cpu,
  X,
} from "lucide-react";
import { fetchBatches, LiveVerificationError } from "@/lib/api-client";
import { getStoredBatches } from "@/lib/store";
import { Batch } from "@/types";
import { StatusBadge, RiskBadge, CategoryBadge, PassportStatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { TableRowSkeleton } from "@/components/ui/LoadingSkeleton";
import { EmptyState } from "@/components/ui/EmptyState";

type SortField = "date" | "claimedMass" | "receivedMass" | "risk";

export default function BatchesDirectoryPage() {
  const router = useRouter();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search and Multi-Filters
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [risk, setRisk] = useState("all");

  // Sorting
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const loadBatches = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchBatches();
      setBatches(res.batches);
    } catch (err: any) {
      if (err instanceof LiveVerificationError) {
        setError(err.message);
      } else {
        setBatches(getStoredBatches());
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBatches();
  }, []);

  // Multi-Filter & Search Logic (Works additively across all fields)
  const filteredAndSortedBatches = useMemo(() => {
    const term = search.trim().toLowerCase();

    return batches
      .filter((b) => {
        const matchesSearch =
          !term ||
          b.batchNumber.toLowerCase().includes(term) ||
          b.recyclerName.toLowerCase().includes(term) ||
          b.category.toLowerCase().includes(term) ||
          b.originLocation.toLowerCase().includes(term) ||
          b.destinationLocation.toLowerCase().includes(term) ||
          (b.passport?.passportId && b.passport.passportId.toLowerCase().includes(term));

        const matchesCategory = category === "all" || b.category === category;
        const matchesStatus = status === "all" || b.status === status;
        const matchesRisk = risk === "all" || b.riskScore.riskLevel === risk;

        return matchesSearch && matchesCategory && matchesStatus && matchesRisk;
      })
      .sort((a, b) => {
        let diff = 0;
        if (sortField === "date") {
          diff = new Date(a.collectionDate).getTime() - new Date(b.collectionDate).getTime();
        } else if (sortField === "claimedMass") {
          diff = a.claimedQuantity - b.claimedQuantity;
        } else if (sortField === "receivedMass") {
          diff = (a.massBalance.receivedKg || 0) - (b.massBalance.receivedKg || 0);
        } else if (sortField === "risk") {
          diff = a.riskScore.overallScore - b.riskScore.overallScore;
        }
        return sortOrder === "asc" ? diff : -diff;
      });
  }, [batches, search, category, status, risk, sortField, sortOrder]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const handleClearFilters = () => {
    setSearch("");
    setCategory("all");
    setStatus("all");
    setRisk("all");
  };

  const hasActiveFilters = search || category !== "all" || status !== "all" || risk !== "all";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-darkbg-border">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
            Batch Directory & Records
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-text-dark-secondary mt-1">
            Search, filter, and audit batches with explicit lifecycle masses and authoritative passport status.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            size="sm"
            variant="outline"
            leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />}
            onClick={loadBatches}
            aria-label="Refresh batch directory"
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

      {/* Live mode error banner */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-center justify-between gap-3">
          <span><strong>Live Service Error:</strong> {error}</span>
          <Button size="sm" variant="danger" onClick={loadBatches}>Retry</Button>
        </div>
      )}

      {/* Search & Multi-Filters Card */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-4 shadow-card space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search batch ID, recycler, passport..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg-hover text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              aria-label="Search batches"
            />
          </div>

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg-hover text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            aria-label="Filter by category"
          >
            <option value="all">All Categories</option>
            <option value="it_telecom">IT & Telecommunications</option>
            <option value="consumer_electronics">Consumer Electronics</option>
            <option value="large_appliances">Large Appliances</option>
            <option value="small_appliances">Small Appliances</option>
            <option value="batteries">Batteries</option>
          </select>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg-hover text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            aria-label="Filter by verification status"
          >
            <option value="all">All Verification Statuses</option>
            <option value="SUPPORTED">Supported</option>
            <option value="REVIEW_REQUIRED">Review Required</option>
            <option value="REJECTED">Rejected</option>
          </select>

          <select
            value={risk}
            onChange={(e) => setRisk(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg-hover text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            aria-label="Filter by risk assessment"
          >
            <option value="all">All Risk Levels</option>
            <option value="low">Low Risk (&le; 25)</option>
            <option value="medium">Medium Risk (26&ndash;70)</option>
            <option value="high">High Risk (&gt; 70)</option>
          </select>
        </div>

        {/* Active Filters Summary & Reset */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-darkbg-border text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-400 text-[11px]">Filtered:</span>
              {search && (
                <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-mint border border-emerald-200 dark:border-emerald-800 flex items-center gap-1 text-[11px]">
                  &quot;{search}&quot;
                  <button onClick={() => setSearch("")} aria-label="Clear search">
                    <X className="w-3 h-3 hover:text-rose-600" />
                  </button>
                </span>
              )}
              {category !== "all" && (
                <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-mint border border-emerald-200 dark:border-emerald-800 flex items-center gap-1 text-[11px]">
                  Category: {category}
                  <button onClick={() => setCategory("all")} aria-label="Clear category filter">
                    <X className="w-3 h-3 hover:text-rose-600" />
                  </button>
                </span>
              )}
              {status !== "all" && (
                <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-mint border border-emerald-200 dark:border-emerald-800 flex items-center gap-1 text-[11px]">
                  Status: {status}
                  <button onClick={() => setStatus("all")} aria-label="Clear status filter">
                    <X className="w-3 h-3 hover:text-rose-600" />
                  </button>
                </span>
              )}
              {risk !== "all" && (
                <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-mint border border-emerald-200 dark:border-emerald-800 flex items-center gap-1 text-[11px]">
                  Risk: {risk}
                  <button onClick={() => setRisk("all")} aria-label="Clear risk filter">
                    <X className="w-3 h-3 hover:text-rose-600" />
                  </button>
                </span>
              )}
            </div>

            <button
              onClick={handleClearFilters}
              className="text-xs font-bold text-emerald-600 dark:text-mint hover:underline"
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>

      {/* Batches Table Card */}
      <div className="rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card shadow-card overflow-hidden">
        {/* Table Header Bar with Sort Controls */}
        <div className="p-4 sm:px-6 border-b border-slate-100 dark:border-darkbg-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              All Batches ({filteredAndSortedBatches.length})
            </h2>
            <p className="text-xs text-slate-400 dark:text-text-dark-muted">
              Select any batch to review mass-balance reconciliation, findings, and evidence documents
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-slate-400 mr-1 text-[11px]">Sort:</span>
            <button
              onClick={() => toggleSort("date")}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                sortField === "date"
                  ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-mint border border-emerald-200 dark:border-emerald-800"
                  : "text-slate-600 dark:text-text-dark-secondary hover:bg-slate-100 dark:hover:bg-darkbg-hover"
              }`}
              aria-label={`Sort by date, current direction ${sortOrder}`}
            >
              Date {sortField === "date" && (sortOrder === "asc" ? "↑" : "↓")}
            </button>
            <button
              onClick={() => toggleSort("claimedMass")}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                sortField === "claimedMass"
                  ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-mint border border-emerald-200 dark:border-emerald-800"
                  : "text-slate-600 dark:text-text-dark-secondary hover:bg-slate-100 dark:hover:bg-darkbg-hover"
              }`}
              aria-label={`Sort by claimed mass, current direction ${sortOrder}`}
            >
              Claimed Mass {sortField === "claimedMass" && (sortOrder === "asc" ? "↑" : "↓")}
            </button>
            <button
              onClick={() => toggleSort("receivedMass")}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                sortField === "receivedMass"
                  ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-mint border border-emerald-200 dark:border-emerald-800"
                  : "text-slate-600 dark:text-text-dark-secondary hover:bg-slate-100 dark:hover:bg-darkbg-hover"
              }`}
              aria-label={`Sort by received mass, current direction ${sortOrder}`}
            >
              Received Mass {sortField === "receivedMass" && (sortOrder === "asc" ? "↑" : "↓")}
            </button>
            <button
              onClick={() => toggleSort("risk")}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                sortField === "risk"
                  ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-mint border border-emerald-200 dark:border-emerald-800"
                  : "text-slate-600 dark:text-text-dark-secondary hover:bg-slate-100 dark:hover:bg-darkbg-hover"
              }`}
              aria-label={`Sort by risk level, current direction ${sortOrder}`}
            >
              Risk {sortField === "risk" && (sortOrder === "asc" ? "↑" : "↓")}
            </button>
          </div>
        </div>

        {/* Table Body */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" role="table">
            <thead className="bg-slate-50 dark:bg-darkbg-hover/60 text-[11px] uppercase tracking-wider text-slate-500 dark:text-text-dark-muted border-b border-slate-100 dark:border-darkbg-border">
              <tr>
                <th scope="col" className="px-5 py-3.5 font-bold">Batch ID</th>
                <th scope="col" className="px-4 py-3.5 font-bold">Category</th>
                <th scope="col" className="px-4 py-3.5 font-bold">Recycler</th>
                <th scope="col" className="px-4 py-3.5 font-bold">Claimed Mass</th>
                <th scope="col" className="px-4 py-3.5 font-bold">Received Mass</th>
                <th scope="col" className="px-4 py-3.5 font-bold">Verification Status</th>
                <th scope="col" className="px-4 py-3.5 font-bold">Risk Assessment</th>
                <th scope="col" className="px-4 py-3.5 font-bold">Passport Status</th>
                <th scope="col" className="px-5 py-3.5 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border">
              {isLoading ? (
                <>
                  <TableRowSkeleton cols={9} />
                  <TableRowSkeleton cols={9} />
                  <TableRowSkeleton cols={9} />
                </>
              ) : filteredAndSortedBatches.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8">
                    <EmptyState
                      title="No matching batches"
                      description="No batch records match your active search terms or filters."
                      actionText="Reset All Filters"
                      onAction={handleClearFilters}
                    />
                  </td>
                </tr>
              ) : (
                filteredAndSortedBatches.map((batch) => {
                  const passportState = batch.passport
                    ? batch.passport.revoked
                      ? "REVOKED"
                      : "ACTIVE"
                    : "NOT_ISSUED";

                  return (
                    <tr
                      key={batch.id}
                      onClick={() => router.push(`/batches/${batch.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(`/batches/${batch.id}`);
                        }
                      }}
                      tabIndex={0}
                      role="row"
                      className="hover:bg-slate-50/80 dark:hover:bg-darkbg-hover/80 transition-colors cursor-pointer focus:outline-none focus-visible:bg-slate-100 dark:focus-visible:bg-darkbg-hover"
                    >
                      <td className="px-5 py-4 font-mono font-bold text-slate-900 dark:text-emerald-100">
                        <Link
                          href={`/batches/${batch.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="hover:text-emerald-600 dark:hover:text-mint underline-offset-2 hover:underline"
                        >
                          {batch.batchNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-4">
                        <CategoryBadge category={batch.category} />
                      </td>
                      <td className="px-4 py-4 font-medium text-slate-900 dark:text-white max-w-[170px] truncate">
                        {batch.recyclerName}
                      </td>
                      <td className="px-4 py-4 text-slate-700 dark:text-text-dark-secondary">
                        {batch.claimedQuantity.toLocaleString()} {batch.unit}
                      </td>
                      <td className="px-4 py-4 font-bold text-emerald-700 dark:text-mint">
                        {batch.massBalance.receivedKg !== undefined ? (
                          `${batch.massBalance.receivedKg.toLocaleString()} kg`
                        ) : (
                          <span className="text-slate-400 font-normal">Not recorded</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge status={batch.status} />
                      </td>
                      <td className="px-4 py-4">
                        <RiskBadge level={batch.riskScore.riskLevel} score={batch.riskScore.overallScore} />
                      </td>
                      <td className="px-4 py-4">
                        <PassportStatusBadge
                          status={passportState}
                          passportId={batch.passport?.passportId}
                        />
                      </td>
                      <td className="px-5 py-4 text-right space-x-1.5 whitespace-nowrap">
                        <Link
                          href={`/batches/${batch.id}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button size="sm" variant="outline">
                            Details
                          </Button>
                        </Link>
                        <Link
                          href={`/evidence/${batch.id}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button size="sm" variant="ghost" title="Inspect Evidence Dossier">
                            <FileText className="w-3.5 h-3.5" />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
