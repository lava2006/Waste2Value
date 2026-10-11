"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import confetti from "canvas-confetti";
import {
  ShieldCheck,
  Printer,
  Copy,
  ExternalLink,
  Check,
  AlertTriangle,
  QrCode,
  ArrowLeft,
  Sparkles,
  Lock,
  Building2,
  Calendar,
  Scale,
  Coins,
  FileCheck2,
  Ban,
  CheckCircle2,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { getPassportById, getStoredBatches, revokePassport } from "@/lib/store";
import { Batch, CircularityPassport } from "@/types";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PassportStatusBadge } from "@/components/ui/Badge";

export default function CircularityPassportPage() {
  const params = useParams();
  const id = params?.id as string;
  const { success, info } = useToast();

  const [passportData, setPassportData] = useState<{ batch?: Batch; passport?: CircularityPassport }>({});
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [revokeReason, setRevokeReason] = useState("");
  const [showValuationBreakdown, setShowValuationBreakdown] = useState(false);

  useEffect(() => {
    if (!id) return;

    // 1. Check by passport ID
    let data = getPassportById(id);

    // 2. If not found, check by batch ID
    if (!data.passport) {
      const allBatches = getStoredBatches();
      const match = allBatches.find((b) => b.id === id || b.batchNumber === id);
      if (match && match.passport) {
        data = { batch: match, passport: match.passport };
      }
    }

    setPassportData(data);

    if (data.passport && !data.passport.revoked) {
      confetti({
        particleCount: 35,
        spread: 60,
        origin: { y: 0.6 },
        colors: ["#059669", "#A7F3D0", "#BEF264"],
      });
    }
  }, [id]);

  const { batch, passport } = passportData;

  if (!passport || !batch) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          Circularity Passport Not Found
        </h2>
        <p className="text-xs text-slate-500">
          No authoritative passport matching &quot;{id}&quot; was located.
        </p>
        <Link href="/batches">
          <Button variant="outline">Back to Batches Directory</Button>
        </Link>
      </div>
    );
  }

  const publicVerificationUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/verify/${passport.passportId}`
      : `/verify/${passport.passportId}`;

  const handleCopyLink = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(publicVerificationUrl);
      setCopiedLink(true);
      success("Verification Link Copied", "Shareable URL copied to clipboard.");
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleCopyHash = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(passport.sha256Hash);
      setCopiedHash(true);
      success("SHA-256 Hash Copied", "RFC 8785 canonical hash copied to clipboard.");
      setTimeout(() => setCopiedHash(false), 2000);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleRevoke = () => {
    if (!revokeReason.trim()) return;
    revokePassport(passport.passportId, revokeReason);
    setPassportData(getPassportById(passport.passportId));
    setShowRevokeModal(false);
    info("Passport Revoked", `Circularity Passport ${passport.passportId} has been revoked.`);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6">
      {/* Top Action Bar (Hidden in Print) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-darkbg-border no-print">
        <div>
          <Link
            href={`/batches/${batch.id}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-800 dark:hover:text-white mb-2 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Batch {batch.batchNumber}
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Circularity Passport &mdash; Evidence-Supported Record
            </h1>
            <PassportStatusBadge
              status={passport.revoked ? "REVOKED" : "ACTIVE"}
              passportId={passport.passportId}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" leftIcon={<Printer className="w-4 h-4" />} onClick={handlePrint}>
            Print Certificate
          </Button>
          <Button
            size="sm"
            variant="outline"
            leftIcon={copiedLink ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            onClick={handleCopyLink}
          >
            {copiedLink ? "Link Copied" : "Share Link"}
          </Button>
          <Link href={`/verify/${passport.passportId}`}>
            <Button size="sm" variant="primary" leftIcon={<ExternalLink className="w-4 h-4" />}>
              Public Portal
            </Button>
          </Link>
          {!passport.revoked && (
            <Button
              size="sm"
              variant="ghost"
              className="text-rose-600 hover:text-rose-700"
              leftIcon={<Ban className="w-4 h-4" />}
              onClick={() => setShowRevokeModal(true)}
            >
              Revoke
            </Button>
          )}
        </div>
      </div>

      {/* Revocation Banner (if revoked) */}
      {passport.revoked && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200 flex items-start gap-3">
          <Ban className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <strong className="font-bold">Passport Invalidation Notice:</strong> This Circularity Passport has been officially revoked by a compliance auditor.
            {passport.revocationReason && (
              <p className="mt-1 font-mono text-[11px]">Audit Reason: {passport.revocationReason}</p>
            )}
          </div>
        </div>
      )}

      {/* Main Certificate Card */}
      <div className="rounded-3xl border-2 border-emerald-500/30 dark:border-emerald-500/20 bg-white dark:bg-darkbg-card p-6 sm:p-10 shadow-2xl space-y-8 relative overflow-hidden">
        {/* Certificate Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 pb-6 border-b border-slate-200/80 dark:border-darkbg-border">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-mono font-bold tracking-widest uppercase text-emerald-700 dark:text-mint">
                E-WASTE CIRCULARITY RECORD
              </span>
            </div>
            <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              Circularity Passport
            </h2>
            <p className="text-xs text-slate-500 font-mono">
              PASSPORT ID: <strong className="text-slate-900 dark:text-white">{passport.passportId}</strong> &bull; VERSION {passport.version}
            </p>
          </div>

          {/* QR Code */}
          <div className="p-3 bg-white rounded-2xl border border-slate-200 shadow-sm shrink-0">
            <QRCodeSVG value={publicVerificationUrl} size={96} level="M" />
            <span className="block text-[9px] text-center text-slate-400 font-mono mt-1">
              SCAN TO VERIFY
            </span>
          </div>
        </div>

        {/* Quantities Grid with Explicit Lifecycle Labels */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-darkbg-hover border border-slate-200/60 dark:border-darkbg-border">
            <span className="text-slate-400 block text-[11px] mb-1">Claimed Physical Mass</span>
            <span className="text-base font-bold text-slate-900 dark:text-white font-mono">
              {passport.claimedKg.toLocaleString()} kg
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">Shipper declared</span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-darkbg-hover border border-slate-200/60 dark:border-darkbg-border">
            <span className="text-slate-400 block text-[11px] mb-1">Received Mass (Weighbridge)</span>
            <span className="text-base font-bold text-emerald-600 dark:text-mint font-mono">
              {passport.evidenceSupportedKg.toLocaleString()} kg
            </span>
            <span className="text-[10px] text-emerald-600 dark:text-mint block mt-0.5">Scale ticket verified</span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-darkbg-hover border border-slate-200/60 dark:border-darkbg-border">
            <span className="text-slate-400 block text-[11px] mb-1">Recovery Yield Rate</span>
            <span className="text-base font-bold text-slate-900 dark:text-white font-mono">
              {passport.recoveryRatePercent}%
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">Net recovery ratio</span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-darkbg-hover border border-slate-200/60 dark:border-darkbg-border">
            <span className="text-slate-400 block text-[11px] mb-1">Net Modeled Value</span>
            <span className="text-base font-bold text-slate-900 dark:text-white font-mono">
              ${passport.estimatedValueUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">LME benchmark modeled</span>
          </div>
        </div>

        {/* Expandable Valuation Breakdown */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-darkbg-border bg-slate-50/50 dark:bg-darkbg-hover/30 p-4 space-y-3">
          <div
            onClick={() => setShowValuationBreakdown(!showValuationBreakdown)}
            className="flex items-center justify-between cursor-pointer select-none"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
              <Coins className="w-4 h-4 text-emerald-600 dark:text-mint" />
              <span>Recoverable Valuation Breakdown (Illustrative Model)</span>
            </div>
            <button
              type="button"
              className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
              aria-label={showValuationBreakdown ? "Collapse valuation breakdown" : "Expand valuation breakdown"}
            >
              <span>{showValuationBreakdown ? "Collapse" : "Inspect Assumptions"}</span>
              {showValuationBreakdown ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          {showValuationBreakdown && (
            <div className="space-y-3 pt-2 border-t border-slate-200/60 dark:border-darkbg-border text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px]">
                <div className="p-2.5 rounded-xl bg-white dark:bg-darkbg-card border border-slate-200/60 dark:border-darkbg-border">
                  <span className="text-slate-400 block">Gross Recovered Commodities</span>
                  <span className="font-bold text-slate-900 dark:text-white font-mono text-sm">
                    ${batch.materialEstimate.totalGrossValueUsd.toLocaleString()}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-white dark:bg-darkbg-card border border-slate-200/60 dark:border-darkbg-border">
                  <span className="text-slate-400 block">Modeled Refining Deductions</span>
                  <span className="font-bold text-rose-600 dark:text-coral font-mono text-sm">
                    -${batch.materialEstimate.modeledProcessingCostUsd.toLocaleString()}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-white dark:bg-darkbg-card border border-slate-200/60 dark:border-darkbg-border">
                  <span className="text-slate-400 block">Net Estimated Wealth</span>
                  <span className="font-bold text-emerald-600 dark:text-mint font-mono text-sm">
                    ${batch.materialEstimate.netEstimatedRecoveryValueUsd.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Material Fractions Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="text-[10px] uppercase text-slate-400 border-b border-slate-200/60 dark:border-darkbg-border">
                    <tr>
                      <th className="pb-1.5 font-bold">Material Fraction</th>
                      <th className="pb-1.5 font-bold">Content Yield</th>
                      <th className="pb-1.5 font-bold">Est. Mass (kg)</th>
                      <th className="pb-1.5 font-bold">Benchmark Rate ($/kg)</th>
                      <th className="pb-1.5 font-bold text-right">Modeled Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border">
                    {batch.materialEstimate.fractions.map((f, idx) => (
                      <tr key={idx}>
                        <td className="py-2 font-medium text-slate-900 dark:text-white">{f.materialName}</td>
                        <td className="py-2 font-mono">{f.fractionPercentage}%</td>
                        <td className="py-2 font-mono">{f.estimatedQuantityKg.toLocaleString()} kg</td>
                        <td className="py-2 font-mono">${f.unitPriceUsd.toLocaleString()}</td>
                        <td className="py-2 font-mono font-bold text-right text-emerald-600 dark:text-mint">
                          ${f.estimatedValueUsd.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-[10px] text-slate-400 italic">
                Reference Dataset: {batch.materialEstimate.datasetVersion} (as of {batch.materialEstimate.referencePriceDate}). Values are illustrative simulations for economic planning.
              </p>
            </div>
          )}
        </div>

        {/* Cryptographic Authenticity Block */}
        <div className="rounded-2xl bg-slate-50 dark:bg-darkbg-hover p-5 border border-slate-200/60 dark:border-darkbg-border space-y-3 font-mono text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-slate-400">Canonical SHA-256 Digest:</span>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 dark:text-white break-all text-[11px]">
                {passport.sha256Hash}
              </span>
              <button
                onClick={handleCopyHash}
                className="text-slate-400 hover:text-emerald-600 shrink-0"
                title="Copy hash"
                aria-label="Copy SHA-256 hash"
              >
                {copiedHash ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-200/50 dark:border-darkbg-border">
            <span className="text-slate-400">Issuer Signature:</span>
            <span className="font-bold text-emerald-600 dark:text-mint text-[11px]">
              {passport.signatureStatus === "NOT_CONFIGURED"
                ? "Issuer signature: Not configured"
                : passport.signatureStatus}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-200/50 dark:border-darkbg-border text-[11px]">
            <span className="text-slate-400">Issuing Engine Authority:</span>
            <span className="text-slate-700 dark:text-slate-300">{passport.issuerName}</span>
          </div>
        </div>

        {/* Regulatory Boundaries & Honest Audit Notice */}
        <div className="pt-2 text-center text-[11px] text-slate-400 dark:text-text-dark-muted leading-relaxed italic border-t border-slate-100 dark:border-darkbg-border">
          Regulatory Disclosure: This Circularity Passport establishes documentary and cryptographic mass-balance verification based on uploaded records. It does not replace national environmental permits, hazardous waste transport manifests, or physical independent recycling inspections.
        </div>
      </div>

      {/* Revocation Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showRevokeModal}
        title="Revoke Circularity Passport"
        description="Are you sure you want to revoke this passport? Revocation will permanently invalidate public verification for this passport ID."
        confirmText="Revoke Passport"
        variant="danger"
        onClose={() => setShowRevokeModal(false)}
        onConfirm={handleRevoke}
      >
        <div className="mt-3 text-left">
          <label htmlFor="revokeReasonInput" className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-text-dark-primary mb-1">
            Auditor Revocation Justification Reason *
          </label>
          <input
            id="revokeReasonInput"
            type="text"
            placeholder="e.g. Inbound weighbridge record was falsified or carrier manifest retracted..."
            value={revokeReason}
            onChange={(e) => setRevokeReason(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg-hover text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
        </div>
      </ConfirmDialog>
    </div>
  );
}
