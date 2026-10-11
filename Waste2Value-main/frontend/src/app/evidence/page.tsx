"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { useBatches, useExecutionMode } from "@/lib/hooks";
import { DOCUMENT_TYPE_LABELS, evidenceHref, formatTimestamp } from "@/lib/domain";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorPanel, ModeNotice } from "@/components/ui/Feedback";
import { TableRowSkeleton } from "@/components/ui/LoadingSkeleton";

export default function EvidenceIndexPage() {
  const mode = useExecutionMode();
  const { data, error, loading, reload } = useBatches();
  const rows = useMemo(
    () =>
      (data ?? []).flatMap((b) =>
        b.documents.map((d) => ({ batch: b, doc: d, corrected: d.extractedFields.filter((f) => f.isCorrected).length }))
      ),
    [data]
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-darkbg-border">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">Evidence</h1>
          <p className="text-sm text-slate-700 dark:text-text-dark-secondary">All evidence documents across batches. Open one to inspect extracted fields and findings.</p>
          <ModeNotice mode={mode} />
        </div>
        <Button size="sm" variant="outline" onClick={reload} disabled={loading} leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? "motion-safe:animate-spin" : ""}`} aria-hidden="true" />}>
          Refresh
        </Button>
      </div>

      {error && <ErrorPanel title="Could not load evidence" message={error} onRetry={reload} mode={mode} />}

      <div className="rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card shadow-card overflow-x-auto">
        <table className="w-full text-left text-xs min-w-[48rem]">
          <caption className="sr-only">Evidence documents with their batch, type, field counts and uploaded time</caption>
          <thead className="bg-slate-50 dark:bg-darkbg-hover/60 text-[11px] uppercase tracking-wider text-slate-700 dark:text-text-dark-muted">
            <tr>
              <th scope="col" className="px-5 py-3.5 font-bold">Document</th>
              <th scope="col" className="px-4 py-3.5 font-bold">Type</th>
              <th scope="col" className="px-4 py-3.5 font-bold">Batch</th>
              <th scope="col" className="px-4 py-3.5 font-bold">Fields</th>
              <th scope="col" className="px-4 py-3.5 font-bold">Corrections</th>
              <th scope="col" className="px-4 py-3.5 font-bold">Batch verification</th>
              <th scope="col" className="px-4 py-3.5 font-bold">Uploaded</th>
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
                  <EmptyState title={error ? "Evidence unavailable" : "No evidence yet"} description={error ? "Evidence could not be loaded." : "Attach documents to a batch to see them here."} actionText={error ? undefined : "New Batch"} actionHref="/batches/new" />
                </td>
              </tr>
            ) : (
              rows.map(({ batch, doc, corrected }) => (
                <tr key={`${batch.id}-${doc.id}`}>
                  <th scope="row" className="px-5 py-3.5 font-mono font-bold text-slate-900 dark:text-emerald-100">
                    <Link href={evidenceHref(batch.id, doc.id)} className="hover:underline break-all">{doc.fileName}</Link>
                  </th>
                  <td className="px-4 py-3.5">{DOCUMENT_TYPE_LABELS[doc.documentType]}</td>
                  <td className="px-4 py-3.5 font-mono">
                    <Link href={`/batches/${encodeURIComponent(batch.id)}`} className="hover:underline">{batch.batchNumber}</Link>
                  </td>
                  <td className="px-4 py-3.5">{doc.extractedFields.length}</td>
                  <td className="px-4 py-3.5">{corrected === 0 ? "None" : `${corrected} corrected`}</td>
                  <td className="px-4 py-3.5"><StatusBadge status={batch.status} /></td>
                  <td className="px-4 py-3.5 whitespace-nowrap">{formatTimestamp(doc.uploadTimestamp)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
