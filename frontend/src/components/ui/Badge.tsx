import React from "react";
import { Severity, VerificationStatus, RiskLevel, EwasteCategory } from "@/types";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Clock,
  Ban,
  Shield,
  Sparkles,
  Cpu,
  Tv,
  BatteryCharging,
  Package,
} from "lucide-react";

export function StatusBadge({ status, className = "" }: { status: VerificationStatus; className?: string }) {
  const configs: Record<
    VerificationStatus,
    { label: string; bg: string; text: string; border: string; icon: React.ReactNode }
  > = {
    SUPPORTED: {
      label: "Evidence Supported",
      bg: "bg-emerald-50 dark:bg-emerald-950/40",
      text: "text-emerald-800 dark:text-mint",
      border: "border-emerald-200 dark:border-emerald-800",
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />,
    },
    REVIEW_REQUIRED: {
      label: "Review Required",
      bg: "bg-amber-50 dark:bg-amber-950/40",
      text: "text-amber-800 dark:text-amber-300",
      border: "border-amber-200 dark:border-amber-800",
      icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />,
    },
    REJECTED: {
      label: "Rejected",
      bg: "bg-rose-50 dark:bg-rose-950/40",
      text: "text-rose-800 dark:text-coral",
      border: "border-rose-200 dark:border-rose-800",
      icon: <XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />,
    },
    NOT_VERIFIED: {
      label: "Not Verified",
      bg: "bg-slate-100 dark:bg-darkbg-card",
      text: "text-slate-700 dark:text-slate-300",
      border: "border-slate-200 dark:border-darkbg-border",
      icon: <HelpCircle className="w-3.5 h-3.5 text-slate-400" />,
    },
    PROCESSING: {
      label: "Processing Intake",
      bg: "bg-sky-50 dark:bg-sky-950/40",
      text: "text-sky-800 dark:text-sky-300",
      border: "border-sky-200 dark:border-sky-800",
      icon: <Clock className="w-3.5 h-3.5 text-sky-500 animate-spin" />,
    },
    REVOKED: {
      label: "Passport Revoked",
      bg: "bg-purple-50 dark:bg-purple-950/40",
      text: "text-purple-800 dark:text-purple-300",
      border: "border-purple-200 dark:border-purple-800",
      icon: <Ban className="w-3.5 h-3.5 text-purple-500" />,
    },
  };

  const config = configs[status] || configs.NOT_VERIFIED;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${config.bg} ${config.text} ${config.border} ${className}`}
    >
      {config.icon}
      <span>{config.label}</span>
    </span>
  );
}

export function SeverityBadge({ severity, className = "" }: { severity: Severity; className?: string }) {
  const configs: Record<Severity, { label: string; bg: string; text: string; border: string }> = {
    critical: {
      label: "Critical Deficit",
      bg: "bg-rose-100 dark:bg-rose-950/70",
      text: "text-rose-800 dark:text-rose-200",
      border: "border-rose-300 dark:border-rose-800",
    },
    warning: {
      label: "Investigation Required",
      bg: "bg-amber-100 dark:bg-amber-950/70",
      text: "text-amber-800 dark:text-amber-200",
      border: "border-amber-300 dark:border-amber-800",
    },
    info: {
      label: "Documentary Note",
      bg: "bg-sky-100 dark:bg-sky-950/70",
      text: "text-sky-800 dark:text-sky-200",
      border: "border-sky-300 dark:border-sky-800",
    },
  };

  const config = configs[severity] || configs.info;

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider border ${config.bg} ${config.text} ${config.border} ${className}`}
    >
      {config.label}
    </span>
  );
}

export function RiskBadge({ level, score }: { level: RiskLevel; score?: number }) {
  const configs = {
    low: {
      label: "Low Risk",
      bg: "bg-emerald-50 dark:bg-emerald-950/60",
      text: "text-emerald-700 dark:text-mint",
      border: "border-emerald-200 dark:border-emerald-800",
    },
    medium: {
      label: "Medium Risk",
      bg: "bg-amber-50 dark:bg-amber-950/60",
      text: "text-amber-700 dark:text-amber-300",
      border: "border-amber-200 dark:border-amber-800",
    },
    high: {
      label: "High Risk",
      bg: "bg-rose-50 dark:bg-rose-950/60",
      text: "text-rose-700 dark:text-coral",
      border: "border-rose-200 dark:border-rose-800",
    },
  };

  const config = configs[level] || configs.low;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${config.bg} ${config.text} ${config.border}`}
    >
      <Shield className="w-3 h-3" />
      <span>{config.label}</span>
      {score !== undefined && <span className="opacity-80">({score}/100)</span>}
    </span>
  );
}

export function CategoryBadge({ category }: { category: EwasteCategory | string }) {
  const configs: Record<string, { label: string; icon: React.ReactNode }> = {
    it_telecom: { label: "IT & Telecom", icon: <Cpu className="w-3 h-3" /> },
    consumer_electronics: { label: "Consumer Electronics", icon: <Tv className="w-3 h-3" /> },
    large_appliances: { label: "Large Appliances", icon: <Package className="w-3 h-3" /> },
    small_appliances: { label: "Small Appliances", icon: <Package className="w-3 h-3" /> },
    batteries: { label: "Batteries", icon: <BatteryCharging className="w-3 h-3" /> },
  };

  const config = configs[category] || { label: category, icon: <Package className="w-3 h-3" /> };

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 dark:bg-darkbg-hover text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-darkbg-border">
      {config.icon}
      <span>{config.label}</span>
    </span>
  );
}

export function AiBadge({ label = "Amazon Bedrock Grounded" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
      <Sparkles className="w-3 h-3 text-violet-500" />
      <span>{label}</span>
    </span>
  );
}

export function PassportStatusBadge({
  status,
  passportId,
  className = "",
}: {
  status?: "ACTIVE" | "REVOKED" | "NOT_ISSUED";
  passportId?: string;
  className?: string;
}) {
  if (status === "ACTIVE") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-mint border border-emerald-300 dark:border-emerald-800 ${className}`}
      >
        <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
        <span>Passport Active</span>
        {passportId && <span className="font-mono text-[10px] opacity-80">({passportId})</span>}
      </span>
    );
  }
  if (status === "REVOKED") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-coral border border-rose-300 dark:border-rose-800 ${className}`}
      >
        <Ban className="w-3 h-3 text-rose-600 dark:text-rose-400" />
        <span>Passport Revoked</span>
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-darkbg-card text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-darkbg-border ${className}`}
    >
      <Clock className="w-3 h-3 text-slate-400" />
      <span>Not Issued</span>
    </span>
  );
}
