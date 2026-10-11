"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLandingPage = pathname === "/";

  if (isLandingPage) {
    return (
      <div className="flex flex-col min-h-screen">
        <Navbar />
        <main className="flex-1 flex flex-col">{children}</main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-cream dark:bg-darkbg text-slate-900 dark:text-white transition-colors">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <AppHeader />
        <main className="flex-1 flex flex-col">{children}</main>
        <footer className="py-4 px-6 border-t border-slate-200/60 dark:border-darkbg-border text-center text-xs text-slate-400 dark:text-text-dark-muted">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <span>
              Waste2Value &copy; 2025 &bull; <strong className="text-emerald-600 dark:text-mint">Turn Waste Into Verified Value.</strong>
            </span>
            <span className="font-mono text-[11px]">
              RFC 8785 Canonical Serialization &bull; AWS KMS RSASSA-PSS &bull; Amazon Bedrock AI
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
