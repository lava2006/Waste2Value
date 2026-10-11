"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Trash2,
  ShieldCheck,
  Scale,
  Calendar,
  Building2,
  MapPin,
  HelpCircle,
  FolderUp,
  XCircle,
  Loader2,
  Info,
} from "lucide-react";
import { addBatch } from "@/lib/store";
import { Batch, DocumentEvidence, DocumentType, EwasteCategory } from "@/types";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

interface FormErrors {
  batchNumber?: string;
  claimedQuantity?: string;
  recyclerName?: string;
  recyclerRegistrationId?: string;
  collectionDate?: string;
  processingDate?: string;
  originLocation?: string;
  destinationLocation?: string;
}

export default function NewBatchIntakePage() {
  const router = useRouter();
  const { success, error: toastError, info } = useToast();
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State (strictly preserved across all step transitions)
  const [batchNumber, setBatchNumber] = useState(
    `BATCH-${new Date().getFullYear()}-${String(Math.floor(100 + Math.random() * 900))}`
  );
  const [category, setCategory] = useState<EwasteCategory>("it_telecom");
  const [claimedQuantity, setClaimedQuantity] = useState<number>(5000);
  const [unit, setUnit] = useState<"kg" | "metric_ton">("kg");
  const [recyclerName, setRecyclerName] = useState("GreenTech Circular Ltd");
  const [recyclerRegistrationId, setRecyclerRegistrationId] = useState("REG-2024-ENV-8841");
  const [collectionDate, setCollectionDate] = useState("2025-04-01");
  const [processingDate, setProcessingDate] = useState("2025-04-05");
  const [originLocation, setOriginLocation] = useState("Frankfurt Data Center Campus, Germany");
  const [destinationLocation, setDestinationLocation] = useState("GreenTech Certified Smelter, Leipzig");
  const [notes, setNotes] = useState("");

  // Validation Errors
  const [errors, setErrors] = useState<FormErrors>({});

  // Document Upload State
  const [documents, setDocuments] = useState<DocumentEvidence[]>([
    {
      id: "doc-new-1",
      batchId: "pending",
      title: "Consignment Transport Waybill",
      documentType: "transport_waybill",
      fileName: "WAYBILL-APRIL-2025.pdf",
      fileSize: "1.2 MB",
      uploadTimestamp: new Date().toISOString(),
      status: "extracted",
      extractedFields: [
        {
          id: "f-1",
          documentId: "doc-new-1",
          fieldName: "manifest_weight",
          label: "Shipped Gross Mass",
          value: 5000,
          unit: "kg",
          confidence: 0.98,
          pageNumber: 1,
        },
      ],
    },
    {
      id: "doc-new-2",
      batchId: "pending",
      title: "Certified Weighbridge Ticket",
      documentType: "weighbridge_record",
      fileName: "SCALE-RECEIPT-4410.png",
      fileSize: "840 KB",
      uploadTimestamp: new Date().toISOString(),
      status: "extracted",
      extractedFields: [
        {
          id: "f-2",
          documentId: "doc-new-2",
          fieldName: "net_weight",
          label: "Net Inbound Weight",
          value: 4940,
          unit: "kg",
          confidence: 0.99,
          pageNumber: 1,
        },
      ],
    },
  ]);

  // Scenario Presets
  const loadScenario = (type: "clean" | "borderline" | "high_risk") => {
    setErrors({});
    if (type === "clean") {
      setBatchNumber(`BATCH-2025-001-${Math.floor(10 + Math.random() * 89)}`);
      setCategory("it_telecom");
      setClaimedQuantity(5000);
      setRecyclerName("GreenTech Circular Ltd");
      setRecyclerRegistrationId("REG-2024-ENV-8841");
      setCollectionDate("2025-03-10");
      setProcessingDate("2025-03-14");
      setOriginLocation("Munich IT Hub, Germany");
      setDestinationLocation("GreenTech Facility 4, Leipzig");
      setNotes("Clean scenario: Decommissioned high-grade server PCBs with consistent weighbridge slips.");
      setDocuments([
        {
          id: `doc-${Date.now()}-1`,
          batchId: "pending",
          title: "Recycling Certificate",
          documentType: "recycling_certificate",
          fileName: "CERT-2025-0891.pdf",
          fileSize: "1.4 MB",
          uploadTimestamp: new Date().toISOString(),
          status: "extracted",
          extractedFields: [
            { id: "f-c1", documentId: "doc", fieldName: "weight", label: "Certified Mass", value: 4920, unit: "kg", confidence: 0.99, pageNumber: 1 },
          ],
        },
        {
          id: `doc-${Date.now()}-2`,
          batchId: "pending",
          title: "Transport Waybill",
          documentType: "transport_waybill",
          fileName: "WB-2025-4421.pdf",
          fileSize: "840 KB",
          uploadTimestamp: new Date().toISOString(),
          status: "extracted",
          extractedFields: [
            { id: "f-c2", documentId: "doc", fieldName: "weight", label: "Waybill Mass", value: 5000, unit: "kg", confidence: 0.98, pageNumber: 1 },
          ],
        },
      ]);
      info("Loaded Clean Scenario Preset (BATCH-2025-001)");
    } else if (type === "borderline") {
      setBatchNumber(`BATCH-2025-002-${Math.floor(10 + Math.random() * 89)}`);
      setCategory("consumer_electronics");
      setClaimedQuantity(12000);
      setRecyclerName("EcoCycle Logistics & Refurbishment");
      setRecyclerRegistrationId("REG-2023-ENV-5510");
      setCollectionDate("2025-03-18");
      setProcessingDate("2025-03-24");
      setOriginLocation("Rotterdam Port, Netherlands");
      setDestinationLocation("EcoCycle Facility B, Antwerp");
      setNotes("Borderline scenario: 3,500 kg deficit between manifest and weighbridge. Missing final invoice.");
      setDocuments([
        {
          id: `doc-${Date.now()}-1`,
          batchId: "pending",
          title: "Transport Waybill",
          documentType: "transport_waybill",
          fileName: "WB-2025-8819.pdf",
          fileSize: "750 KB",
          uploadTimestamp: new Date().toISOString(),
          status: "extracted",
          extractedFields: [
            { id: "f-b1", documentId: "doc", fieldName: "weight", label: "Manifest Weight", value: 12000, unit: "kg", confidence: 0.95, pageNumber: 1 },
          ],
        },
        {
          id: `doc-${Date.now()}-2`,
          batchId: "pending",
          title: "Weighbridge Inbound Record",
          documentType: "weighbridge_record",
          fileName: "WBR-2025-1104.pdf",
          fileSize: "510 KB",
          uploadTimestamp: new Date().toISOString(),
          status: "extracted",
          extractedFields: [
            { id: "f-b2", documentId: "doc", fieldName: "weight", label: "Weighbridge Mass", value: 8500, unit: "kg", confidence: 0.98, pageNumber: 1, isDiscrepant: true },
          ],
        },
      ]);
      info("Loaded Borderline Deficit Preset (BATCH-2025-002)");
    } else {
      setBatchNumber(`BATCH-2025-003-${Math.floor(10 + Math.random() * 89)}`);
      setCategory("large_appliances");
      setClaimedQuantity(25000);
      setRecyclerName("Apex Metal Recovery Inc");
      setRecyclerRegistrationId("REG-2022-UNCONFIRMED");
      setCollectionDate("2025-03-25");
      setProcessingDate("2025-02-14");
      setOriginLocation("Milan Distribution Hub, Italy");
      setDestinationLocation("Apex Yard, Brescia");
      setNotes("High-Risk demo: Processing date precedes collection by 39 days; 55% deficit.");
      setDocuments([
        {
          id: `doc-${Date.now()}-1`,
          batchId: "pending",
          title: "Suspect Manifest",
          documentType: "transport_waybill",
          fileName: "WB-2024-9901-SUSPECT.pdf",
          fileSize: "920 KB",
          uploadTimestamp: new Date().toISOString(),
          status: "extracted",
          extractedFields: [
            { id: "f-h1", documentId: "doc", fieldName: "weight", label: "Manifest Mass", value: 25000, unit: "kg", confidence: 0.94, pageNumber: 1 },
          ],
        },
        {
          id: `doc-${Date.now()}-2`,
          batchId: "pending",
          title: "Scale Intake Ticket",
          documentType: "weighbridge_record",
          fileName: "SCALE-TICKET-FEB14.jpg",
          fileSize: "1.1 MB",
          uploadTimestamp: new Date().toISOString(),
          status: "extracted",
          extractedFields: [
            { id: "f-h2", documentId: "doc", fieldName: "weight", label: "Scale Mass", value: 11200, unit: "kg", confidence: 0.97, pageNumber: 1, isDiscrepant: true },
          ],
        },
      ]);
      info("Loaded High-Risk Suspicious Preset (BATCH-2025-003)");
    }
  };

  // Step 1 Validation
  const validateStep1 = (): boolean => {
    const newErrors: FormErrors = {};

    if (!batchNumber.trim()) {
      newErrors.batchNumber = "Batch identifier reference is required.";
    }

    if (!claimedQuantity || isNaN(claimedQuantity) || claimedQuantity <= 0) {
      newErrors.claimedQuantity = "Claimed mass must be a positive number greater than 0.";
    }

    if (!recyclerName.trim()) {
      newErrors.recyclerName = "Recycler or operator entity name is required.";
    }

    if (!recyclerRegistrationId.trim()) {
      newErrors.recyclerRegistrationId = "Licensed facility registration ID is required.";
    }

    if (!collectionDate) {
      newErrors.collectionDate = "Collection date is required.";
    }

    if (collectionDate && processingDate && new Date(collectionDate) > new Date(processingDate)) {
      newErrors.processingDate = "Processing date cannot precede batch collection date.";
    }

    if (!originLocation.trim()) {
      newErrors.originLocation = "Consignment origin location is required.";
    }

    if (!destinationLocation.trim()) {
      newErrors.destinationLocation = "Destination facility location is required.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleProceedToStep2 = () => {
    if (validateStep1()) {
      setCurrentStep(2);
    } else {
      toastError("Validation Error", "Please resolve required field errors before proceeding.");
    }
  };

  const handleAddMockFile = (docType: DocumentType) => {
    const docName = `ATTACHMENT-${docType.toUpperCase()}-${Math.floor(100 + Math.random() * 900)}.pdf`;
    const newDoc: DocumentEvidence = {
      id: `doc-${Date.now()}`,
      batchId: "pending",
      title: docType.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
      documentType: docType,
      fileName: docName,
      fileSize: "1.1 MB",
      uploadTimestamp: new Date().toISOString(),
      status: "extracted",
      extractedFields: [
        {
          id: `f-${Date.now()}`,
          documentId: `doc-${Date.now()}`,
          fieldName: "reconciled_weight",
          label: "Extracted Reference Mass",
          value: claimedQuantity,
          unit: "kg",
          confidence: 0.96,
          pageNumber: 1,
        },
      ],
    };
    setDocuments((prev) => [...prev, newDoc]);
    success("Document Attached", `${docName} added to consignment dossier.`);
  };

  const handleRemoveDoc = (id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  // Readiness Assessment for Step 3
  const readiness = React.useMemo(() => {
    const hasWaybill = documents.some((d) => d.documentType === "transport_waybill");
    const hasWeighbridge = documents.some((d) => d.documentType === "weighbridge_record");
    const hasCert = documents.some((d) => d.documentType === "recycling_certificate");
    const hasInvoice = documents.some((d) => d.documentType === "processing_invoice");

    const readyItems: string[] = [];
    const attentionItems: string[] = [];
    const blockedItems: string[] = [];

    // Check mandatory fields
    if (batchNumber && claimedQuantity > 0 && recyclerName && collectionDate) {
      readyItems.push("Batch metadata, recycler identity, and claimed mass specified");
    } else {
      blockedItems.push("Mandatory batch identification or mass is incomplete");
    }

    // Check transport waybill
    if (hasWaybill) {
      readyItems.push("Inbound transport waybill attached for collection trace");
    } else {
      blockedItems.push("Missing Inbound Transport Manifest Waybill (Mandatory)");
    }

    // Check weighbridge record
    if (hasWeighbridge) {
      readyItems.push("Certified weighbridge scale intake ticket attached");
    } else {
      blockedItems.push("Missing Certified Weighbridge Intake Ticket (Mandatory)");
    }

    // Conditional items
    if (hasCert) {
      readyItems.push("Official Recycling Certificate attached for material destruction");
    } else {
      attentionItems.push("Final Recycling Certificate not attached (Required before passport issuance, but submission for review is allowed)");
    }

    if (hasInvoice) {
      readyItems.push("Processing settlement invoice verified");
    } else {
      attentionItems.push("Commercial settlement invoice is pending (Optional)");
    }

    const isBlocked = blockedItems.length > 0;

    return {
      readyItems,
      attentionItems,
      blockedItems,
      isBlocked,
    };
  }, [batchNumber, claimedQuantity, recyclerName, collectionDate, documents]);

  const handleSubmitBatch = () => {
    if (readiness.isBlocked) {
      toastError("Submission Blocked", "Please resolve mandatory document blockers in Step 2.");
      return;
    }

    setIsSubmitting(true);
    const newId = `batch-${Date.now()}`;

    // Calculate simulated mass values based on uploaded weighbridge evidence
    const weighbridgeDoc = documents.find((d) => d.documentType === "weighbridge_record");
    const weighbridgeField = weighbridgeDoc?.extractedFields.find((f) => f.fieldName.includes("weight") || f.label.includes("Weight") || f.label.includes("Mass"));
    const receivedKg = typeof weighbridgeField?.value === "number" ? weighbridgeField.value : claimedQuantity - 60;
    const discrepancyKg = Math.abs(claimedQuantity - receivedKg);
    const lossPercentage = Number(((discrepancyKg / claimedQuantity) * 100).toFixed(1));
    const isWithinTolerance = lossPercentage <= 3.0;

    const newBatch: Batch = {
      id: newId,
      batchNumber,
      category,
      claimedQuantity,
      unit,
      recyclerName,
      recyclerRegistrationId,
      collectionDate,
      processingDate,
      originLocation,
      destinationLocation,
      notes,
      status: isWithinTolerance ? "SUPPORTED" : "REVIEW_REQUIRED",
      riskScore: {
        overallScore: isWithinTolerance ? 18 : 64,
        riskLevel: isWithinTolerance ? "low" : "medium",
        policyVersion: "v1.2-synthetic",
        summaryExplanation: isWithinTolerance
          ? "Intake evidence reconciled. Mass balance variance conforms to standard processing loss tolerance."
          : `Discrepancy of ${discrepancyKg} kg (${lossPercentage}%) exceeds standard tolerance threshold.`,
        calculatedAt: new Date().toISOString(),
        breakdown: {
          extractionConfidence: 96,
          evidenceCompleteness: documents.length >= 3 ? 90 : 65,
          crossDocumentConsistency: isWithinTolerance ? 92 : 55,
          operationalRisk: isWithinTolerance ? 12 : 50,
        },
      },
      massBalance: {
        claimedKg: claimedQuantity,
        transportedKg: claimedQuantity,
        receivedKg,
        processedKg: isWithinTolerance ? receivedKg : 0,
        recoveredKg: isWithinTolerance ? receivedKg : 0,
        evidenceSupportedKg: receivedKg,
        discrepancyKg,
        lossPercentage,
        tolerancePercentage: 3.0,
        isWithinTolerance,
      },
      materialEstimate: {
        totalGrossValueUsd: Math.round(receivedKg * 22.4),
        modeledProcessingCostUsd: Math.round(receivedKg * 2.8),
        netEstimatedRecoveryValueUsd: Math.round(receivedKg * 19.6),
        currency: "USD",
        recommendedPathway: "material_recovery",
        referencePriceDate: "2025-03-01",
        datasetVersion: "LME-COMEX-2025.1",
        calculatedAt: new Date().toISOString(),
        assumptions: ["Standard PCB copper and precious metals recovery yield."],
        fractions: [
          {
            materialName: "Copper (Cu)",
            category: "base_metal",
            fractionPercentage: 14.5,
            estimatedQuantityKg: Math.round(receivedKg * 0.145),
            unitPriceUsd: 9.4,
            estimatedValueUsd: Math.round(receivedKg * 0.145 * 9.4),
          },
          {
            materialName: "Gold (Au)",
            category: "precious_metal",
            fractionPercentage: 0.02,
            estimatedQuantityKg: Number((receivedKg * 0.0002).toFixed(2)),
            unitPriceUsd: 82500,
            estimatedValueUsd: Math.round(receivedKg * 0.0002 * 82500),
          },
        ],
      },
      documents: documents.map((d) => ({ ...d, batchId: newId })),
      findings: isWithinTolerance
        ? [
            {
              id: `find-${Date.now()}`,
              ruleId: "MB-001",
              ruleName: "Mass-Balance Reconciliation",
              severity: "info",
              title: "Intake Scale Variance Within Policy Tolerance",
              description: `Observed delta of ${discrepancyKg} kg (${lossPercentage}%) conforms to configured shredding loss limit.`,
              observedValue: `${discrepancyKg} kg (${lossPercentage}%)`,
              expectedValue: "≤ 3.0% tolerance",
              difference: `${discrepancyKg} kg`,
              sourceDocumentName: documents[0]?.fileName || "Manifest",
              recommendedAction: "Eligible for Circularity Passport issuance.",
              createdAt: new Date().toISOString(),
            },
          ]
        : [
            {
              id: `find-${Date.now()}`,
              ruleId: "MB-002",
              ruleName: "Collection-to-Receipt Reconciliation",
              severity: "warning",
              title: "Quantity Shortfall at Intake Scale",
              description: `Observed deficit of ${discrepancyKg} kg between declared manifest and weighbridge ticket.`,
              observedValue: `${receivedKg} kg`,
              expectedValue: `${claimedQuantity} kg`,
              difference: `${discrepancyKg} kg shortfall`,
              sourceDocumentName: weighbridgeDoc?.fileName || "Weighbridge Record",
              recommendedAction: "Request carrier transit confirmation or scale calibration report.",
              createdAt: new Date().toISOString(),
            },
          ],
      timeline: [
        {
          id: `t-${Date.now()}`,
          timestamp: new Date().toISOString(),
          actor: "Enterprise Intake Portal",
          action: "Batch Intake Registered",
          note: `New batch ${batchNumber} submitted with ${documents.length} supporting evidence records.`,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    addBatch(newBatch);

    setTimeout(() => {
      setIsSubmitting(false);
      success("Batch Submitted", `Batch ${batchNumber} created and verification completed.`);
      router.push(`/batches/${newId}`);
    }, 600);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
      {/* Page Title & Preset Loaders */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-darkbg-border">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
            Batch Intake & Evidence Registration
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-text-dark-secondary mt-1">
            Submit a recycling batch for deterministic mass reconciliation and recoverable valuation.
          </p>
        </div>

        {/* Quick Scenario Preset Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-400 dark:text-text-dark-muted">
            Demo Presets:
          </span>
          <button
            type="button"
            onClick={() => loadScenario("clean")}
            className="px-2.5 py-1 text-xs font-bold rounded-xl bg-emerald-50 text-emerald-800 dark:bg-emerald-950/80 dark:text-mint border border-emerald-300 dark:border-emerald-800 hover:bg-emerald-100 transition-colors"
          >
            Clean Demo
          </button>
          <button
            type="button"
            onClick={() => loadScenario("borderline")}
            className="px-2.5 py-1 text-xs font-bold rounded-xl bg-amber-50 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-800 hover:bg-amber-100 transition-colors"
          >
            Borderline Demo
          </button>
          <button
            type="button"
            onClick={() => loadScenario("high_risk")}
            className="px-2.5 py-1 text-xs font-bold rounded-xl bg-rose-50 text-rose-800 dark:bg-rose-950/80 dark:text-coral border border-rose-300 dark:border-rose-800 hover:bg-rose-100 transition-colors"
          >
            High-Risk Demo
          </button>
        </div>
      </div>

      {/* Stepper Progress Bar */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { num: 1, label: "Step 1: Batch Details", sub: "Category, quantities & recycler" },
          { num: 2, label: "Step 2: Evidence Upload", sub: "Waybills, scale tickets, invoices" },
          { num: 3, label: "Step 3: Review & Submit", sub: "Completeness check & dispatch" },
        ].map((s) => (
          <button
            key={s.num}
            type="button"
            onClick={() => {
              if (s.num === 1 || validateStep1()) {
                setCurrentStep(s.num as any);
              }
            }}
            className={`p-3.5 rounded-2xl border text-left transition-all ${
              currentStep === s.num
                ? "border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/50 text-emerald-900 dark:text-mint shadow-xs font-bold"
                : currentStep > s.num
                ? "border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg-card text-slate-700 dark:text-text-dark-secondary"
                : "border-slate-100 dark:border-darkbg-border text-slate-400 opacity-60"
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                  currentStep === s.num
                    ? "bg-emerald-600 text-white"
                    : currentStep > s.num
                    ? "bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-mint"
                    : "bg-slate-200 dark:bg-darkbg-hover text-slate-600"
                }`}
              >
                {currentStep > s.num ? "✓" : s.num}
              </span>
              <span className="font-bold text-xs sm:text-sm">{s.label}</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-text-dark-muted mt-1 hidden sm:block">
              {s.sub}
            </p>
          </button>
        ))}
      </div>

      {/* STEP 1: BATCH DETAILS */}
      {currentStep === 1 && (
        <div className="rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-6 shadow-card space-y-6">
          <div className="pb-3 border-b border-slate-100 dark:border-darkbg-border">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Batch Metadata & Facility Information
            </h2>
            <p className="text-xs text-slate-500 dark:text-text-dark-muted mt-0.5">
              Specify batch classification, physical declared mass, licensed operator, and timeline dates.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label htmlFor="batchNumber" className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-text-dark-primary mb-1">
                Batch Identifier Reference *
              </label>
              <input
                id="batchNumber"
                type="text"
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
                aria-invalid={!!errors.batchNumber}
                aria-describedby={errors.batchNumber ? "batchNumber-error" : undefined}
                className={`w-full px-3.5 py-2.5 text-xs font-mono font-bold rounded-xl border bg-slate-50 dark:bg-darkbg-hover text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                  errors.batchNumber ? "border-rose-500" : "border-slate-200 dark:border-darkbg-border"
                }`}
              />
              {errors.batchNumber && (
                <p id="batchNumber-error" className="text-[11px] text-rose-600 dark:text-coral mt-1">
                  {errors.batchNumber}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="category" className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-text-dark-primary mb-1">
                E-Waste Category *
              </label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value as EwasteCategory)}
                className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg-hover text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="it_telecom">IT & Telecommunications (PCBs, Servers, Switches)</option>
                <option value="consumer_electronics">Consumer Electronics (Displays, Mobile)</option>
                <option value="large_appliances">Large Appliances (HVAC, Industrial Drives)</option>
                <option value="small_appliances">Small Appliances (Power Supplies, Inverters)</option>
                <option value="batteries">Batteries & Storage (Li-ion, Energy Packs)</option>
              </select>
            </div>

            <div>
              <label htmlFor="claimedQuantity" className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-text-dark-primary mb-1">
                Claimed Weight Quantity *
              </label>
              <div className="flex gap-2">
                <input
                  id="claimedQuantity"
                  type="number"
                  min="1"
                  value={claimedQuantity}
                  onChange={(e) => setClaimedQuantity(Number(e.target.value))}
                  aria-invalid={!!errors.claimedQuantity}
                  className={`flex-1 px-3.5 py-2.5 text-xs font-bold rounded-xl border bg-slate-50 dark:bg-darkbg-hover text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                    errors.claimedQuantity ? "border-rose-500" : "border-slate-200 dark:border-darkbg-border"
                  }`}
                />
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as any)}
                  className="w-24 px-3 py-2.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg-hover text-slate-900 dark:text-white"
                  aria-label="Weight Unit"
                >
                  <option value="kg">kg</option>
                  <option value="metric_ton">Tonnes</option>
                </select>
              </div>
              {errors.claimedQuantity && (
                <p className="text-[11px] text-rose-600 dark:text-coral mt-1">
                  {errors.claimedQuantity}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="recyclerName" className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-text-dark-primary mb-1">
                Recycler / Operator Entity Name *
              </label>
              <input
                id="recyclerName"
                type="text"
                value={recyclerName}
                onChange={(e) => setRecyclerName(e.target.value)}
                aria-invalid={!!errors.recyclerName}
                className={`w-full px-3.5 py-2.5 text-xs rounded-xl border bg-slate-50 dark:bg-darkbg-hover text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                  errors.recyclerName ? "border-rose-500" : "border-slate-200 dark:border-darkbg-border"
                }`}
              />
              {errors.recyclerName && (
                <p className="text-[11px] text-rose-600 dark:text-coral mt-1">
                  {errors.recyclerName}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="recyclerRegistrationId" className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-text-dark-primary mb-1">
                Facility License Registration ID *
              </label>
              <input
                id="recyclerRegistrationId"
                type="text"
                value={recyclerRegistrationId}
                onChange={(e) => setRecyclerRegistrationId(e.target.value)}
                aria-invalid={!!errors.recyclerRegistrationId}
                className={`w-full px-3.5 py-2.5 text-xs font-mono rounded-xl border bg-slate-50 dark:bg-darkbg-hover text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                  errors.recyclerRegistrationId ? "border-rose-500" : "border-slate-200 dark:border-darkbg-border"
                }`}
              />
              {errors.recyclerRegistrationId && (
                <p className="text-[11px] text-rose-600 dark:text-coral mt-1">
                  {errors.recyclerRegistrationId}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="collectionDate" className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-text-dark-primary mb-1">
                  Collection Date *
                </label>
                <input
                  id="collectionDate"
                  type="date"
                  value={collectionDate}
                  onChange={(e) => setCollectionDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg-hover text-slate-900 dark:text-white"
                />
                <span className="text-[10px] text-slate-400 block mt-0.5">When batch was collected</span>
              </div>
              <div>
                <label htmlFor="processingDate" className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-text-dark-primary mb-1">
                  Processing Date
                </label>
                <input
                  id="processingDate"
                  type="date"
                  value={processingDate}
                  onChange={(e) => setProcessingDate(e.target.value)}
                  className={`w-full px-3 py-2 text-xs rounded-xl border bg-slate-50 dark:bg-darkbg-hover text-slate-900 dark:text-white ${
                    errors.processingDate ? "border-rose-500" : "border-slate-200 dark:border-darkbg-border"
                  }`}
                />
                <span className="text-[10px] text-slate-400 block mt-0.5">Optional if pending</span>
              </div>
              {errors.processingDate && (
                <p className="col-span-2 text-[11px] text-rose-600 dark:text-coral mt-0.5">
                  {errors.processingDate}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="originLocation" className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-text-dark-primary mb-1">
                Batch Collection Origin *
              </label>
              <input
                id="originLocation"
                type="text"
                value={originLocation}
                onChange={(e) => setOriginLocation(e.target.value)}
                className={`w-full px-3.5 py-2.5 text-xs rounded-xl border bg-slate-50 dark:bg-darkbg-hover text-slate-900 dark:text-white ${
                  errors.originLocation ? "border-rose-500" : "border-slate-200 dark:border-darkbg-border"
                }`}
              />
              {errors.originLocation && (
                <p className="text-[11px] text-rose-600 dark:text-coral mt-1">
                  {errors.originLocation}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="destinationLocation" className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-text-dark-primary mb-1">
                Destination Recycling Plant *
              </label>
              <input
                id="destinationLocation"
                type="text"
                value={destinationLocation}
                onChange={(e) => setDestinationLocation(e.target.value)}
                className={`w-full px-3.5 py-2.5 text-xs rounded-xl border bg-slate-50 dark:bg-darkbg-hover text-slate-900 dark:text-white ${
                  errors.destinationLocation ? "border-rose-500" : "border-slate-200 dark:border-darkbg-border"
                }`}
              />
              {errors.destinationLocation && (
                <p className="text-[11px] text-rose-600 dark:text-coral mt-1">
                  {errors.destinationLocation}
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-darkbg-border">
            <Button onClick={handleProceedToStep2} rightIcon={<ArrowRight className="w-4 h-4" />}>
              Proceed to Evidence Upload
            </Button>
          </div>
        </div>
      )}

      {/* STEP 2: EVIDENCE UPLOAD */}
      {currentStep === 2 && (
        <div className="rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-6 shadow-card space-y-6">
          <div className="pb-3 border-b border-slate-100 dark:border-darkbg-border">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Batch Evidence Dossier
            </h2>
            <p className="text-xs text-slate-500 dark:text-text-dark-muted mt-0.5">
              Attach waybills, weighbridge scale slips, and invoices for automated extraction and cross-check.
            </p>
          </div>

          {/* Policy Guidance Box */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-darkbg-hover border border-slate-200/80 dark:border-darkbg-border text-xs space-y-2">
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Info className="w-4 h-4 text-emerald-600 dark:text-mint" /> Document Requirements Policy
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-text-dark-secondary">
              <div>&bull; <strong className="text-slate-800 dark:text-white">Transport Waybill (Mandatory):</strong> Establishes dispatch date and carrier mass declaration.</div>
              <div>&bull; <strong className="text-slate-800 dark:text-white">Weighbridge Scale Ticket (Mandatory):</strong> Certified scale intake measurement for mass balance.</div>
              <div>&bull; <strong className="text-slate-800 dark:text-white">Recycling Certificate (Conditional):</strong> Required prior to final Circularity Passport issuance.</div>
              <div>&bull; <strong className="text-slate-800 dark:text-white">Settlement Invoice (Optional):</strong> Supplemental commercial record for audited financial reconciliation.</div>
            </div>
          </div>

          {/* Upload Zone */}
          <div className="border-2 border-dashed border-emerald-500/40 dark:border-emerald-500/30 rounded-3xl p-8 text-center bg-emerald-50/20 dark:bg-emerald-950/10 hover:border-emerald-500 transition-colors">
            <FolderUp className="w-10 h-10 text-emerald-600 dark:text-mint mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Attach Document Evidence
            </h3>
            <p className="text-xs text-slate-500 dark:text-text-dark-muted mt-1">
              Supports PDF, PNG, JPG files up to 25 MB per document. Synthetic extraction is demonstrated in demo mode.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button size="sm" variant="outline" onClick={() => handleAddMockFile("transport_waybill")}>
                + Add Transport Waybill (Required)
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleAddMockFile("weighbridge_record")}>
                + Add Weighbridge Ticket (Required)
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleAddMockFile("recycling_certificate")}>
                + Add Recycling Certificate
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleAddMockFile("processing_invoice")}>
                + Add Processing Invoice
              </Button>
            </div>
          </div>

          {/* Attached Documents List */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-text-dark-primary mb-3">
              Attached Evidence Records ({documents.length})
            </h3>
            {documents.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 border border-slate-200 dark:border-darkbg-border rounded-2xl">
                No documents attached yet. Click the buttons above to attach required waybills and scale tickets.
              </div>
            ) : (
              <div className="space-y-2.5">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="p-3.5 rounded-2xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg-hover flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-mint">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white">
                          {doc.title}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-text-dark-muted font-mono">
                          {doc.fileName} &bull; {doc.fileSize}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-mint border border-emerald-300 dark:border-emerald-800">
                        OCR Extracted
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveDoc(doc.id)}
                        className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg transition-colors"
                        title="Remove file"
                        aria-label={`Remove document ${doc.title}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-between pt-4 border-t border-slate-100 dark:border-darkbg-border">
            <Button variant="outline" onClick={() => setCurrentStep(1)} leftIcon={<ArrowLeft className="w-4 h-4" />}>
              Back to Details
            </Button>
            <Button onClick={() => setCurrentStep(3)} rightIcon={<ArrowRight className="w-4 h-4" />}>
              Proceed to Review & Submit
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3: SUBMISSION READINESS & DISPATCH */}
      {currentStep === 3 && (
        <div className="rounded-3xl border border-slate-200/80 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-6 shadow-card space-y-6">
          <div className="pb-3 border-b border-slate-100 dark:border-darkbg-border">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Verification Readiness & Submission Review
            </h2>
            <p className="text-xs text-slate-500 dark:text-text-dark-muted mt-0.5">
              Review parameters and audit completeness before running deterministic mass balance reconciliation.
            </p>
          </div>

          {/* Summary Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-darkbg-hover border border-slate-200 dark:border-darkbg-border space-y-1">
              <span className="text-slate-500 dark:text-text-dark-muted block">Batch Identifier</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">
                {batchNumber}
              </span>
              <span className="text-slate-500 dark:text-text-dark-muted block pt-1 capitalize">
                Category: {category.replace(/_/g, " ")}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-darkbg-hover border border-slate-200 dark:border-darkbg-border space-y-1">
              <span className="text-slate-500 dark:text-text-dark-muted block">Claimed Weight</span>
              <span className="font-bold text-slate-900 dark:text-white text-sm">
                {claimedQuantity.toLocaleString()} {unit}
              </span>
              <span className="text-slate-500 dark:text-text-dark-muted block pt-1 truncate">
                Origin: {originLocation}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-darkbg-hover border border-slate-200 dark:border-darkbg-border space-y-1">
              <span className="text-slate-500 dark:text-text-dark-muted block">Recycler Facility</span>
              <span className="font-bold text-slate-900 dark:text-white text-sm truncate block">
                {recyclerName}
              </span>
              <span className="text-slate-400 dark:text-text-dark-muted block font-mono pt-1 text-[11px] truncate">
                {recyclerRegistrationId}
              </span>
            </div>
          </div>

          {/* Grouped Readiness Summary: Ready, Needs Attention, Blocked */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-text-dark-primary">
              Submission Readiness Audit
            </h3>

            {/* Blocked Items (if any) */}
            {readiness.blockedItems.length > 0 && (
              <div className="rounded-2xl border border-rose-300 dark:border-rose-900/60 bg-rose-50/60 dark:bg-rose-950/20 p-4 space-y-2">
                <span className="text-xs font-bold text-rose-800 dark:text-coral flex items-center gap-1.5">
                  <XCircle className="w-4 h-4 text-rose-600" /> Blocked ({readiness.blockedItems.length})
                </span>
                <ul className="space-y-1 text-xs text-rose-700 dark:text-rose-300">
                  {readiness.blockedItems.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="font-bold">&times;</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Ready Items */}
            {readiness.readyItems.length > 0 && (
              <div className="rounded-2xl border border-emerald-300 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/20 p-4 space-y-2">
                <span className="text-xs font-bold text-emerald-800 dark:text-mint flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-mint" /> Ready ({readiness.readyItems.length})
                </span>
                <ul className="space-y-1 text-xs text-emerald-800 dark:text-mint">
                  {readiness.readyItems.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="font-bold text-emerald-600">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Needs Attention Items */}
            {readiness.attentionItems.length > 0 && (
              <div className="rounded-2xl border border-amber-300 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/20 p-4 space-y-2">
                <span className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600" /> Needs Attention ({readiness.attentionItems.length})
                </span>
                <ul className="space-y-1 text-xs text-amber-800 dark:text-amber-200">
                  {readiness.attentionItems.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="font-bold text-amber-600">&bull;</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="flex justify-between pt-4 border-t border-slate-100 dark:border-darkbg-border">
            <Button
              variant="outline"
              onClick={() => setCurrentStep(2)}
              leftIcon={<ArrowLeft className="w-4 h-4" />}
              disabled={isSubmitting}
            >
              Back to Evidence
            </Button>
            <Button
              onClick={handleSubmitBatch}
              variant={readiness.isBlocked ? "outline" : "primary"}
              disabled={readiness.isBlocked || isSubmitting}
              leftIcon={
                isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )
              }
            >
              {isSubmitting ? "Running Verification..." : "Submit Batch and Run Verification"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
