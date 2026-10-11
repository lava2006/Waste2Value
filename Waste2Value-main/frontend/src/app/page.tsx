"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ShieldCheck,
  Cpu,
  FileText,
  QrCode,
  Scale,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Coins,
  Layers,
  Recycle,
  Lock,
  ExternalLink,
  ChevronRight,
  Sliders,
  FileSearch,
  Award,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/Button";
import { StatusBadge, RiskBadge, AiBadge } from "@/components/ui/Badge";

export default function LandingPage() {
  const [sliderKg, setSliderKg] = useState<number>(5000);

  // Dynamic simulation for Value Intelligence interactive widget
  const simulatedGoldKg = (sliderKg * 0.00025).toFixed(2);
  const simulatedCopperKg = (sliderKg * 0.144).toFixed(1);
  const simulatedAluminumKg = (sliderKg * 0.092).toFixed(1);
  const simulatedValueUsd = Math.round(
    parseFloat(simulatedGoldKg) * 82500 +
    parseFloat(simulatedCopperKg) * 9.4 +
    parseFloat(simulatedAluminumKg) * 2.45
  );

  return (
    <div className="flex flex-col flex-1">
      {/* 1. HERO SECTION */}
      <section className="relative overflow-hidden pt-12 pb-20 sm:pt-20 sm:pb-32 border-b border-slate-200/70 dark:border-darkbg-border bg-gradient-to-b from-cream via-cream to-mint-bg dark:from-darkbg dark:via-darkbg dark:to-[#0D1912]">
        {/* Colorful background radial glows */}
        <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[350px] bg-gradient-to-tr from-emerald-500/20 via-turquoise-400/15 to-transparent blur-3xl rounded-full pointer-events-none -z-10" />
        <div className="absolute top-1/3 right-1/4 translate-x-1/3 w-[450px] h-[350px] bg-gradient-to-br from-lime/20 via-emerald-600/10 to-transparent blur-3xl rounded-full pointer-events-none -z-10" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Column: Headlines & Call to Actions */}
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/70 text-emerald-800 dark:text-mint border border-emerald-300/80 dark:border-emerald-800/80 shadow-xs">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-lime" />
                <span>AI-Powered Circular Economy & Documentary Verification Platform</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-slate-950 dark:text-white leading-[1.08]">
                Turn Waste Into{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-forest via-emerald-600 to-turquoise dark:from-mint dark:via-emerald-400 dark:to-lime">
                  Verified Value.
                </span>
              </h1>

              <p className="text-base sm:text-lg text-slate-600 dark:text-text-dark-secondary max-w-2xl leading-relaxed">
                Reconcile e-waste documentary evidence across the entire recycling lifecycle, estimate recovered material wealth (Au, Cu, Al), detect mass-balance discrepancies, and issue verifiable Circularity Passports.
              </p>

              <div className="flex flex-wrap items-center gap-3.5 pt-2">
                <Link href="/dashboard">
                  <Button size="lg" variant="primary" rightIcon={<ArrowRight className="w-4 h-4" />}>
                    Explore Dashboard
                  </Button>
                </Link>
                <Link href="#how-it-works">
                  <Button variant="outline" size="lg">
                    See How It Works
                  </Button>
                </Link>
                <Link href="/verify/W2V-CP-0001">
                  <Button variant="ghost" size="lg" leftIcon={<QrCode className="w-4 h-4 text-emerald-600 dark:text-lime" />}>
                    Public QR Verification
                  </Button>
                </Link>
              </div>

              {/* Guarantees Matrix */}
              <div className="pt-6 border-t border-slate-200/80 dark:border-darkbg-border grid grid-cols-3 gap-4 text-xs">
                <div className="p-3 rounded-xl bg-white/60 dark:bg-darkbg-card/60 border border-slate-200/60 dark:border-darkbg-border">
                  <span className="block font-bold text-slate-900 dark:text-white text-sm">
                    Deterministic
                  </span>
                  <span className="text-slate-500 dark:text-text-dark-muted text-[11px]">
                    10 cross-document checks
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-white/60 dark:bg-darkbg-card/60 border border-slate-200/60 dark:border-darkbg-border">
                  <span className="block font-bold text-slate-900 dark:text-white text-sm">
                    Rule-based findings
                  </span>
                  <span className="text-slate-500 dark:text-text-dark-muted text-[11px]">
                    Each cites its source document
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-white/60 dark:bg-darkbg-card/60 border border-slate-200/60 dark:border-darkbg-border">
                  <span className="block font-bold text-slate-900 dark:text-white text-sm">
                    Hash-verified
                  </span>
                  <span className="text-slate-500 dark:text-text-dark-muted text-[11px]">
                    SHA-256 payload integrity
                  </span>
                </div>
              </div>
            </div>

            {/* Right Column: Interactive Live Preview Card */}
            <div className="lg:col-span-5">
              <div className="relative rounded-3xl border border-emerald-500/30 dark:border-emerald-500/40 bg-white/95 dark:bg-darkbg-card p-6 shadow-2xl shadow-emerald-950/15 backdrop-blur-xl">
                {/* Accent glow corner */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-lime/10 rounded-full blur-2xl pointer-events-none" />

                <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-darkbg-border">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-slate-500 dark:text-text-dark-muted">
                      BATCH-2025-001
                    </span>
                    <StatusBadge status="SUPPORTED" />
                  </div>
                  <span className="text-xs font-bold text-emerald-600 dark:text-lime flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> Passport Issued
                  </span>
                </div>

                <div className="mt-5 space-y-4">
                  {/* Mass Balance Bar */}
                  <div className="bg-emerald-50/60 dark:bg-emerald-950/40 rounded-2xl p-4 border border-emerald-200/70 dark:border-emerald-900/60">
                    <div className="flex justify-between text-xs text-slate-600 dark:text-text-dark-secondary font-medium">
                      <span>Claimed: 5,000 kg</span>
                      <span className="font-bold text-emerald-700 dark:text-mint">Verified: 4,960 kg</span>
                    </div>
                    <div className="mt-2 w-full bg-slate-200 dark:bg-darkbg-border rounded-full h-2.5 overflow-hidden">
                      <div className="bg-gradient-to-r from-emerald-600 to-turquoise h-full rounded-full" style={{ width: "99.2%" }} />
                    </div>
                    <p className="mt-2 text-[11px] text-emerald-800 dark:text-mint font-medium flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-lime" />
                      <span>Variance 40 kg (0.8% loss) is within 2.0% IT stream tolerance.</span>
                    </p>
                  </div>

                  {/* Value Intelligence Metrics */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-darkbg-hover border border-slate-200/60 dark:border-darkbg-border">
                      <span className="text-slate-500 dark:text-text-dark-muted block text-[11px] font-medium">
                        Net Recovery Value
                      </span>
                      <span className="text-xl font-black text-slate-900 dark:text-white mt-0.5 block text-gradient-gold">
                        $103,448 USD
                      </span>
                      <span className="text-[10px] text-emerald-600 dark:text-mint font-medium">
                        1.24 kg Gold + 714 kg Copper
                      </span>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-darkbg-hover border border-slate-200/60 dark:border-darkbg-border">
                      <span className="text-slate-500 dark:text-text-dark-muted block text-[11px] font-medium">
                        Circular Pathway
                      </span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white mt-1 block">
                        Material Recovery
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-text-dark-muted">
                        Pyrometallurgical smelting
                      </span>
                    </div>
                  </div>

                  {/* Passport Card Mini Teaser */}
                  <div className="p-3.5 rounded-2xl border border-dashed border-emerald-400 dark:border-emerald-600/60 bg-emerald-500/5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 bg-white rounded-lg border border-slate-200 dark:border-darkbg-border shadow-xs">
                        <QRCodeSVG value="/verify/W2V-CP-0001" size={36} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white">
                          Circularity Passport W2V-CP-0001
                        </p>
                        <p className="text-[10px] font-mono text-slate-400 dark:text-text-dark-muted truncate max-w-[150px]">
                          SHA-256 integrity hash
                        </p>
                      </div>
                    </div>
                    <Link
                      href="/passports/W2V-CP-0001"
                      className="text-xs font-bold text-emerald-700 dark:text-mint hover:underline flex items-center gap-1 shrink-0"
                    >
                      Certificate <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. DUAL INTELLIGENCE ENGINES SECTION */}
      <section className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-lime">
            Dual Engine Architecture
          </span>
          <h2 className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-white sm:text-4xl">
            Two Engines, One Verifiable Truth
          </h2>
          <p className="mt-3 text-sm sm:text-base text-slate-600 dark:text-text-dark-secondary leading-relaxed">
            Waste2Value combines economic material intelligence with deterministic evidence reconciliation to evaluate both value and compliance.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Engine 1: Value Intelligence with Interactive Mass Calculator */}
          <div className="rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-8 shadow-card hover:shadow-card-hover transition-all">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-mint flex items-center justify-center mb-6 border border-emerald-200 dark:border-emerald-800">
              <Coins className="w-6 h-6" />
            </div>

            <h3 className="text-xl font-bold text-slate-900 dark:text-white">
              1. Value Intelligence Engine
            </h3>
            <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-text-dark-secondary leading-relaxed">
              Estimates recoverable precious and critical materials using benchmark elemental composition modeling and market pricing.
            </p>

            {/* Interactive Calculator Slider */}
            <div className="mt-6 p-4 rounded-2xl bg-slate-50 dark:bg-darkbg-hover border border-slate-200/60 dark:border-darkbg-border space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-700 dark:text-text-dark-primary flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-emerald-600 dark:text-lime" />
                  Simulate IT Scrap Consignment:
                </span>
                <span className="font-mono font-bold text-emerald-700 dark:text-mint">
                  {sliderKg.toLocaleString("en-US")} kg
                </span>
              </div>
              <input
                type="range"
                min={1000}
                max={25000}
                step={500}
                value={sliderKg}
                onChange={(e) => setSliderKg(Number(e.target.value))}
                className="w-full accent-emerald-600 cursor-pointer"
              />
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/50 dark:border-darkbg-border text-center">
                <div className="p-2 rounded-xl bg-white dark:bg-darkbg-card border border-slate-200/60 dark:border-darkbg-border">
                  <span className="text-[10px] text-slate-400 block font-medium">Gold (Au)</span>
                  <span className="font-bold text-xs text-amber-600 dark:text-amber-400">{simulatedGoldKg} kg</span>
                </div>
                <div className="p-2 rounded-xl bg-white dark:bg-darkbg-card border border-slate-200/60 dark:border-darkbg-border">
                  <span className="text-[10px] text-slate-400 block font-medium">Copper (Cu)</span>
                  <span className="font-bold text-xs text-emerald-600 dark:text-emerald-400">{simulatedCopperKg} kg</span>
                </div>
                <div className="p-2 rounded-xl bg-white dark:bg-darkbg-card border border-slate-200/60 dark:border-darkbg-border">
                  <span className="text-[10px] text-slate-400 block font-medium">Estimated Value</span>
                  <span className="font-bold text-xs text-slate-900 dark:text-white">${simulatedValueUsd.toLocaleString("en-US")}</span>
                </div>
              </div>
            </div>

            <ul className="mt-6 space-y-3 text-xs text-slate-700 dark:text-text-dark-secondary">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-lime mt-0.5 shrink-0" />
                <span><strong>Compositional Fractions:</strong> Models high-value fractions per stream.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-lime mt-0.5 shrink-0" />
                <span><strong>Net Recovery Valuation:</strong> Deducts modeled industrial refining and logistics costs.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-lime mt-0.5 shrink-0" />
                <span><strong>Circular Pathways:</strong> Evaluates reuse, refurbishment, component harvesting, or material recovery.</span>
              </li>
            </ul>
          </div>

          {/* Engine 2: Evidence Intelligence */}
          <div className="rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-8 shadow-card hover:shadow-card-hover transition-all">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 dark:bg-teal-950/80 text-teal-700 dark:text-turquoise flex items-center justify-center mb-6 border border-teal-200 dark:border-teal-800">
              <Scale className="w-6 h-6" />
            </div>

            <h3 className="text-xl font-bold text-slate-900 dark:text-white">
              2. Evidence Intelligence Engine
            </h3>
            <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-text-dark-secondary leading-relaxed">
              Applies 10 deterministic mass-balance and chronological rules to check if reported outcomes are supported by documentary proof.
            </p>

            {/* Document AI Extraction preview */}
            <div className="mt-6 p-4 rounded-2xl bg-slate-50 dark:bg-darkbg-hover border border-slate-200/60 dark:border-darkbg-border space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 dark:text-text-dark-primary flex items-center gap-1.5">
                  <FileSearch className="w-3.5 h-3.5 text-teal-600 dark:text-turquoise" />
                  Extracted fields (illustrative sample):
                </span>
                <span className="text-[10px] font-mono text-emerald-600 dark:text-lime font-bold">Sample OCR conf. 98.2%</span>
              </div>
              <div className="space-y-1.5 font-mono text-[11px] bg-white dark:bg-darkbg-card p-3 rounded-xl border border-slate-200/60 dark:border-darkbg-border">
                <div className="flex justify-between">
                  <span className="text-slate-400">Waybill Consignment:</span>
                  <span className="font-bold text-slate-800 dark:text-white">5,000 kg</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Scale Intake Ticket:</span>
                  <span className="font-bold text-slate-800 dark:text-white">4,960 kg</span>
                </div>
                <div className="flex justify-between text-emerald-600 dark:text-mint pt-1 border-t border-slate-100 dark:border-darkbg-border">
                  <span>Reconciliation Delta:</span>
                  <span>-40 kg (0.8% loss &le; 2.0% tol)</span>
                </div>
              </div>
            </div>

            <ul className="mt-6 space-y-3 text-xs text-slate-700 dark:text-text-dark-secondary">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-teal-600 dark:text-turquoise mt-0.5 shrink-0" />
                <span><strong>Multi-Stage Reconciliation:</strong> Compares collection manifests, weighbridge tickets, and certificates.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-teal-600 dark:text-turquoise mt-0.5 shrink-0" />
                <span><strong>Policy-Driven Tolerances:</strong> Configured by stream (Batteries: 1.5%, IT: 2.0%, Appliances: 5.0%).</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-teal-600 dark:text-turquoise mt-0.5 shrink-0" />
                <span><strong>Explainable Audit Findings:</strong> Distinctly separates discrepancies from automatic rejections.</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* 3. FOUR-STEP WORKFLOW */}
      <section id="how-it-works" className="py-20 bg-slate-50/70 dark:bg-darkbg-card/40 border-y border-slate-200/70 dark:border-darkbg-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-lime">
              System Lifecycle
            </span>
            <h2 className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-white">
              From Physical Intake to Verifiable Passport in 4 Steps
            </h2>
          </div>

          <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                step: "01",
                title: "Consignment Intake",
                desc: "Declare e-waste category, claimed mass, origin, and transporter details.",
                icon: Layers,
                color: "emerald",
              },
              {
                step: "02",
                title: "Document AI Extraction",
                desc: "Extract waybills, scale tickets, and certificates with confidence scores and spatial bounding boxes.",
                icon: FileText,
                color: "teal",
              },
              {
                step: "03",
                title: "Deterministic Verification",
                desc: "Reconcile mass balance, verify chronological plausibility, and check recycler license validity.",
                icon: Scale,
                color: "violet",
              },
              {
                step: "04",
                title: "Circularity Passport",
                desc: "Issue a digital passport with a SHA-256 integrity hash. An issuer signature is shown only when a signing key is configured.",
                icon: Award,
                color: "lime",
              },
            ].map((st) => {
              const Icon = st.icon;
              return (
                <div
                  key={st.step}
                  className="rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-6 relative flex flex-col justify-between shadow-card hover:-translate-y-1 hover:shadow-card-hover transition-all"
                >
                  <div>
                    <div className="flex items-center justify-between mb-5">
                      <span className="font-mono text-3xl font-black text-slate-200 dark:text-darkbg-border">
                        {st.step}
                      </span>
                      <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-mint border border-emerald-200 dark:border-emerald-800">
                        <Icon className="w-5 h-5" />
                      </div>
                    </div>
                    <h4 className="text-base font-bold text-slate-900 dark:text-white">
                      {st.title}
                    </h4>
                    <p className="mt-2 text-xs text-slate-500 dark:text-text-dark-secondary leading-relaxed">
                      {st.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 4. PRELOADED COMPLIANCE DEMO SCENARIOS */}
      <section className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-lime">
            Reproducible Demo Scenarios
          </span>
          <h2 className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-white">
            Evaluate Real Compliance Scenarios
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-text-dark-secondary">
            Explore three deterministic synthetic scenarios representing common auditor investigations.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Scenario A: Clean */}
          <div className="rounded-3xl border border-emerald-200 dark:border-emerald-800/80 bg-white dark:bg-darkbg-card p-6 flex flex-col justify-between shadow-card hover:shadow-card-hover transition-all">
            <div>
              <div className="flex justify-between items-center mb-3">
                <span className="font-mono text-xs font-bold text-slate-500 dark:text-text-dark-muted">
                  BATCH-2025-001
                </span>
                <StatusBadge status="SUPPORTED" />
              </div>
              <h4 className="text-base font-bold text-slate-900 dark:text-white">
                Scenario A &mdash; Clean Batch
              </h4>
              <p className="mt-2 text-xs text-slate-600 dark:text-text-dark-secondary leading-relaxed">
                5,000 kg server PCBs. 4,960 kg verified input. 0.8% loss within 2.0% stream policy. Fully verified documentary trail; Circularity Passport issued.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-darkbg-border flex items-center justify-between">
              <RiskBadge level="low" score={5} />
              <Link href="/batches/batch-001">
                <Button size="sm" variant="outline">
                  Inspect Batch
                </Button>
              </Link>
            </div>
          </div>

          {/* Scenario B: Borderline Deficit */}
          <div className="rounded-3xl border border-amber-200 dark:border-amber-800/80 bg-white dark:bg-darkbg-card p-6 flex flex-col justify-between shadow-card hover:shadow-card-hover transition-all">
            <div>
              <div className="flex justify-between items-center mb-3">
                <span className="font-mono text-xs font-bold text-slate-500 dark:text-text-dark-muted">
                  BATCH-2025-002
                </span>
                <StatusBadge status="REVIEW_REQUIRED" />
              </div>
              <h4 className="text-base font-bold text-slate-900 dark:text-white">
                Scenario B &mdash; Quantity Deficit
              </h4>
              <p className="mt-2 text-xs text-slate-600 dark:text-text-dark-secondary leading-relaxed">
                12,000 kg declared waybill vs 8,500 kg scale ticket. 3,500 kg (29.2%) deficit exceeds 3.5% tolerance. Assigned <strong className="text-amber-600">REVIEW_REQUIRED</strong> for auditor investigation (not auto-rejected).
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-darkbg-border flex items-center justify-between">
              <RiskBadge level="medium" score={40} />
              <Link href="/batches/batch-002">
                <Button size="sm" variant="outline">
                  Inspect Batch
                </Button>
              </Link>
            </div>
          </div>

          {/* Scenario C: High-Risk Suspicious */}
          <div className="rounded-3xl border border-rose-200 dark:border-rose-800/80 bg-white dark:bg-darkbg-card p-6 flex flex-col justify-between shadow-card hover:shadow-card-hover transition-all">
            <div>
              <div className="flex justify-between items-center mb-3">
                <span className="font-mono text-xs font-bold text-slate-500 dark:text-text-dark-muted">
                  BATCH-2025-003
                </span>
                <StatusBadge status="REJECTED" />
              </div>
              <h4 className="text-base font-bold text-slate-900 dark:text-white">
                Scenario C &mdash; High-Risk Rejection
              </h4>
              <p className="mt-2 text-xs text-slate-600 dark:text-text-dark-secondary leading-relaxed">
                25,000 kg claimed claim with missing documents and anachronistic dates (processing date precedes collection date). Explicit rejection criteria triggered.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-darkbg-border flex items-center justify-between">
              <RiskBadge level="high" score={99} />
              <Link href="/batches/batch-003">
                <Button size="sm" variant="outline">
                  Inspect Batch
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 5. TRUST, TRANSPARENCY & CRYPTOGRAPHY SECTION */}
      <section className="py-16 bg-cream dark:bg-darkbg border-t border-slate-200/80 dark:border-darkbg-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-4">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 dark:text-mint flex items-center justify-center mx-auto border border-emerald-200 dark:border-emerald-800">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            Cryptographic Integrity & Boundary Clarity
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-text-dark-secondary max-w-2xl mx-auto leading-relaxed">
            A SHA-256 hash lets anyone detect whether a passport payload was modified after issuance. Issuer authenticity is established only when a valid signature from a configured key service is present; a hash alone does not identify the issuer.
          </p>
          <p className="text-[11px] text-slate-400 dark:text-text-dark-muted max-w-xl mx-auto italic">
            Notice: Cryptographic verification validates documentary and ledger data consistency. It does not replace independent on-site physical auditing.
          </p>
        </div>
      </section>

      {/* 6. CALL TO ACTION BANNER */}
      <section className="py-14 bg-gradient-to-r from-forest via-emerald-800 to-teal-900 text-white shadow-inner">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="text-2xl sm:text-3xl font-black tracking-tight">
              Ready to verify recycling claims and value recovered assets?
            </h3>
            <p className="mt-1 text-sm text-emerald-100/85">
              Launch the operational dashboard or start an evidence intake session.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Link href="/batches/new">
              <Button size="lg" variant="lime">
                Create New Batch
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button size="lg" variant="outline" className="text-white border-white/40 hover:bg-white/10">
                View Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
