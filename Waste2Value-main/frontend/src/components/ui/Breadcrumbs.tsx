"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface Crumb {
  label: string;
  href?: string;
}

interface CrumbContextValue {
  crumbs: Crumb[] | null;
  setCrumbs: (c: Crumb[] | null) => void;
}

const CrumbContext = createContext<CrumbContextValue>({ crumbs: null, setCrumbs: () => undefined });

export function CrumbProvider({ children }: { children: React.ReactNode }) {
  const [crumbs, setCrumbs] = useState<Crumb[] | null>(null);
  const value = useMemo(() => ({ crumbs, setCrumbs }), [crumbs]);
  return <CrumbContext.Provider value={value}>{children}</CrumbContext.Provider>;
}

/** Pages call this with their real labels (e.g. the batch number). Cleared on unmount. */
export function useCrumbs(crumbs: Crumb[] | null) {
  const { setCrumbs } = useContext(CrumbContext);
  const key = crumbs ? JSON.stringify(crumbs) : "";
  useEffect(() => {
    setCrumbs(crumbs);
    return () => setCrumbs(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, setCrumbs]);
}

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Overview",
  batches: "Batches",
  new: "New Batch",
  evidence: "Evidence",
  passports: "Circularity Passports",
  verify: "Public Verification",
  settings: "Settings",
};

function fallbackCrumbs(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  return segments.map((seg, i) => ({
    label: SEGMENT_LABELS[seg] ?? decodeURIComponent(seg),
    href: i < segments.length - 1 ? `/${segments.slice(0, i + 1).join("/")}` : undefined,
  }));
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const { crumbs } = useContext(CrumbContext);
  const items = crumbs ?? fallbackCrumbs(pathname);
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-1.5 text-xs min-w-0">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex items-center gap-1.5 min-w-0">
              {i > 0 && (
                <span aria-hidden="true" className="text-slate-400">
                  /
                </span>
              )}
              {c.href && !last ? (
                <Link
                  href={c.href}
                  className="text-slate-600 dark:text-text-dark-secondary hover:text-slate-900 dark:hover:text-white hover:underline truncate max-w-[10rem] sm:max-w-[16rem]"
                >
                  {c.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className="font-semibold text-slate-900 dark:text-white truncate max-w-[10rem] sm:max-w-[20rem]">
                  {c.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
