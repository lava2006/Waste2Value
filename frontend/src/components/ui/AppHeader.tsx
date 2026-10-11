"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Menu,
  X,
  Search,
  Sparkles,
  ShieldCheck,
  PlusCircle,
  Layers,
  LayoutDashboard,
  Award,
  QrCode,
  Settings,
} from "lucide-react";
import { ThemeToggle } from "../theme-toggle";
import { getExecutionMode } from "@/lib/api-client";

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mode, setMode] = useState<"demo" | "live">("demo");
  const [globalSearch, setGlobalSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMode(getExecutionMode());
  }, [pathname]);

  // Global keyboard shortcut: pressing '/' focuses the search bar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement).tagName)
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Don't render on landing page
  if (pathname === "/") return null;

  // Generate readable contextual breadcrumbs
  const pathSegments = pathname.split("/").filter(Boolean);
  const breadcrumbMap: Record<string, string> = {
    dashboard: "Overview",
    batches: "Batches",
    new: "Intake Wizard",
    evidence: "Evidence Review",
    passports: "Circularity Passport",
    verify: "Public Verification",
    settings: "Settings",
  };

  const navLinks = [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/batches", label: "Batches", icon: Layers },
    { href: "/batches/new", label: "New Batch Intake", icon: PlusCircle },
    { href: "/evidence/doc-101", label: "Evidence Dossiers", icon: Search },
    { href: "/passports/W2V-CP-0001", label: "Circularity Passports", icon: Award },
    { href: "/verify/W2V-CP-0001", label: "Public Verification", icon: QrCode },
    { href: "/settings", label: "System Settings", icon: Settings },
  ];

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (globalSearch.trim()) {
      router.push(`/batches?search=${encodeURIComponent(globalSearch.trim())}`);
    }
  };

  return (
    <header className="sticky top-0 z-30 w-full h-16 border-b border-slate-200/80 dark:border-darkbg-border bg-white/90 dark:bg-darkbg-DEFAULT/90 backdrop-blur-md transition-colors">
      <div className="h-full px-4 sm:px-6 flex items-center justify-between gap-4">
        {/* Left: Mobile Toggle & Contextual Breadcrumbs */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-darkbg-hover"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs truncate">
            <Link
              href="/dashboard"
              className="text-slate-400 dark:text-text-dark-muted hover:text-slate-700 dark:hover:text-white transition-colors"
            >
              App
            </Link>
            {pathSegments.map((segment, idx) => {
              const isLast = idx === pathSegments.length - 1;
              const href = `/${pathSegments.slice(0, idx + 1).join("/")}`;
              const label = breadcrumbMap[segment] || segment;

              return (
                <React.Fragment key={href}>
                  <span className="text-slate-300 dark:text-darkbg-border">/</span>
                  {isLast ? (
                    <span className="font-semibold text-slate-900 dark:text-white truncate">
                      {label}
                    </span>
                  ) : (
                    <Link
                      href={href}
                      className="text-slate-500 dark:text-text-dark-secondary hover:text-slate-900 dark:hover:text-white transition-colors truncate"
                    >
                      {label}
                    </Link>
                  )}
                </React.Fragment>
              );
            })}
          </nav>
        </div>

        {/* Right: Global Search & Quick Actions */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Global search form */}
          <form onSubmit={handleSearchSubmit} className="hidden lg:flex items-center relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search batches, recycler, passport..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              className="pl-8 pr-8 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-darkbg-card border border-slate-200/80 dark:border-darkbg-border text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 w-64 transition-all"
              aria-label="Global search across batches and passports"
            />
            <kbd className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-mono bg-white dark:bg-darkbg-hover rounded border border-slate-200 dark:border-darkbg-border text-slate-400 pointer-events-none">
              /
            </kbd>
          </form>

          {/* New batch action */}
          <Link
            href="/batches/new"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>New Intake</span>
          </Link>

          {/* Environment Mode Badge */}
          <Link
            href="/settings"
            className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
              mode === "live"
                ? "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800/60"
                : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-mint border-emerald-200 dark:border-emerald-800/60"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                mode === "live" ? "bg-sky-500 animate-pulse" : "bg-emerald-500"
              }`}
            />
            <span>{mode === "live" ? "Live API" : "Demo Mode"}</span>
          </Link>

          {/* Theme Switcher */}
          <ThemeToggle />
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card py-3 px-4 shadow-xl">
          <nav className="flex flex-col gap-1">
            {navLinks.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-mint font-semibold"
                      : "text-slate-600 dark:text-text-dark-secondary hover:bg-slate-50 dark:hover:bg-darkbg-hover"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
