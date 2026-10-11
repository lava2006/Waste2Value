"use client";

import React, { useEffect, useId, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, PlusCircle, X } from "lucide-react";
import { ThemeToggle } from "../theme-toggle";
import { useExecutionMode } from "@/lib/hooks";
import { authConfigured, signOut, startLogin, useAuthUser } from "@/lib/auth";
import { NAV_GROUPS, isNavActive } from "@/lib/nav";
import { Breadcrumbs } from "./Breadcrumbs";
import { GlobalSearch } from "./GlobalSearch";

export function AppHeader() {
  const pathname = usePathname();
  const mode = useExecutionMode();
  const user = useAuthUser();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();

  // Close the mobile drawer on navigation.
  useEffect(() => setMenuOpen(false), [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  if (pathname === "/") return null;

  return (
    <header className="sticky top-0 z-30 w-full border-b border-slate-200/80 dark:border-darkbg-border bg-white/95 dark:bg-darkbg/95 backdrop-blur-md">
      <div className="min-h-16 px-4 sm:px-6 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-controls={menuId}
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            className="md:hidden p-2 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-darkbg-hover"
          >
            {menuOpen ? <X className="w-5 h-5" aria-hidden="true" /> : <Menu className="w-5 h-5" aria-hidden="true" />}
          </button>
          <Breadcrumbs />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <GlobalSearch className="hidden lg:block w-72" />
          <Link
            href="/batches/new"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white transition-colors"
          >
            <PlusCircle className="w-3.5 h-3.5" aria-hidden="true" />
            <span>New Batch</span>
          </Link>
          <Link
            href="/settings"
            title="Execution mode - open Settings to change"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
              mode === "live"
                ? "bg-sky-50 dark:bg-sky-950/40 text-sky-900 dark:text-sky-200 border-sky-300 dark:border-sky-800"
                : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-mint border-emerald-300 dark:border-emerald-800"
            }`}
          >
            <span aria-hidden="true" className={`w-2 h-2 rounded-full ${mode === "live" ? "bg-sky-500" : "bg-emerald-500"}`} />
            <span>{mode === "live" ? "Live Mode" : "Demo Mode"}</span>
          </Link>
          {authConfigured() && mode === "live" && (
            user ? (
              <button
                type="button"
                onClick={signOut}
                title={`Signed in as ${user.email}. Click to sign out.`}
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border border-slate-300 dark:border-darkbg-border text-slate-800 dark:text-slate-200 max-w-[11rem]"
              >
                <span className="truncate">{user.email}</span>
                <span className="font-bold">Sign out</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void startLogin()}
                className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-semibold border border-emerald-700 text-emerald-900 dark:text-mint hover:bg-emerald-50 dark:hover:bg-emerald-950"
              >
                Sign in
              </button>
            )
          )}
          <ThemeToggle />
        </div>
      </div>

      <div id={menuId} hidden={!menuOpen} className="md:hidden border-t border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card py-3 px-4 space-y-3">
        <GlobalSearch className="lg:hidden" />
        <nav aria-label="Primary" className="space-y-3">
          {NAV_GROUPS.map((group) => (
            <div key={group.name}>
              <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-text-dark-muted">{group.name}</p>
              <ul className="mt-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isNavActive(item, pathname);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium ${
                          active
                            ? "bg-emerald-50 dark:bg-emerald-950/80 text-emerald-900 dark:text-mint font-semibold"
                            : "text-slate-700 dark:text-text-dark-secondary hover:bg-slate-50 dark:hover:bg-darkbg-hover"
                        }`}
                      >
                        <Icon className="w-4 h-4" aria-hidden="true" />
                        <span>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </header>
  );
}
