"use client";

import React from "react";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  /** Extra definition/provenance lines shown under the subtitle (wraps, never truncated). */
  notes?: string[];
  icon: LucideIcon;
  badge?: string;
  badgeVariant?: "positive" | "warning" | "neutral" | "danger" | "lime" | "violet";
  accentColor?: "emerald" | "amber" | "sky" | "purple" | "lime" | "turquoise" | "coral" | "violet";
}

export function StatCard({
  title,
  value,
  subtitle,
  notes,
  icon: Icon,
  badge,
  badgeVariant = "neutral",
  accentColor = "emerald",
}: StatCardProps) {
  const iconBgStyles = {
    emerald: "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-mint border-emerald-200 dark:border-emerald-800",
    lime: "bg-lime-50 dark:bg-lime-950/40 text-lime-600 dark:text-lime border-lime-300 dark:border-lime-700/60",
    turquoise: "bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-turquoise border-teal-200 dark:border-teal-800",
    amber: "bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800",
    sky: "bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 border-sky-200 dark:border-sky-800",
    purple: "bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800",
    violet: "bg-violet-50 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-800",
    coral: "bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-coral border-rose-200 dark:border-rose-800",
  };

  const badgeStyles = {
    positive: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/80 dark:text-mint border-emerald-200 dark:border-emerald-800",
    lime: "bg-lime-100 text-lime-800 dark:bg-lime-950/80 dark:text-lime border-lime-300 dark:border-lime-800",
    violet: "bg-violet-50 text-violet-700 dark:bg-violet-950/80 dark:text-violet-300 border-violet-200 dark:border-violet-800",
    warning: "bg-amber-50 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    danger: "bg-rose-50 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300 border-rose-200 dark:border-rose-800",
    neutral: "bg-slate-100 text-slate-700 dark:bg-darkbg-hover dark:text-slate-300 border-slate-200 dark:border-darkbg-border",
  };

  return (
    <div className="rounded-2xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card backdrop-blur-md p-5 shadow-card hover:shadow-card-hover dark:hover:shadow-card-dark">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0 pr-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-text-dark-muted">
            {title}
          </p>
          <div className="mt-2 flex items-baseline gap-2 flex-wrap">
            <p className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white break-words">
              {value}
            </p>
            {badge && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeStyles[badgeVariant]}`}>
                {badge}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="mt-1.5 text-xs text-slate-700 dark:text-text-dark-secondary">
              {subtitle}
            </p>
          )}
          {notes?.map((n) => (
            <p key={n} className="mt-1 text-[11px] text-slate-600 dark:text-text-dark-muted">
              {n}
            </p>
          ))}
        </div>
        <div aria-hidden="true" className={`p-3 rounded-xl border shrink-0 ${iconBgStyles[accentColor]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}
