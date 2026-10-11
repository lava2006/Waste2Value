import React from "react";
import type {
  EwasteCategory,
  PassportLifecycleStatus,
  PayloadIntegrityState,
  RiskLevel,
  Severity,
  SignatureState,
  VerificationStatus,
} from "@/types";
import {
  CATEGORY_LABELS,
  INTEGRITY_META,
  PASSPORT_META,
  RISK_META,
  SEVERITY_META,
  SIGNATURE_META,
  VERIFICATION_STATUS_META,
} from "@/lib/domain";
import {
  AlertTriangle,
  Ban,
  BatteryCharging,
  CheckCircle2,
  Clock,
  Cpu,
  FileWarning,
  HelpCircle,
  KeyRound,
  Loader2,
  Package,
  Shield,
  Sparkles,
  Tv,
  XCircle,
} from "lucide-react";

// Every badge pairs colour with an icon AND a text label, and carries an explanatory tooltip
// (title) so state is never communicated by colour alone.

const TONE = {
  good: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-mint border-emerald-300 dark:border-emerald-800",
  warn: "bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-800",
  bad: "bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 border-rose-300 dark:border-rose-800",
  info: "bg-sky-50 dark:bg-sky-950/40 text-sky-900 dark:text-sky-200 border-sky-300 dark:border-sky-800",
  neutral: "bg-slate-100 dark:bg-darkbg-card text-slate-800 dark:text-slate-200 border-slate-300 dark:border-darkbg-border",
  violet: "bg-violet-50 dark:bg-violet-950/40 text-violet-900 dark:text-violet-200 border-violet-300 dark:border-violet-800",
} as const;

type Tone = keyof typeof TONE;

function Pill({
  tone,
  icon,
  label,
  tooltip,
  prefix,
  className = "",
}: {
  tone: Tone;
  icon: React.ReactNode;
  label: string;
  tooltip: string;
  prefix?: string;
  className?: string;
}) {
  return (
    <span
      title={tooltip}
      className={`relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${TONE[tone]} ${className}`}
    >
      <span aria-hidden="true">{icon}</span>
      {prefix && <span className="sr-only">{prefix}: </span>}
      <span>{label}</span>
      <span className="sr-only">. {tooltip}</span>
    </span>
  );
}

const ICON = "w-3.5 h-3.5";

export function StatusBadge({ status, className = "" }: { status: VerificationStatus; className?: string }) {
  const meta = VERIFICATION_STATUS_META[status] ?? VERIFICATION_STATUS_META.NOT_VERIFIED;
  const map: Record<VerificationStatus, [Tone, React.ReactNode]> = {
    SUPPORTED: ["good", <CheckCircle2 key="i" className={ICON} />],
    REVIEW_REQUIRED: ["warn", <AlertTriangle key="i" className={ICON} />],
    REJECTED: ["bad", <XCircle key="i" className={ICON} />],
    NOT_VERIFIED: ["neutral", <HelpCircle key="i" className={ICON} />],
    PROCESSING: ["info", <Loader2 key="i" className={`${ICON} motion-safe:animate-spin`} />],
    REVOKED: ["neutral", <HelpCircle key="i" className={ICON} />],
  };
  const [tone, icon] = map[status] ?? map.NOT_VERIFIED;
  return <Pill tone={tone} icon={icon} label={meta.label} tooltip={meta.tooltip} prefix="Verification status" className={className} />;
}

export function SeverityBadge({ severity, className = "" }: { severity: Severity; className?: string }) {
  const meta = SEVERITY_META[severity] ?? SEVERITY_META.info;
  const tone: Tone = severity === "critical" ? "bad" : severity === "warning" ? "warn" : "info";
  const icon =
    severity === "critical" ? <XCircle className={ICON} /> : severity === "warning" ? <AlertTriangle className={ICON} /> : <HelpCircle className={ICON} />;
  return <Pill tone={tone} icon={icon} label={meta.label} tooltip={meta.tooltip} className={`rounded-md ${className}`} />;
}

export function RiskBadge({ level, score }: { level: RiskLevel; score?: number }) {
  const meta = RISK_META[level] ?? RISK_META.low;
  const tone: Tone = level === "low" ? "good" : level === "medium" ? "warn" : "bad";
  return (
    <Pill
      tone={tone}
      icon={<Shield className={ICON} />}
      label={score !== undefined ? `${meta.label} (${score}/100)` : meta.label}
      tooltip={meta.tooltip}
      prefix="Risk assessment"
    />
  );
}

export function PassportStatusBadge({
  status,
  passportId,
  className = "",
}: {
  status?: PassportLifecycleStatus;
  passportId?: string;
  className?: string;
}) {
  const s: PassportLifecycleStatus = status ?? "NOT_ISSUED";
  const meta = PASSPORT_META[s];
  const tone: Tone = s === "ACTIVE" ? "good" : s === "REVOKED" ? "bad" : "neutral";
  const icon = s === "ACTIVE" ? <CheckCircle2 className={ICON} /> : s === "REVOKED" ? <Ban className={ICON} /> : <Clock className={ICON} />;
  return (
    <Pill
      tone={tone}
      icon={icon}
      label={passportId && s !== "NOT_ISSUED" ? `${meta.label} (${passportId})` : meta.label}
      tooltip={meta.tooltip}
      prefix="Passport lifecycle"
      className={className}
    />
  );
}

export function IntegrityBadge({ state }: { state: PayloadIntegrityState }) {
  const meta = INTEGRITY_META[state];
  const tone: Tone = state === "VALID" ? "good" : state === "INVALID" ? "bad" : "neutral";
  const icon = state === "VALID" ? <CheckCircle2 className={ICON} /> : state === "INVALID" ? <FileWarning className={ICON} /> : <HelpCircle className={ICON} />;
  return <Pill tone={tone} icon={icon} label={meta.label} tooltip={meta.tooltip} prefix="Payload integrity" />;
}

export function SignatureBadge({ state }: { state: SignatureState }) {
  const meta = SIGNATURE_META[state];
  const tone: Tone = state === "VALID" ? "good" : state === "INVALID" ? "bad" : state === "SIMULATED" ? "violet" : "warn";
  return <Pill tone={tone} icon={<KeyRound className={ICON} />} label={meta.label} tooltip={meta.tooltip} prefix="Issuer signature" />;
}

export function CategoryBadge({ category }: { category: EwasteCategory | string }) {
  const icons: Record<string, React.ReactNode> = {
    it_telecom: <Cpu className="w-3 h-3" />,
    consumer_electronics: <Tv className="w-3 h-3" />,
    batteries: <BatteryCharging className="w-3 h-3" />,
  };
  const label = CATEGORY_LABELS[category as EwasteCategory] ?? category;
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 dark:bg-darkbg-hover text-slate-800 dark:text-slate-200 border border-slate-200/80 dark:border-darkbg-border">
      <span aria-hidden="true">{icons[category] ?? <Package className="w-3 h-3" />}</span>
      <span>{label}</span>
    </span>
  );
}

export function SimulatedBadge({ label = "Simulated", tooltip = "This value is produced by a simulation, not by an external system." }: { label?: string; tooltip?: string }) {
  return (
    <span
      title={tooltip}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-violet-50 dark:bg-violet-950/50 text-violet-900 dark:text-violet-200 border border-violet-300 dark:border-violet-800"
    >
      <Sparkles className="w-3 h-3" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

/** Retained export name for existing imports. */
export function AiBadge({ label = "Simulated analysis" }: { label?: string }) {
  return <SimulatedBadge label={label} />;
}
