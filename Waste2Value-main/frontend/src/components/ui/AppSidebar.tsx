"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, FileCheck2 } from "lucide-react";
import { useExecutionMode } from "@/lib/hooks";
import { NAV_GROUPS, isNavActive } from "@/lib/nav";

export function AppSidebar() {
  const pathname = usePathname();
  const mode = useExecutionMode();
  const [collapsed, setCollapsed] = useState(false);

  if (pathname === "/") return null;

  return (
    <aside
      aria-label="Sidebar"
      className={`hidden md:flex flex-col border-r border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card z-40 shrink-0 sticky top-0 h-screen motion-safe:transition-[width] motion-safe:duration-200 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      <div className="h-16 flex items-center justify-between px-3.5 border-b border-slate-100 dark:border-darkbg-border">
        <Link href="/" className="flex items-center gap-2.5 overflow-hidden" aria-label="Waste2Value home">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-forest to-emerald-500 p-0.5 shrink-0">
            <div className="w-full h-full bg-forest rounded-[10px] flex items-center justify-center text-white">
              <FileCheck2 className="w-4 h-4 text-lime" aria-hidden="true" />
            </div>
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight min-w-0">
              <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-white truncate">
                Waste<span className="text-emerald-500">2</span>Value
              </span>
              <span className="text-[10px] text-slate-600 dark:text-text-dark-secondary truncate">Circularity Intelligence</span>
            </div>
          )}
        </Link>

        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="p-1 rounded-lg text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-darkbg-hover"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" aria-hidden="true" /> : <ChevronLeft className="w-4 h-4" aria-hidden="true" />}
        </button>
      </div>

      <nav aria-label="Primary" className="flex-1 py-4 px-2 space-y-4 overflow-y-auto">
        {NAV_GROUPS.map((group) => (
          <div key={group.name} className="space-y-1">
            {!collapsed && (
              <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-text-dark-muted">{group.name}</p>
            )}
            <ul className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isNavActive(item, pathname);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      aria-label={collapsed ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium ${
                        active
                          ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-mint font-semibold border border-emerald-300/80 dark:border-emerald-800/60"
                          : "text-slate-700 dark:text-text-dark-secondary hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-darkbg-hover"
                      } ${collapsed ? "justify-center px-0" : ""}`}
                    >
                      <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                      {!collapsed && <span className="truncate flex-1">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-slate-100 dark:border-darkbg-border">
        {!collapsed ? (
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-darkbg-hover border border-slate-200/60 dark:border-darkbg-border space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-text-dark-muted">Execution mode</p>
            <p className="text-xs font-semibold text-slate-900 dark:text-white">{mode === "live" ? "Live Mode" : "Demo Mode"}</p>
            <p className="text-[11px] text-slate-600 dark:text-text-dark-secondary leading-tight">
              {mode === "live" ? "Verification backend (FastAPI)" : "Simulated data stored in this browser"}
            </p>
          </div>
        ) : (
          <p className="text-center text-[10px] font-bold text-slate-700 dark:text-slate-300" title={`Execution mode: ${mode}`}>
            {mode === "live" ? "LIVE" : "DEMO"}
          </p>
        )}
      </div>
    </aside>
  );
}
