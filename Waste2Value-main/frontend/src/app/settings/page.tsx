"use client";

import React, { useEffect, useId, useState } from "react";
import { CheckCircle2, CircleSlash, FlaskConical, Moon, RotateCcw, Server, Sun, XCircle } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { useExecutionMode } from "@/lib/hooks";
import {
  API_BASE_URL,
  BackendHealth,
  checkBackendHealth,
  errorMessage,
  fetchIntegrations,
  getOperatorLabel,
  resetDataset,
  setExecutionMode,
  setOperatorLabel,
} from "@/lib/api-client";
import type { ExecutionMode, IntegrationsStatus } from "@/types";
import { authConfigured, useAuthUser } from "@/lib/auth";

type Tone = "ok" | "off" | "warn";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { success, info, error: toastError } = useToast();
  const mode = useExecutionMode();
  const labelId = useId();
  const [live, setLive] = useState<IntegrationsStatus | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setLive(null);
    setLiveError(null);
    if (mode !== "live") return;
    fetchIntegrations(true)
      .then((v) => active && setLive(v))
      .catch((e: unknown) => active && setLiveError(errorMessage(e)));
    return () => {
      active = false;
    };
  }, [mode]);
  const authUser = useAuthUser();

  const [operator, setOperator] = useState(() => (typeof window === "undefined" ? "" : getOperatorLabel()));
  const [health, setHealth] = useState<BackendHealth | null>(null);
  const [checking, setChecking] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const chooseMode = (m: ExecutionMode) => {
    if (m === mode) return;
    setExecutionMode(m);
    info(m === "live" ? "Live Mode selected" : "Demo Mode selected", m === "live" ? "Pages now read from the verification backend. Failures are shown, never replaced by demo data." : "Pages now use the simulated browser dataset.");
  };

  const runHealth = async () => {
    setChecking(true);
    setHealth(await checkBackendHealth());
    setChecking(false);
  };

  const doReset = async () => {
    setResetting(true);
    try {
      await resetDataset();
      success("Dataset reset", mode === "live" ? "The backend database was restored to its seed scenarios." : "The Demo Mode dataset was restored to its seed scenarios.");
      setResetOpen(false);
    } catch (err) {
      toastError("Reset failed", `${errorMessage(err)} Nothing was changed.`);
    } finally {
      setResetting(false);
    }
  };

  const integrations: { name: string; state: string; tone: Tone; details: string }[] = [
    {
      name: "Frontend application",
      state: "Running",
      tone: "ok",
      details: "Next.js client rendering this page.",
    },
    {
      name: "Verification engine",
      state: mode === "live" ? (health ? (health.reachable ? "Backend reachable" : "Backend unreachable") : "Not checked yet") : "Browser simulation",
      tone: mode === "live" ? (health ? (health.reachable ? "ok" : "warn") : "off") : "warn",
      details:
        mode === "live"
          ? `FastAPI at ${API_BASE_URL}. Use “Check backend” for a live status.`
          : "Demo Mode runs a TypeScript port of the rules in your browser. It is a simulation, not the backend.",
    },
    {
      name: "Document OCR / extraction",
      state: "Not connected",
      tone: "off",
      details:
        "Intake records the quantities you type in; no OCR service reads uploaded files and file contents are not stored. The backend has a simulated extraction endpoint and an unused Amazon Textract adapter.",
    },
    {
      name: "AI investigator",
      state: "Not used by this interface",
      tone: "off",
      details: "The backend has a deterministic summary generator; no Amazon Bedrock model is called and the UI does not display it.",
    },
    {
      name: "Passport signing",
      state: mode === "live" ? "Depends on backend credentials" : "Not configured",
      tone: "off",
      details:
        mode === "live"
          ? "Without AWS KMS credentials the backend produces a simulated stand-in value, which the public verification page labels as not authentic."
          : "Demo Mode does not sign passports; only a SHA-256 integrity hash is produced.",
    },
    {
      name: "Authentication and authorization",
      state: "Not implemented",
      tone: "off",
      details: "Anyone who can reach the API can record decisions, corrections and revocations. Recorded names are unverified labels.",
    },
  ];

  const NAMES: Record<string, string> = {
    dynamodb: "Amazon DynamoDB", sqlite: "Local SQLite file", "aws-kms": "AWS KMS (RSA-4096, RSASSA-PSS)", simulated: "Simulated",
    "amazon-textract": "Amazon Textract (AnalyzeDocument, FORMS)", "amazon-rekognition+nova": "Amazon Rekognition OCR (images) + Amazon Nova (PDFs)", "amazon-bedrock": "Amazon Bedrock", "deterministic-rules": "Deterministic rule summary",
    "amazon-s3": "Amazon S3 (private, presigned uploads)", none: "Not configured", "aws-step-functions": "AWS Step Functions + SNS", "amazon-cognito": "Amazon Cognito (JWT)",
  };
  const row = (name: string, p: { provider: string; live_aws: boolean; model?: string | null }, details: string) => ({
    name,
    state: `${NAMES[p.provider] ?? p.provider}${p.model ? ` · ${p.model}` : ""}`,
    tone: (p.live_aws ? "ok" : "off") as Tone,
    details,
  });
  if (mode === "live" && !live) {
    // Never show the Demo Mode caveats as if they described the live backend.
    integrations.splice(0, integrations.length, {
      name: "Live integration status",
      state: liveError ? "Unavailable" : "Loading…",
      tone: "off",
      details: liveError ?? "Reading GET /integrations from the backend.",
    });
  }
  if (mode === "live" && live) {
    integrations.splice(
      0,
      integrations.length,
      { name: "Verification backend", state: `Running (${live.environment}${live.region ? `, ${live.region}` : ""})`, tone: "ok", details: `Reported by GET /integrations at ${API_BASE_URL}.` },
      row("Registry (database)", live.repository, "Authoritative storage for batches, evidence metadata and passports."),
      row("Evidence storage", live.evidence_storage, "Where uploaded evidence files live. Presigned, type- and size-restricted uploads."),
      row("Document OCR", live.extraction, "Reads uploaded documents into extracted fields with real confidence and bounding boxes."),
      row("AI investigator", live.ai, "Summarizes verification findings; sees only the batch facts."),
      row("Passport signing", live.signing, live.signing.live_aws ? "Passports are signed with an AWS KMS asymmetric key and verified through KMS on the public page." : "Signatures are simulated stand-ins and are never reported as valid."),
      row("Verification workflow", live.orchestration, "OCR → rules → sign passport or notify auditor."),
      row("Authentication", live.authentication, live.authentication.required ? `Write actions require sign-in.${authConfigured() ? (authUser ? ` Signed in as ${authUser.email}.` : " You are not signed in.") : ""}` : "No authentication: recorded names are unverified labels.")
    );
  }

  const toneIcon = (t: Tone) =>
    t === "ok" ? <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> : t === "warn" ? <FlaskConical className="w-3.5 h-3.5" aria-hidden="true" /> : <CircleSlash className="w-3.5 h-3.5" aria-hidden="true" />;
  const toneClass: Record<Tone, string> = {
    ok: "bg-emerald-50 text-emerald-950 border-emerald-300 dark:bg-emerald-950 dark:text-mint dark:border-emerald-800",
    warn: "bg-amber-50 text-amber-950 border-amber-300 dark:bg-amber-950/60 dark:text-amber-100 dark:border-amber-800",
    off: "bg-slate-100 text-slate-900 border-slate-300 dark:bg-darkbg-hover dark:text-slate-200 dark:border-darkbg-border",
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
      <div className="pb-4 border-b border-slate-200/80 dark:border-darkbg-border">
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">Settings</h1>
        <p className="text-sm text-slate-700 dark:text-text-dark-secondary mt-1">Theme, execution mode, operator label and an honest view of what is connected.</p>
      </div>

      <section aria-labelledby="theme-heading" className="rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-4 sm:p-6 shadow-card space-y-4">
        <h2 id="theme-heading" className="text-base font-bold text-slate-900 dark:text-white">Theme</h2>
        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-3 max-w-sm">
          {(
            [
              ["light", "Light", <Sun key="s" className="w-4 h-4 text-amber-600" aria-hidden="true" />],
              ["dark", "Dark", <Moon key="m" className="w-4 h-4 text-lime" aria-hidden="true" />],
            ] as const
          ).map(([value, label, icon]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={theme === value}
              onClick={() => setTheme(value)}
              className={`p-3.5 rounded-2xl border flex items-center justify-center gap-2.5 text-sm font-bold ${
                theme === value ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950 text-emerald-950 dark:text-mint" : "border-slate-300 dark:border-darkbg-border text-slate-800 dark:text-text-dark-secondary"
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="mode-heading" className="rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-4 sm:p-6 shadow-card space-y-4">
        <div>
          <h2 id="mode-heading" className="text-base font-bold text-slate-900 dark:text-white">Execution mode</h2>
          <p className="text-xs text-slate-700 dark:text-text-dark-secondary mt-0.5">Demo and Live Mode use separate datasets and are never mixed.</p>
        </div>
        <div role="radiogroup" aria-labelledby="mode-heading" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            type="button"
            role="radio"
            aria-checked={mode === "demo"}
            onClick={() => chooseMode("demo")}
            className={`text-left p-4 rounded-2xl border ${mode === "demo" ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40" : "border-slate-300 dark:border-darkbg-border"}`}
          >
            <span className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white"><FlaskConical className="w-4 h-4" aria-hidden="true" /> Demo Mode</span>
            <span className="block text-xs text-slate-800 dark:text-text-dark-secondary mt-1.5 leading-relaxed">
              Deterministic sample batches stored in this browser. Verification, passports and revocations are simulated locally and are not authoritative records.
            </span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === "live"}
            onClick={() => chooseMode("live")}
            className={`text-left p-4 rounded-2xl border ${mode === "live" ? "border-sky-600 bg-sky-50 dark:bg-sky-950/40" : "border-slate-300 dark:border-darkbg-border"}`}
          >
            <span className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white"><Server className="w-4 h-4" aria-hidden="true" /> Live Mode</span>
            <span className="block text-xs text-slate-800 dark:text-text-dark-secondary mt-1.5 leading-relaxed">
              Reads and writes the FastAPI backend at <span className="font-mono break-all">{API_BASE_URL}</span>. If it fails you see the error; demo data is never substituted.
            </span>
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" variant="outline" onClick={runHealth} isLoading={checking}>
            Check backend
          </Button>
          {health && (
            <p role="status" className={`inline-flex items-center gap-1.5 text-xs font-semibold ${health.reachable ? "text-emerald-900 dark:text-mint" : "text-rose-800 dark:text-rose-200"}`}>
              {health.reachable ? <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> : <XCircle className="w-4 h-4" aria-hidden="true" />}
              {health.reachable ? "Reachable." : "Unreachable."} {health.detail}
            </p>
          )}
        </div>
      </section>

      <section aria-labelledby="operator-heading" className="rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-4 sm:p-6 shadow-card space-y-3">
        <h2 id="operator-heading" className="text-base font-bold text-slate-900 dark:text-white">Operator label</h2>
        <p className="text-xs text-slate-700 dark:text-text-dark-secondary">
          {authConfigured() ? (
            <>Written next to corrections and decisions in Demo Mode. In Live Mode the verified e-mail of the signed-in user is recorded instead{authUser ? ` (${authUser.email})` : ""}.</>
          ) : (
            <>Written next to corrections and decisions. Because this deployment has no sign-in, this is a free-text label and is <strong>not a verified identity</strong>.</>
          )}
        </p>
        <div className="max-w-sm">
          <label htmlFor={labelId} className="block text-[11px] font-bold uppercase tracking-wider text-slate-800 dark:text-text-dark-primary mb-1">Label</label>
          <input
            id={labelId}
            type="text"
            value={operator}
            onChange={(e) => {
              setOperator(e.target.value);
              setOperatorLabel(e.target.value);
            }}
            placeholder="operator-unverified"
            className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg-hover text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </section>

      <section aria-labelledby="integrations-heading" className="rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-4 sm:p-6 shadow-card space-y-2">
        <h2 id="integrations-heading" className="text-base font-bold text-slate-900 dark:text-white">What is actually connected</h2>
        <ul className="divide-y divide-slate-100 dark:divide-darkbg-border">
          {integrations.map((i) => (
            <li key={i.name} className="py-3.5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 text-xs">
              <div className="min-w-0">
                <p className="font-bold text-slate-900 dark:text-white">{i.name}</p>
                <p className="text-slate-800 dark:text-text-dark-secondary mt-0.5 leading-relaxed">{i.details}</p>
              </div>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold text-[11px] border shrink-0 self-start ${toneClass[i.tone]}`}>
                {toneIcon(i.tone)}
                {i.state}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="reset-heading" className="rounded-3xl border border-rose-300 dark:border-rose-950/60 bg-rose-50/40 dark:bg-rose-950/10 p-4 sm:p-6 space-y-3">
        <h2 id="reset-heading" className="text-base font-bold text-slate-900 dark:text-white">Reset {mode === "live" ? "backend" : "demo"} dataset</h2>
        <p className="text-xs text-slate-800 dark:text-text-dark-secondary leading-relaxed">
          {mode === "live"
            ? "Live Mode: this deletes ALL batches and passports in the backend database and restores its three seed scenarios. It affects everyone using that backend."
            : "Demo Mode: restores this browser's demo dataset to its three seed scenarios. Batches you created here are removed. The backend is not touched."}
        </p>
        <Button size="sm" variant="outline" leftIcon={<RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />} onClick={() => setResetOpen(true)}>
          Reset to seed scenarios
        </Button>
      </section>

      <ConfirmDialog
        isOpen={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={doReset}
        title={mode === "live" ? "Reset the backend database?" : "Reset the demo dataset?"}
        description={mode === "live" ? "All backend batches, evidence and passports will be replaced by the seed scenarios. This cannot be undone." : "Batches created in this browser will be removed and the seed scenarios restored."}
        confirmText="Reset"
        variant="warning"
        isLoading={resetting}
      />
    </div>
  );
}
