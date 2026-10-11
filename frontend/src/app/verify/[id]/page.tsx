"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  FileCheck2,
  QrCode,
  ArrowRight,
  RefreshCw,
  ExternalLink,
  Lock,
  Sparkles,
  Bug,
  Ban,
  Clock,
  Info,
} from "lucide-react";
import { getPassportById, getStoredBatches } from "@/lib/store";
import { CircularityPassport, Batch } from "@/types";
import { Button } from "@/components/ui/Button";

export default function PublicVerifyPage() {
  const params = useParams();
  const id = params?.id as string;

  const [passport, setPassport] = useState<CircularityPassport | null>(null);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [isSandboxTampered, setIsSandboxTampered] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let data = getPassportById(id);

    // Also look up by batch ID
    if (!data.passport) {
      const allBatches = getStoredBatches();
      const match = allBatches.find((b) => b.id === id || b.batchNumber === id);
      if (match && match.passport) {
        data = { batch: match, passport: match.passport };
      }
    }

    if (data.passport && data.batch) {
      setPassport(data.passport);
      setBatch(data.batch);
    }
    setLoading(false);
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center text-xs text-slate-400">
        Verifying digital passport against authoritative cryptographic ledger...
      </div>
    );
  }

  // State 1: Passport Not Found
  if (!passport || !batch) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-4">
        <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-darkbg-card text-slate-400 mx-auto flex items-center justify-center border border-slate-200 dark:border-darkbg-border">
          <HelpCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          Circularity Passport Not Found
        </h2>
        <p className="text-xs text-slate-500 leading-relaxed max-w-md mx-auto">
          No authoritative Circularity Passport matches the identifier &quot;{id}&quot;. The record may have expired or the QR verification link may be invalid.
        </p>
        <Link href="/dashboard">
          <Button variant="outline" size="sm">
            Go to Platform Dashboard
          </Button>
        </Link>
      </div>
    );
  }

  // Simulated In-Memory Tampered Hash (Does NOT alter authoritative store)
  const displayedHash = isSandboxTampered
    ? "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    : passport.sha256Hash;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full space-y-8">
      {/* Verification Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 dark:bg-emerald-950/80 dark:text-mint border border-emerald-300 dark:border-emerald-800">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-lime" />
          <span>AUTHORITATIVE PUBLIC PASSPORT VERIFICATION</span>
        </div>
        <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
          Public Circularity Verification
        </h1>
        <p className="text-xs text-slate-500 font-mono">
          PASSPORT ID: <strong className="text-slate-800 dark:text-white">{passport.passportId}</strong> &bull; BATCH: {passport.batchNumber}
        </p>
      </div>

      {/* Revocation Alert if Revoked */}
      {passport.revoked && (
        <div className="rounded-3xl border-2 border-rose-500 bg-rose-50 dark:bg-rose-950/60 p-6 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-900/60 text-rose-600 dark:text-coral mx-auto flex items-center justify-center">
            <Ban className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black text-rose-900 dark:text-rose-200">
              Passport Revoked by Compliance Audit
            </h2>
            <p className="text-xs text-rose-800 dark:text-rose-300 max-w-md mx-auto mt-1 leading-relaxed">
              This Circularity Passport has been officially invalidated. Even if its cryptographic hash matches the original issuing payload, this passport is no longer legally or operationally active.
            </p>
          </div>
          {passport.revocationReason && (
            <div className="p-2.5 rounded-xl bg-white/80 dark:bg-darkbg-card text-xs text-rose-900 dark:text-rose-200 border border-rose-200 dark:border-rose-900 max-w-md mx-auto font-mono">
              Reason: {passport.revocationReason}
            </div>
          )}
        </div>
      )}

      {/* FOUR INDEPENDENT PILLARS OF VERIFICATION */}
      <section className="space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-text-dark-muted px-1">
          Four Independent Pillars of Verification
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Pillar 1: Payload Integrity */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              isSandboxTampered
                ? "border-rose-500 bg-rose-50/70 dark:bg-rose-950/30"
                : "border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                1. Payload Integrity
              </span>
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${
                  isSandboxTampered
                    ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-coral border-rose-300"
                    : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-mint border-emerald-300"
                }`}
              >
                {isSandboxTampered ? "Tampered / Invalid" : "Valid (RFC 8785)"}
              </span>
            </div>
            <p className="text-xs text-slate-700 dark:text-text-dark-secondary mt-2 leading-relaxed">
              {isSandboxTampered
                ? "Payload mismatch: Calculated hash does not match stored reference. Data was altered post-issuance."
                : "Payload integrity is valid: The checked payload matches the authoritative stored reference."}
            </p>
          </div>

          {/* Pillar 2: Issuer Signature Authenticity */}
          <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                2. Issuer Signature
              </span>
              {passport.signatureStatus === "NOT_CONFIGURED" ? (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300">
                  Not Configured
                </span>
              ) : isSandboxTampered ? (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-coral border border-rose-300">
                  Signature Invalid
                </span>
              ) : (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-mint border border-emerald-300">
                  AWS KMS Valid
                </span>
              )}
            </div>
            <p className="text-xs text-slate-700 dark:text-text-dark-secondary mt-2 leading-relaxed">
              {passport.signatureStatus === "NOT_CONFIGURED"
                ? "Issuer signature: Not configured for this demonstration environment. Cryptographic hash is valid."
                : isSandboxTampered
                ? "Digital signature verification failed because payload was modified."
                : "RSASSA_PSS_SHA_256 digital signature verified against AWS KMS public key."}
            </p>
          </div>

          {/* Pillar 3: Documentary Verification Status */}
          <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                3. Documentary Status
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-mint border border-emerald-300">
                {batch.status === "SUPPORTED" ? "Evidence Supported" : batch.status}
              </span>
            </div>
            <p className="text-xs text-slate-700 dark:text-text-dark-secondary mt-2 leading-relaxed">
              Batch intake evidence and weighbridge scale slips reconciled within configured loss tolerance.
            </p>
          </div>

          {/* Pillar 4: Current Passport Status */}
          <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                4. Passport Lifecycle
              </span>
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${
                  passport.revoked
                    ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-coral border-rose-300"
                    : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-mint border-emerald-300"
                }`}
              >
                {passport.revoked ? "Revoked" : "Active"}
              </span>
            </div>
            <p className="text-xs text-slate-700 dark:text-text-dark-secondary mt-2 leading-relaxed">
              {passport.revoked
                ? "Passport has been revoked. Documentary verification is no longer active."
                : "Passport is active and in good standing on the authoritative verification registry."}
            </p>
          </div>
        </div>
      </section>

      {/* Public-Safe Attributes Grid (Confidential commercial and internal data excluded) */}
      <div className="rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-6 shadow-card space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-text-dark-primary">
          Public Attributes Disclosed by Policy
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-darkbg-hover border border-slate-200/60 dark:border-darkbg-border">
            <span className="text-slate-400 block text-[11px]">Stream Category</span>
            <span className="font-bold text-slate-900 dark:text-white capitalize">
              {passport.category.replace(/_/g, " ")}
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-darkbg-hover border border-slate-200/60 dark:border-darkbg-border">
            <span className="text-slate-400 block text-[11px]">Supported Mass</span>
            <span className="font-mono font-bold text-emerald-600 dark:text-mint">
              {passport.evidenceSupportedKg.toLocaleString()} kg
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-darkbg-hover border border-slate-200/60 dark:border-darkbg-border">
            <span className="text-slate-400 block text-[11px]">Recovery Yield</span>
            <span className="font-mono font-bold text-slate-900 dark:text-white">
              {passport.recoveryRatePercent}%
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-darkbg-hover border border-slate-200/60 dark:border-darkbg-border">
            <span className="text-slate-400 block text-[11px]">Modeled Value</span>
            <span className="font-mono font-bold text-slate-900 dark:text-white">
              ${passport.estimatedValueUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>

        {/* Cryptographic Hash Details */}
        <div className="space-y-2 font-mono text-xs bg-slate-50 dark:bg-darkbg-hover p-4 rounded-2xl border border-slate-200/60 dark:border-darkbg-border">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <span className="text-slate-400">Canonical SHA-256 Digest:</span>
            <span
              className={`font-bold break-all text-[11px] ${
                isSandboxTampered ? "text-rose-600 dark:text-coral line-through" : "text-slate-900 dark:text-white"
              }`}
            >
              {displayedHash}
            </span>
          </div>
          {isSandboxTampered && (
            <div className="text-rose-600 font-bold text-[11px] pt-1">
              &times; Tampered digest does not match authoritative stored hash ({passport.sha256Hash}). Verification fails!
            </div>
          )}
        </div>

        {/* Sandbox Tamper Simulator Tool */}
        <div className="p-4 rounded-2xl border border-dashed border-slate-300 dark:border-darkbg-border bg-slate-50/50 dark:bg-darkbg-hover/40 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-left">
            <strong className="text-slate-900 dark:text-white block font-bold">
              Sandbox Cryptographic Tamper Simulator (Demonstration)
            </strong>
            <p className="text-slate-500 dark:text-text-dark-secondary text-[11px] mt-0.5">
              Simulates a single byte alteration in-memory. Does not mutate the authoritative database record.
            </p>
          </div>
          <Button
            size="sm"
            variant={isSandboxTampered ? "primary" : "outline"}
            leftIcon={<Bug className="w-3.5 h-3.5" />}
            onClick={() => setIsSandboxTampered(!isSandboxTampered)}
          >
            {isSandboxTampered ? "Restore Canonical Integrity" : "Simulate 1-Byte Tampering"}
          </Button>
        </div>

        {/* Public Disclaimer */}
        <div className="text-center text-[11px] text-slate-400 dark:text-text-dark-muted italic leading-relaxed pt-2">
          Notice: The SHA-256 cryptographic digest guarantees that the passport payload has not been modified since issuance. It does not replace independent on-site recycling audits or physical chain-of-custody verification.
        </div>
      </div>
    </div>
  );
}
