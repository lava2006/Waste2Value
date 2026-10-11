"use client";

import React from "react";
import Link from "next/link";
import { AlertCircle, FlaskConical, Server } from "lucide-react";
import type { ExecutionMode } from "@/types";
import { Button } from "./Button";
import { authConfigured, startLogin } from "@/lib/auth";

/** Error banner with retry. Used for failed loads; never replaced by demo data in Live Mode. */
export function ErrorPanel({
  title = "Could not load data",
  message,
  onRetry,
  mode,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  mode?: ExecutionMode;
}) {
  return (
    <div
      role="alert"
      className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-100 flex items-start gap-3"
    >
      <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600 dark:text-coral" aria-hidden="true" />
      <div className="flex-1 text-xs space-y-1">
        <p className="font-bold">{title}</p>
        <p>{message}</p>
        {mode === "live" && (
          <p className="opacity-90">
            Live Mode never substitutes demo data for a failed request.{" "}
            <Link href="/settings" className="underline font-semibold">
              Open Settings
            </Link>{" "}
            to check the backend or switch modes.
          </p>
        )}
      </div>
      {authConfigured() && /sign in is required/i.test(message) ? (
        <Button size="sm" variant="primary" onClick={() => void startLogin()}>
          Sign in
        </Button>
      ) : (
        onRetry && (
          <Button size="sm" variant="danger" onClick={onRetry}>
            Retry
          </Button>
        )
      )}
    </div>
  );
}

/** Persistent mode statement shown on data pages so demo and live data are never confused. */
export function ModeNotice({ mode }: { mode: ExecutionMode }) {
  if (mode === "live") {
    return (
      <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-sky-800 dark:text-sky-200">
        <Server className="w-3.5 h-3.5" aria-hidden="true" />
        Live Mode: data from the verification backend
      </p>
    );
  }
  return (
    <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-900 dark:text-mint">
      <FlaskConical className="w-3.5 h-3.5" aria-hidden="true" />
      Demo Mode: simulated data stored in this browser, not an authoritative record
    </p>
  );
}

export function NotFoundPanel({
  title,
  message,
  backHref,
  backLabel,
}: {
  title: string;
  message: string;
  backHref: string;
  backLabel: string;
}) {
  return (
    <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h1>
      <p className="text-sm text-slate-600 dark:text-text-dark-secondary">{message}</p>
      <Link href={backHref}>
        <Button variant="outline">{backLabel}</Button>
      </Link>
    </div>
  );
}
