import React from "react";

export function Card({
  children,
  className = "",
  glow = false,
}: {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-200/80 dark:border-emerald-900/50 bg-white/95 dark:bg-emerald-950/20 backdrop-blur-md shadow-sm transition-all duration-200 ${
        glow ? "hover:border-emerald-500/60 hover:shadow-glow" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className = "",
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`px-6 py-4.5 border-b border-slate-100 dark:border-emerald-900/40 flex items-center justify-between gap-4 ${className}`}
    >
      <div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-emerald-50">
          {title}
        </h3>
        {subtitle && (
          <p className="text-xs text-slate-500 dark:text-emerald-400/80 mt-0.5">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

export function CardBody({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`p-6 ${className}`}>{children}</div>;
}
