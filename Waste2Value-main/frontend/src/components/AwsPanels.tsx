"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bot, Workflow } from "lucide-react";
import type { Batch, IntegrationsStatus, InvestigationReport } from "@/types";
import { errorMessage, fetchInvestigation, fetchIntegrations, fetchWorkflowStatus, startWorkflow } from "@/lib/api-client";
import { evidenceHref, formatTimestamp } from "@/lib/domain";
import { SeverityBadge, SimulatedBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

/** Runtime integration status (Live Mode only). Returns null in Demo Mode or on failure. */
export function useIntegrations(mode: "demo" | "live"): IntegrationsStatus | null {
  const [value, setValue] = useState<IntegrationsStatus | null>(null);
  useEffect(() => {
    let live = true;
    if (mode !== "live") {
      setValue(null);
      return;
    }
    fetchIntegrations()
      .then((v) => live && setValue(v))
      .catch(() => live && setValue(null));
    return () => {
      live = false;
    };
  }, [mode]);
  return value;
}

export function InvestigatorPanel({ batch, integrations }: { batch: Batch; integrations: IntegrationsStatus | null }) {
  const [report, setReport] = useState<InvestigationReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setReport(await fetchInvestigation(batch.id));
    } catch (err) {
      setReport(null);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const usesBedrock = integrations?.ai.provider === "amazon-bedrock";
  return (
    <section aria-labelledby="ai-heading" className="rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-4 sm:p-6 shadow-card space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-100 dark:border-darkbg-border">
        <div>
          <h2 id="ai-heading" className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Bot className="w-4 h-4 text-violet-700" aria-hidden="true" /> AI investigator
          </h2>
          <p className="text-xs text-slate-700 dark:text-text-dark-muted mt-0.5">
            {usesBedrock
              ? `Amazon Bedrock (${integrations?.ai.model}) summarizes this batch's findings. It only sees the verification facts shown on this page.`
              : "A deterministic rule summary (no AI model) is shown because Amazon Bedrock is not enabled on this backend."}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={run} isLoading={busy}>
          {report ? "Regenerate" : "Generate investigator summary"}
        </Button>
      </div>
      {error && <p role="alert" className="text-xs text-rose-800 dark:text-rose-200">The investigator could not run: {error}</p>}
      {report && (
        <div className="space-y-3 text-xs">
          <p className="flex flex-wrap items-center gap-2">
            <SimulatedBadge label={usesBedrock ? "AI-generated" : "Rule-based"} tooltip="Generated text. Verify against the cited evidence before acting." />
            <span className="text-slate-700 dark:text-text-dark-muted">{report.generatedBy} · {formatTimestamp(report.generatedAt)}</span>
          </p>
          <p className="text-slate-900 dark:text-white leading-relaxed">{report.executiveSummary}</p>
          {report.questions.length > 0 && (
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white mb-1">Suggested questions for the auditor</h3>
              <ul className="space-y-2">
                {report.questions.map((q) => (
                  <li key={q.question} className="p-3 rounded-xl bg-slate-50 dark:bg-darkbg-hover border border-slate-200 dark:border-darkbg-border">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{q.targetEntity}</span>
                      <SeverityBadge severity={q.urgency} />
                    </div>
                    <p className="mt-1">{q.question}</p>
                    <p className="text-slate-700 dark:text-text-dark-muted mt-0.5">Why: {q.rationale}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {report.citations.length > 0 && (
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white mb-1">Evidence cited (from stored fields)</h3>
              <ul className="list-disc pl-5 space-y-0.5">
                {report.citations.map((c) => (
                  <li key={`${c.documentId}-${c.fieldLabel}`}>
                    <Link href={evidenceHref(batch.id, c.documentId)} className="font-mono text-emerald-800 dark:text-mint hover:underline">
                      {c.documentName}
                    </Link>{" "}
                    — {c.fieldLabel}: <span className="font-mono">{c.observedValue}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-slate-700 dark:text-text-dark-muted">{report.passportRecommendation}</p>
        </div>
      )}
    </section>
  );
}

const TERMINAL = new Set(["SUCCEEDED", "FAILED", "TIMED_OUT", "ABORTED"]);

export function WorkflowButton({ batch, integrations, onFinished }: { batch: Batch; integrations: IntegrationsStatus | null; onFinished: () => void }) {
  const { success, error: toastError, info } = useToast();
  const [state, setState] = useState<"idle" | "running">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  if (!integrations?.orchestration.live_aws) return null;

  const poll = (arn: string, attempt: number) => {
    timer.current = setTimeout(async () => {
      try {
        const s = await fetchWorkflowStatus(arn);
        if (TERMINAL.has(s.status)) {
          setState("idle");
          onFinished();
          if (s.status === "SUCCEEDED") success("Workflow finished", "AWS Step Functions completed extraction, rule evaluation and the passport/notification step. See the audit history.");
          else toastError("Workflow did not succeed", `Execution ended as ${s.status}. No result was assumed.`);
        } else if (attempt >= 40) {
          setState("idle");
          info("Workflow still running", "It is taking longer than expected. Refresh the page in a moment.");
        } else poll(arn, attempt + 1);
      } catch (err) {
        setState("idle");
        toastError("Could not read workflow status", errorMessage(err));
      }
    }, 2000);
  };

  const start = async () => {
    setState("running");
    try {
      const arn = await startWorkflow(batch.id);
      info("Workflow started", "AWS Step Functions is processing this batch.");
      poll(arn, 0);
    } catch (err) {
      setState("idle");
      toastError("Workflow was not started", errorMessage(err));
    }
  };

  return (
    <Button size="sm" variant="outline" onClick={start} isLoading={state === "running"} disabled={state === "running"} leftIcon={<Workflow className="w-4 h-4" aria-hidden="true" />}>
      Run AWS verification workflow
    </Button>
  );
}
