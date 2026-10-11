"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Layers,
  ShieldCheck,
  AlertTriangle,
  Scale,
  Coins,
  FileText,
  Clock,
  Sparkles,
  ArrowRight,
  ExternalLink,
  QrCode,
  FileCheck2,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  Check,
  Ban,
  UserCheck,
} from "lucide-react";
import {
  fetchBatchById,
  issuePassport,
  recordAuditorDecision,
  LiveVerificationError,
} from "@/lib/api-client";
import { getBatchById } from "@/lib/store";
import { Batch, VerificationStatus } from "@/types";
import { StatusBadge, SeverityBadge, RiskBadge, CategoryBadge, PassportStatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CardSkeleton } from "@/components/ui/LoadingSkeleton";

export default function BatchDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const { success, error: toastError, info } = useToast();

  const [batch, setBatch] = useState<Batch | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isIssuing, setIsIssuing] = useState(false);

  // Auditor Decision Modal State
  const [decisionModalOpen, setDecisionModalOpen] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<VerificationStatus>("SUPPORTED");
  const [decisionReason, setDecisionReason] = useState("");
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);

  const loadBatch = async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchBatchById(id);
      setBatch(res.batch);
    } catch (err: any) {
      if (err instanceof LiveVerificationError) {
        setError(err.message);
      } else {
        const local = getBatchById(id);
        if (local) setBatch(local);
        else setError(`Batch '${id}' not found.`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBatch();
  }, [id]);

  const handleIssuePassport = async () => {
    if (!batch) return;
    setIsIssuing(true);
    try {
      const res = await issuePassport(batch.id);
      if (res.success && res.passport) {
        success("Passport Issued", `Circularity Passport ${res.passport.passportId} issued successfully.`);
        await loadBatch();
      } else {
        toastError("Issuance Blocked", res.message);
      }
    } catch (err: any) {
      toastError("Issuance Failed", err.message);
    } finally {
      setIsIssuing(false);
    }
  };

  const handleOpenDecision = (decision: VerificationStatus) => {
    setPendingDecision(decision);
    setDecisionReason(
      decision === "SUPPORTED"
        ? "Audited and verified. Mass balance variance conforms to stream tolerance."
        : "Consignment rejected due to unverified mass balance deficit and missing second-scale tickets."
    );
    setDecisionModalOpen(true);
  };

  const handleConfirmDecision = async () => {
    if (!batch) return;
    setIsSubmittingDecision(true);
    try {
      await recordAuditorDecision(batch.id, pendingDecision, decisionReason);
      success("Audit Decision Recorded", `Status updated to ${pendingDecision}.`);
      setDecisionModalOpen(false);
      await loadBatch();
    } catch (err: any) {
      toastError("Decision Failed", err.message);
    } finally {
      setIsSubmittingDecision(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (error || !batch) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Batch Not Found</h2>
        <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
          {error || `The requested batch identifier "${id}" could not be retrieved.`}
        </p>
        <Link href="/batches">
          <Button variant="outline">Back to Batch Directory</Button>
        </Link>
      </div>
    );
  }

  const isEligibleForPassport =
    batch.status === "SUPPORTED" &&
    batch.massBalance.isWithinTolerance &&
    !batch.passport;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
      {/* Top Breadcrumb & Action Header */}
      <div>
        <Link
          href="/batches"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-800 dark:hover:text-white mb-3 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Batch Directory
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-darkbg-border">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-black font-mono text-slate-900 dark:text-white">
                {batch.batchNumber}
              </h1>
              <StatusBadge status={batch.status} />
              <PassportStatusBadge
                status={batch.passport ? (batch.passport.revoked ? "REVOKED" : "ACTIVE") : "NOT_ISSUED"}
                passportId={batch.passport?.passportId}
              />
              <CategoryBadge category={batch.category} />
            </div>
            <p className="text-xs text-slate-500 dark:text-text-dark-secondary">
              Recycler: <strong className="text-slate-800 dark:text-white">{batch.recyclerName}</strong> &bull; License: <span className="font-mono">{batch.recyclerRegistrationId}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link href={`/evidence/${batch.id}`}>
              <Button size="sm" variant="outline" leftIcon={<FileText className="w-4 h-4" />}>
                Inspect Evidence ({batch.documents.length})
              </Button>
            </Link>

            {batch.passport ? (
              <Link href={`/passports/${batch.passport.passportId}`}>
                <Button size="sm" variant="lime" leftIcon={<ShieldCheck className="w-4 h-4" />}>
                  View Circularity Passport
                </Button>
              </Link>
            ) : isEligibleForPassport ? (
              <Button
                size="sm"
                variant="primary"
                leftIcon={<Sparkles className="w-4 h-4" />}
                onClick={handleIssuePassport}
                isLoading={isIssuing}
              >
                Issue Circularity Passport
              </Button>
            ) : null}

            {/* Auditor Decision Actions */}
            <Button
              size="sm"
              variant="outline"
              leftIcon={<Check className="w-3.5 h-3.5 text-emerald-600" />}
              onClick={() => handleOpenDecision("SUPPORTED")}
            >
              Authorize
            </Button>
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<Ban className="w-3.5 h-3.5 text-rose-500" />}
              onClick={() => handleOpenDecision("REJECTED")}
            >
              Reject
            </Button>
          </div>
        </div>
      </div>

      {/* Overview Status Banner: Correction 1 Applied */}
      <div
        className={`p-4 rounded-3xl border flex items-start gap-3.5 ${
          batch.status === "SUPPORTED"
            ? "bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-mint"
            : batch.status === "REVIEW_REQUIRED"
            ? "bg-amber-50/70 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200"
            : "bg-rose-50/70 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-coral"
        }`}
      >
        <div className="mt-0.5">
          {batch.status === "SUPPORTED" && <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-mint" />}
          {batch.status === "REVIEW_REQUIRED" && <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />}
          {batch.status === "REJECTED" && <XCircle className="w-5 h-5 text-rose-600 dark:text-coral" />}
        </div>
        <div className="flex-1 text-xs space-y-1">
          <div className="flex items-center gap-2 font-bold">
            <span>Overall Verification Status: {batch.status}</span>
            <span className="font-normal opacity-80">&bull; Authoritative determination</span>
          </div>
          <p className="leading-relaxed opacity-90">
            {batch.status === "SUPPORTED" &&
              "Documentary evidence validates intake mass balance within configured policy tolerance. Consignment is compliant."}
            {batch.status === "REVIEW_REQUIRED" &&
              "Evidence anomalies detected requiring human auditor investigation. Discrepancies do not automatically reject the consignment until formal decision is authorized."}
            {batch.status === "REJECTED" &&
              `Explicit rejection criteria met: ${batch.explicitRejectionReason || "Consignment does not fulfill regulatory compliance."}`}
          </p>
        </div>
      </div>

      {/* Section 1: Mass Balance Visualizer & Risk Scorecard */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Mass Balance Visualizer */}
        <div className="lg:col-span-7 rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-6 shadow-card space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-darkbg-border">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Scale className="w-4 h-4 text-emerald-600 dark:text-mint" />
              Physical Mass Balance Lifecycle
            </h3>
            <span className="text-[11px] font-mono font-bold text-slate-500 dark:text-text-dark-muted">
              Stream Tol: &plusmn;{batch.massBalance.tolerancePercentage}%
            </span>
          </div>

          {/* Mass comparison steps */}
          <div className="space-y-3">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-slate-600 dark:text-text-dark-secondary">Declared Shipped Mass:</span>
              <span className="font-mono text-slate-900 dark:text-white">{batch.massBalance.claimedKg.toLocaleString()} kg</span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-darkbg-hover rounded-full h-3 overflow-hidden">
              <div className="bg-sky-500 h-full rounded-full" style={{ width: "100%" }} />
            </div>

            <div className="flex justify-between text-xs font-semibold pt-2">
              <span className="text-slate-600 dark:text-text-dark-secondary">Scale Inbound Intake Weight:</span>
              <span className="font-mono text-slate-900 dark:text-white">{batch.massBalance.receivedKg.toLocaleString()} kg</span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-darkbg-hover rounded-full h-3 overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  batch.massBalance.isWithinTolerance ? "bg-emerald-500" : "bg-amber-500"
                }`}
                style={{
                  width: `${Math.min(100, (batch.massBalance.receivedKg / batch.massBalance.claimedKg) * 100)}%`,
                }}
              />
            </div>

            <div className="flex justify-between text-xs font-semibold pt-2">
              <span className="text-slate-600 dark:text-text-dark-secondary">Evidence-Supported Certified Recovery:</span>
              <span className="font-mono text-emerald-600 dark:text-mint font-bold">{batch.massBalance.evidenceSupportedKg.toLocaleString()} kg</span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-darkbg-hover rounded-full h-3 overflow-hidden">
              <div
                className="bg-gradient-to-r from-emerald-600 to-turquoise h-full rounded-full"
                style={{
                  width: `${Math.min(100, (batch.massBalance.evidenceSupportedKg / batch.massBalance.claimedKg) * 100)}%`,
                }}
              />
            </div>
          </div>

          {/* Variance note */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-darkbg-hover border border-slate-200/60 dark:border-darkbg-border flex items-center justify-between text-xs">
            <div>
              <span className="text-slate-400 block text-[11px]">Unaccounted Mass Variance</span>
              <span className="font-bold text-slate-900 dark:text-white font-mono text-sm">
                {batch.massBalance.discrepancyKg.toLocaleString()} kg ({batch.massBalance.lossPercentage}%)
              </span>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold border ${
                batch.massBalance.isWithinTolerance
                  ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-mint border-emerald-300 dark:border-emerald-800"
                  : "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300 dark:border-amber-800"
              }`}
            >
              {batch.massBalance.isWithinTolerance ? "Within Allowed Tolerance" : "Exceeds Tolerance Threshold"}
            </span>
          </div>
        </div>

        {/* Explainable Risk Scorecard */}
        <div className="lg:col-span-5 rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-6 shadow-card space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-darkbg-border">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-mint" />
              Documentary Risk Scorecard
            </h3>
            <RiskBadge level={batch.riskScore.riskLevel} score={batch.riskScore.overallScore} />
          </div>

          <div className="text-center py-2">
            <div className="inline-flex items-baseline gap-1">
              <span className="text-4xl sm:text-5xl font-black text-slate-900 dark:text-white">
                {batch.riskScore.overallScore}
              </span>
              <span className="text-slate-400 font-bold text-sm">/ 100</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-text-dark-secondary mt-1">
              Policy Version: <span className="font-mono">{batch.riskScore.policyVersion}</span>
            </p>
          </div>

          {/* Risk Factors Breakdown */}
          <div className="space-y-2 text-xs font-medium">
            <div className="flex justify-between">
              <span className="text-slate-500">Extraction Confidence:</span>
              <span className="font-bold text-slate-900 dark:text-white">
                {batch.riskScore.breakdown.extractionConfidence.toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Evidence Completeness:</span>
              <span className="font-bold text-slate-900 dark:text-white">
                {batch.riskScore.breakdown.evidenceCompleteness.toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Cross-Document Consistency:</span>
              <span className="font-bold text-slate-900 dark:text-white">
                {batch.riskScore.breakdown.crossDocumentConsistency.toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Operational Risk:</span>
              <span className="font-bold text-slate-900 dark:text-white">
                {batch.riskScore.breakdown.operationalRisk.toFixed(1)}%
              </span>
            </div>
          </div>

          <p className="p-3 rounded-2xl bg-slate-50 dark:bg-darkbg-hover border border-slate-200/60 dark:border-darkbg-border text-[11px] text-slate-600 dark:text-text-dark-secondary leading-relaxed">
            {batch.riskScore.summaryExplanation}
          </p>
        </div>
      </div>

      {/* Section 2: Value Intelligence Breakdown */}
      <div className="rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-6 shadow-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100 dark:border-darkbg-border">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Coins className="w-4 h-4 text-amber-500" />
              Value Intelligence & Recovered Material Modeling
            </h3>
            <p className="text-xs text-slate-400 dark:text-text-dark-muted mt-0.5">
              Benchmark LME/COMEX pricing date: {batch.materialEstimate.referencePriceDate} &bull; Dataset: {batch.materialEstimate.datasetVersion}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">Net Value:</span>
            <span className="text-lg font-black text-slate-900 dark:text-white font-mono text-gradient-gold">
              ${batch.materialEstimate.netEstimatedRecoveryValueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-text-dark-muted border-b border-slate-100 dark:border-darkbg-border">
              <tr>
                <th className="pb-2.5 font-bold">Recovered Fraction</th>
                <th className="pb-2.5 font-bold">Fraction %</th>
                <th className="pb-2.5 font-bold">Est. Weight</th>
                <th className="pb-2.5 font-bold">Unit Price (USD)</th>
                <th className="pb-2.5 font-bold text-right">Yield Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border">
              {batch.materialEstimate.fractions.map((f, i) => (
                <tr key={i} className="hover:bg-slate-50/60 dark:hover:bg-darkbg-hover transition-colors">
                  <td className="py-3 font-semibold text-slate-900 dark:text-white">
                    {f.materialName}
                  </td>
                  <td className="py-3 text-slate-500 font-mono">
                    {f.fractionPercentage.toFixed(2)}%
                  </td>
                  <td className="py-3 font-mono font-bold text-slate-800 dark:text-emerald-100">
                    {f.estimatedQuantityKg.toFixed(2)} kg
                  </td>
                  <td className="py-3 font-mono text-slate-500">
                    ${f.unitPriceUsd.toLocaleString()}/kg
                  </td>
                  <td className="py-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                    ${f.estimatedValueUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 3: Documentary Findings Feed */}
      <div className="rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-6 shadow-card space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-darkbg-border">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-600 dark:text-mint" />
            Verification Findings & Evidence Citations ({batch.findings.length})
          </h3>
          <span className="text-xs text-slate-400">10 rules evaluated</span>
        </div>

        {batch.findings.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            Zero discrepancy findings detected across all documentary records.
          </div>
        ) : (
          <div className="space-y-3">
            {batch.findings.map((f) => (
              <div
                key={f.id}
                id={`finding-${f.id}`}
                className="p-4 rounded-2xl border border-slate-200 dark:border-darkbg-border bg-slate-50/70 dark:bg-darkbg-hover/70 space-y-2.5 transition-colors focus-within:ring-2 focus-within:ring-amber-500"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-slate-700 dark:text-white">
                    Rule {f.ruleId}: {f.ruleName}
                  </span>
                  <SeverityBadge severity={f.severity} />
                </div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">{f.title}</h4>
                <p className="text-xs text-slate-600 dark:text-text-dark-secondary leading-relaxed">
                  {f.description}
                </p>
                <div className="p-3 rounded-xl bg-white dark:bg-darkbg-card border border-slate-200/60 dark:border-darkbg-border text-[11px] grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <span className="text-slate-400 block">Observed:</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-white">{f.observedValue}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Expected:</span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-mint">{f.expectedValue}</span>
                  </div>
                </div>
                <p className="text-[11px] text-amber-700 dark:text-amber-300 font-semibold">
                  Recommended Action: {f.recommendedAction}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Auditor Decision Dialog */}
      <ConfirmDialog
        isOpen={decisionModalOpen}
        onClose={() => setDecisionModalOpen(false)}
        onConfirm={handleConfirmDecision}
        title={`Confirm Audit Decision: ${pendingDecision}`}
        description={`You are officially recording compliance determination as ${pendingDecision}. Please provide the audit rationale below.`}
        confirmText={`Confirm ${pendingDecision}`}
        variant={pendingDecision === "REJECTED" ? "danger" : "primary"}
        isLoading={isSubmittingDecision}
      />
    </div>
  );
}
