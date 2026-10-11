"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { CrumbProvider } from "./Breadcrumbs";

const SKIP_LINK =
  "sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:px-3 focus:py-2 focus:rounded-lg focus:bg-emerald-700 focus:text-white focus:text-sm focus:font-semibold";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/") {
    return (
      <div className="flex flex-col min-h-screen">
        <a href="#main-content" className={SKIP_LINK}>
          Skip to main content
        </a>
        <Navbar />
        <main id="main-content" className="flex-1 flex flex-col">
          {children}
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <CrumbProvider>
      <a href="#main-content" className={SKIP_LINK}>
        Skip to main content
      </a>
      <div className="flex min-h-screen bg-cream dark:bg-darkbg text-slate-900 dark:text-white no-print-shell">
        <div className="no-print contents">
          <AppSidebar />
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <div className="no-print">
            <AppHeader />
          </div>
          <main id="main-content" className="flex-1 flex flex-col min-w-0">
            {children}
          </main>
          <footer className="no-print py-4 px-4 sm:px-6 border-t border-slate-200/60 dark:border-darkbg-border text-xs text-slate-600 dark:text-text-dark-muted">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
              <span>
                Waste2Value &bull; <strong className="text-emerald-700 dark:text-mint">Turn Waste Into Verified Value.</strong>
              </span>
              <span className="text-[11px] text-center sm:text-right">
                Documentary verification only: hash checks and valuations do not prove physical recycling.
              </span>
            </div>
          </footer>
        </div>
      </div>
    </CrumbProvider>
  );
}
