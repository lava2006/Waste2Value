import React from "react";
import Link from "next/link";
import { ShieldCheck, FileText, Cpu, ExternalLink } from "lucide-react";

export function Footer() {
  return (
    <footer className="w-full border-t border-slate-200/80 dark:border-emerald-950/60 bg-white/60 dark:bg-[#070E0A]/90 backdrop-blur-md mt-auto transition-colors no-print">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2">
              <span className="font-bold text-base text-slate-900 dark:text-white">
                Waste<span className="text-emerald-600 dark:text-emerald-400">2</span>Value
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                Circular Intelligence
              </span>
            </div>
            <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-emerald-300/70 max-w-md leading-relaxed">
              Dual-engine platform reconciling e-waste recycling documentary evidence while estimating recoverable material wealth and issuing verifiable Circularity Passports.
            </p>
            <div className="mt-4 flex items-center gap-2 text-xs text-slate-500 dark:text-emerald-400/80">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Integrity check validates payload authenticity; does not replace physical audit.</span>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-emerald-200">
              Core Engines
            </h4>
            <ul className="mt-3 space-y-2 text-xs text-slate-600 dark:text-emerald-300/80">
              <li className="flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-emerald-500" />
                <span>Value Intelligence Engine</span>
              </li>
              <li className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-emerald-500" />
                <span>Evidence Intelligence Engine</span>
              </li>
              <li className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>Circularity Passport Service</span>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-emerald-200">
              Navigation
            </h4>
            <ul className="mt-3 space-y-2 text-xs text-slate-600 dark:text-emerald-300/80">
              <li>
                <Link href="/dashboard" className="hover:text-emerald-600 dark:hover:text-emerald-300 transition-colors">
                  Operational Dashboard
                </Link>
              </li>
              <li>
                <Link href="/batches" className="hover:text-emerald-600 dark:hover:text-emerald-300 transition-colors">
                  Batch Directory
                </Link>
              </li>
              <li>
                <Link href="/batches/new" className="hover:text-emerald-600 dark:hover:text-emerald-300 transition-colors">
                  Create Intake Batch
                </Link>
              </li>
              <li>
                <Link href="/settings" className="hover:text-emerald-600 dark:hover:text-emerald-300 transition-colors">
                  System Settings & Health
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-200/60 dark:border-emerald-950/40 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-emerald-400/60">
          <p>© 2025 Waste2Value. MIT License. Synthetic Demo Environment.</p>
          <div className="flex items-center gap-4">
            <span>Powered by AWS Serverless & Document AI Architecture</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
