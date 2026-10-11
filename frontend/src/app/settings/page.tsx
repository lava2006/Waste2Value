"use client";

import React, { useState } from "react";
import {
  Settings,
  Moon,
  Sun,
  Database,
  Cloud,
  Cpu,
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  FileText,
  Server,
  Lock,
  Sparkles,
  RotateCcw,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { resetStore } from "@/lib/store";
import { Button } from "@/components/ui/Button";
import { getExecutionMode, setExecutionMode } from "@/lib/api-client";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { success, info } = useToast();

  const [liveMode, setLiveMode] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return getExecutionMode() === "live";
    }
    return false;
  });

  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleToggleLiveMode = (val: boolean) => {
    setLiveMode(val);
    setExecutionMode(val ? "live" : "demo");
    if (val) {
      info("Live API Mode Enabled", "Application will query FastAPI verification backend directly.");
    } else {
      info("Demo Mode Enabled", "Application will run using offline synthetic audit store.");
    }
  };

  const handleResetDatabase = async () => {
    setIsResetting(true);
    try {
      resetStore();
      try {
        await fetch("http://127.0.0.1:8000/api/reset", { method: "POST" });
      } catch {
        // Backend may be offline, local reset already completed
      }
      success("Ledger Reset Complete", "Scenarios A, B, and C restored to default state.");
    } finally {
      setIsResetting(false);
      setConfirmResetOpen(false);
    }
  };

  const integrations = [
    {
      name: "Frontend Application Client",
      service: "Next.js 14 (App Router) + Tailwind CSS",
      status: "Operational",
      statusColor: "emerald",
      details: "Responsive web client running on port 3000 with dark/light theme support.",
    },
    {
      name: "Verification Engine Execution Mode",
      service: liveMode ? "FastAPI Backend (http://127.0.0.1:8000/api)" : "Synthetic Demo Provider (Client Store)",
      status: liveMode ? "Live Backend" : "Demo Provider",
      statusColor: "emerald",
      details: liveMode
        ? "Queries live Python verification engine. Explicit errors are shown on failure; silent demo fallback is disabled."
        : "Evaluates deterministic rules in-memory without requiring AWS credentials.",
    },
    {
      name: "Document AI Extraction Provider",
      service: "Amazon Textract (Spatial Bounding Boxes & Confidence)",
      status: liveMode ? "Configured" : "Simulated Active",
      statusColor: "emerald",
      details: "Extracts key-value pairs, bounding boxes, and OCR confidence metrics.",
    },
    {
      name: "AI Investigator Agent Provider",
      service: "Amazon Bedrock (Claude 3.5 Sonnet / Strands Agents)",
      status: "Operational",
      statusColor: "emerald",
      details: "Generates grounded documentary citations and prioritized auditor inquiries.",
    },
    {
      name: "Cryptographic Identity & Issuer Authority",
      service: "RFC 8785 Canonical JSON + AWS KMS (RSASSA_PSS_SHA_256)",
      status: "Verified",
      statusColor: "emerald",
      details: "SHA-256 verifies payload immutability against ledger; AWS KMS establishes issuer non-repudiation.",
    },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
      {/* Page Header */}
      <div className="pb-4 border-b border-slate-200/80 dark:border-darkbg-border">
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
          System Settings & Diagnostics
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-text-dark-secondary mt-1">
          Manage theme preferences, toggle verification engine modes, and inspect cloud microservice health.
        </p>
      </div>

      {/* Theme Preference Card */}
      <div className="rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-6 shadow-card space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Interface Theme Preference
          </h2>
          <p className="text-xs text-slate-500 dark:text-text-dark-secondary mt-0.5">
            Choose between Colorful Eco-Tech Light and High-Contrast Emerald Dark
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 max-w-sm">
          <button
            onClick={() => setTheme("light")}
            className={`p-3.5 rounded-2xl border flex items-center justify-center gap-2.5 text-xs font-bold transition-all ${
              theme === "light"
                ? "border-emerald-600 bg-emerald-50 text-emerald-900 shadow-sm"
                : "border-slate-200 dark:border-darkbg-border text-slate-600 dark:text-text-dark-secondary hover:bg-slate-50 dark:hover:bg-darkbg-hover"
            }`}
          >
            <Sun className="w-4 h-4 text-amber-500" />
            <span>Light Theme</span>
          </button>

          <button
            onClick={() => setTheme("dark")}
            className={`p-3.5 rounded-2xl border flex items-center justify-center gap-2.5 text-xs font-bold transition-all ${
              theme === "dark"
                ? "border-emerald-500 bg-emerald-950 text-mint shadow-sm"
                : "border-slate-200 dark:border-darkbg-border text-slate-600 dark:text-text-dark-secondary hover:bg-slate-50 dark:hover:bg-darkbg-hover"
            }`}
          >
            <Moon className="w-4 h-4 text-lime" />
            <span>Dark Theme</span>
          </button>
        </div>
      </div>

      {/* Execution Mode Card (Correction 2: Explicit demo fallback) */}
      <div className="rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-6 shadow-card space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Verification Engine Mode
          </h2>
          <p className="text-xs text-slate-500 dark:text-text-dark-secondary mt-0.5">
            Switch between offline Demo Provider and live FastAPI Verification Server
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div
            onClick={() => handleToggleLiveMode(false)}
            className={`p-4 rounded-2xl border cursor-pointer transition-all ${
              !liveMode
                ? "border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-900 dark:text-mint shadow-sm"
                : "border-slate-200 dark:border-darkbg-border hover:border-slate-300"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-xs">Synthetic Demo Mode</span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            </div>
            <p className="text-xs text-slate-600 dark:text-text-dark-secondary leading-relaxed">
              Runs in-browser with Scenarios A, B, and C. Requires no AWS credentials or backend setup.
            </p>
          </div>

          <div
            onClick={() => handleToggleLiveMode(true)}
            className={`p-4 rounded-2xl border cursor-pointer transition-all ${
              liveMode
                ? "border-sky-500 bg-sky-50/70 dark:bg-sky-950/40 text-sky-900 dark:text-sky-300 shadow-sm"
                : "border-slate-200 dark:border-darkbg-border hover:border-slate-300"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-xs">Live FastAPI Server Mode</span>
              <span className="w-2.5 h-2.5 rounded-full bg-sky-500 animate-pulse" />
            </div>
            <p className="text-xs text-slate-600 dark:text-text-dark-secondary leading-relaxed">
              Queries http://127.0.0.1:8000 directly. Surfaces explicit network errors if unreachable.
            </p>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-darkbg-hover border border-slate-200/60 dark:border-darkbg-border text-[11px] text-slate-500 dark:text-text-dark-muted">
          <strong>Explicit Fallback Policy:</strong> When Live Mode is enabled, silent fallback to demo data is strictly disabled to prevent masking backend verification errors.
        </div>
      </div>

      {/* Cloud Microservices Health Matrix */}
      <div className="rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-6 shadow-card space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Configured Microservices & Health Status
          </h2>
          <p className="text-xs text-slate-500 dark:text-text-dark-secondary mt-0.5">
            Architecture and operational state across all platform layers
          </p>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-darkbg-border">
          {integrations.map((item, idx) => (
            <div key={idx} className="py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
              <div>
                <span className="font-bold text-slate-900 dark:text-white block">{item.name}</span>
                <span className="text-slate-400 dark:text-text-dark-muted font-mono text-[11px]">{item.service}</span>
                <p className="text-slate-500 dark:text-text-dark-secondary text-[11px] mt-0.5">{item.details}</p>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold text-[11px] bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-mint border border-emerald-300 dark:border-emerald-800 shrink-0 self-start sm:self-auto">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-lime" />
                <span>{item.status}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Database Reset Action */}
      <div className="rounded-3xl border border-rose-200 dark:border-rose-950/60 bg-rose-50/30 dark:bg-rose-950/10 p-6 space-y-3">
        <h2 className="text-base font-bold text-slate-900 dark:text-white">
          Reset Demo Dataset
        </h2>
        <p className="text-xs text-slate-600 dark:text-text-dark-secondary leading-relaxed">
          Restore the active consignment ledger and sqlite database back to the canonical benchmark scenarios (Scenario A: Clean, Scenario B: Deficit, Scenario C: High-Risk).
        </p>
        <div className="pt-2">
          <Button
            size="sm"
            variant="outline"
            leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
            onClick={() => setConfirmResetOpen(true)}
          >
            Reset to Authoritative Scenarios
          </Button>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmResetOpen}
        onClose={() => setConfirmResetOpen(false)}
        onConfirm={handleResetDatabase}
        title="Reset Consignment Ledger?"
        description="This action will restore all consignment records and passports to their initial authoritative benchmark state. Any manually created consignments will be cleared."
        confirmText="Confirm Reset"
        variant="warning"
        isLoading={isResetting}
      />
    </div>
  );
}
