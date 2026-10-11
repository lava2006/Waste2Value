"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Layers,
  PlusCircle,
  FileSearch,
  Award,
  QrCode,
  Settings,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { getExecutionMode } from "@/lib/api-client";

interface NavGroup {
  groupName: string;
  items: {
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    matchPrefix?: string;
  }[];
}

const navGroups: NavGroup[] = [
  {
    groupName: "WORKSPACE",
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
      { href: "/batches", label: "Batches", icon: Layers, matchPrefix: "/batches" },
      { href: "/batches/new", label: "New Batch", icon: PlusCircle },
    ],
  },
  {
    groupName: "RECORDS",
    items: [
      { href: "/evidence/doc-101", label: "Evidence Dossiers", icon: FileSearch, matchPrefix: "/evidence" },
      { href: "/passports/W2V-CP-0001", label: "Circularity Passports", icon: Award, matchPrefix: "/passports" },
      { href: "/verify/W2V-CP-0001", label: "Public Verification", icon: QrCode, matchPrefix: "/verify" },
    ],
  },
  {
    groupName: "ADMINISTRATION",
    items: [
      { href: "/settings", label: "System Settings", icon: Settings },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mode, setMode] = useState<"demo" | "live">("demo");

  useEffect(() => {
    setMode(getExecutionMode());
  }, [pathname]);

  // Don't show sidebar on public landing page
  if (pathname === "/") return null;

  return (
    <aside
      className={`hidden md:flex flex-col border-r border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card transition-all duration-300 z-40 shrink-0 sticky top-0 h-screen ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-3.5 border-b border-slate-100 dark:border-darkbg-border">
        <Link href="/" className="flex items-center gap-2.5 overflow-hidden group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-forest to-emerald-500 p-0.5 shadow-md shadow-emerald-900/10 shrink-0 group-hover:scale-105 transition-transform">
            <div className="w-full h-full bg-forest rounded-[10px] flex items-center justify-center text-white">
              <FileCheck2 className="w-4 h-4 text-lime" />
            </div>
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight min-w-0">
              <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-white truncate">
                Waste<span className="text-emerald-500">2</span>Value
              </span>
              <span className="text-[10px] text-slate-400 dark:text-text-dark-secondary truncate">
                Circularity Intelligence
              </span>
            </div>
          )}
        </Link>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-darkbg-hover transition-colors"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation Grouped Links */}
      <nav className="flex-1 py-4 px-2 space-y-4 overflow-y-auto">
        {navGroups.map((group) => (
          <div key={group.groupName} className="space-y-1">
            {!collapsed && (
              <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-text-dark-muted block">
                {group.groupName}
              </span>
            )}
            {group.items.map((item) => {
              const Icon = item.icon;
              const isExact = pathname === item.href;
              const isPrefix = item.matchPrefix && pathname.startsWith(item.matchPrefix) && item.href !== "/batches/new";
              const isActive = isExact || (isPrefix && item.href !== "/batches/new" && pathname !== "/batches/new");

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                    isActive
                      ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-mint font-semibold shadow-xs border border-emerald-200/80 dark:border-emerald-800/60"
                      : "text-slate-600 dark:text-text-dark-secondary hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-darkbg-hover"
                  } ${collapsed ? "justify-center px-0" : ""}`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-emerald-600 dark:text-lime" : ""}`} />
                  {!collapsed && <span className="truncate flex-1">{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Bottom Status Panel */}
      <div className="p-3 border-t border-slate-100 dark:border-darkbg-border">
        {!collapsed ? (
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-darkbg-hover border border-slate-200/60 dark:border-darkbg-border flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-text-dark-muted">
                Engine State
              </span>
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                  mode === "live"
                    ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/30"
                    : "bg-emerald-500/10 text-emerald-700 dark:text-mint border border-emerald-500/30"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    mode === "live" ? "bg-sky-500 animate-pulse" : "bg-emerald-500"
                  }`}
                />
                {mode === "live" ? "Live API" : "Demo Mode"}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-text-dark-secondary leading-tight truncate">
              {mode === "live" ? "FastAPI authoritative" : "Synthetic audit data"}
            </p>
          </div>
        ) : (
          <div className="flex justify-center" title={`Engine Mode: ${mode.toUpperCase()}`}>
            <span
              className={`w-3 h-3 rounded-full border-2 border-white dark:border-darkbg-card ${
                mode === "live" ? "bg-sky-500 animate-pulse" : "bg-emerald-500"
              }`}
            />
          </div>
        )}
      </div>
    </aside>
  );
}
