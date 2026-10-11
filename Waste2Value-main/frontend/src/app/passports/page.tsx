"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { useBatches, useExecutionMode } from "@/lib/hooks";
import { formatKg, formatTimestamp, passportLifecycle } from "@/lib/domain";
import { PassportStatusBadge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorPanel, ModeNotice } from "@/components/ui/Feedback";
import { TableRowSkeleton } from "@/components/ui/LoadingSkeleton";

export default function PassportsIndexPage() {
  const mode = useExecutionMode();
  const { data, error, loading, reload } = useBatches();
  const rows = useMemo(() => (data ?? []).filter((b) => b.passport), [data]);
  const eligible = useMemo(() => (data ?? []).filter((b) => b.status === "SUPPORTED" && !b.passport), [data]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-darkbg-border">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">Circularity Passports</h1>
          <p className="text-sm text-slate-700 dark:text-text-dark-secondary">Issued passports and their public verification pages.</p>
          <ModeNotice mode={mode} />
        </div>
        <Button size="sm" variant="outline" onClick={reload} disabled={loading} leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? "motion-safe:animate-spin" : ""}`} aria-hidden="true" />}>
          Refresh
        </Button>
      </div>

      {error && <ErrorPanel title="Could not load passports" message={error} onRetry={reload} mode={mode} />}

      {eligible.length > 0 && (
        <p className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-xs text-emerald-950">
          {eligible.length} evidence-supported batch{eligible.length === 1 ? "" : "es"} can have a passport issued:{" "}
          {eligible.map((b, i) => (
            <span key={b.id}>
              {i > 0 && ", "}
              <Link href={`/batches/${encodeURIComponent(b.id)}`} className="font-mono font-bold underline">{b.batchNumber}</Link>
            </span>
          ))}
          .
        </p>
      )}

      <div className="rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card shadow-card overflow-x-auto">
        <table className="w-full text-left text-xs min-w-[52rem]">
          <caption className="sr-only">Issued passports with batch, evidence-supported mass, verification status and passport state</caption>
          <thead className="bg-slate-50 dark:bg-darkbg-hover/60 text-[11px] uppercase tracking-wider text-slate-700 dark:text-text-dark-muted">
            <tr>
              <th scope="col" className="px-5 py-3.5 font-bold">Passport</th>
              <th scope="col" className="px-4 py-3.5 font-bold">Batch</th>
              <th scope="col" className="px-4 py-3.5 font-bold">Evidence-supported mass</th>
              <th scope="col" className="px-4 py-3.5 font-bold">Issued</th>
              <th scope="col" className="px-4 py-3.5 font-bold">Batch verification</th>
              <th scope="col" className="px-4 py-3.5 font-bold">Passport state</th>
              <th scope="col" className="px-4 py-3.5 font-bold">Public page</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border">
            {loading && !data ? (
              <>
                <TableRowSkeleton cols={7} />
                <TableRowSkeleton cols={7} />
              </>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState title={error ? "Passports unavailable" : "No passports issued"} description={error ? "Passports could not be loaded." : "Only evidence-supported batches can receive a passport."} />
                </td>
              </tr>
            ) : (
              rows.map((b) => (
                <tr key={b.passport!.passportId}>
                  <th scope="row" className="px-5 py-3.5 font-mono font-bold text-slate-900 dark:text-emerald-100">
                    <Link href={`/passports/${encodeURIComponent(b.passport!.passportId)}`} className="hover:underline">{b.passport!.passportId}</Link>
                  </th>
                  <td className="px-4 py-3.5 font-mono">
                    <Link href={`/batches/${encodeURIComponent(b.id)}`} className="hover:underline">{b.batchNumber}</Link>
                  </td>
                  <td className="px-4 py-3.5">{formatKg(b.passport!.evidenceSupportedKg)}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap">{formatTimestamp(b.passport!.issueTimestamp)}</td>
                  <td className="px-4 py-3.5"><StatusBadge status={b.status} /></td>
                  <td className="px-4 py-3.5"><PassportStatusBadge status={passportLifecycle(b)} /></td>
                  <td className="px-4 py-3.5">
                    <Link href={`/verify/${encodeURIComponent(b.passport!.passportId)}`} className="font-semibold text-emerald-800 dark:text-mint hover:underline">
                      Public verification
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
