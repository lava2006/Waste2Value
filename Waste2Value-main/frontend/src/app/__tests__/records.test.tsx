import React from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", async () => {
  const t = await import("@/test-nav");
  return {
    useRouter: () => t.routerMock,
    usePathname: () => t.navState.pathname,
    useSearchParams: () => t.navState.params,
    useParams: () => t.navState.routeParams,
  };
});

import EvidencePage from "../evidence/[id]/page";
import PassportPage from "../passports/[id]/page";
import VerifyPage from "../verify/[id]/page";
import BatchPage from "../batches/[id]/page";
import { navState, renderWithProviders, useFreshDemoData } from "@/test-utils";
import { setExecutionMode } from "@/lib/api-client";
import { getBatchById, getPassportById, demoRevokePassport } from "@/lib/store";

function route(path: string, id: string, search = "") {
  navState.pathname = path;
  navState.routeParams = { id };
  navState.params = new URLSearchParams(search);
}

beforeEach(() => {
  useFreshDemoData();
  Object.defineProperty(window, "location", { value: new URL("http://localhost:3000/"), writable: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
  setExecutionMode("demo");
});

describe("Evidence workspace", () => {
  it("lists fields, explains OCR confidence, and highlights field <-> region both ways", async () => {
    route("/evidence/batch-001", "batch-001");
    const user = userEvent.setup();
    renderWithProviders(<EvidencePage />);
    const field = await screen.findByRole("button", { name: /^Certified Input Weight/ });
    expect(screen.getAllByText(/how clearly text was read/).length).toBeGreaterThan(0);
    expect(screen.getByText(/No document-authenticity check is configured/)).toBeInTheDocument();
    expect(screen.getByText(/reconstruction from extracted data/)).toBeInTheDocument();
    expect(screen.getAllByText(/Simulated regions/).length).toBeGreaterThan(0);

    await user.click(field);
    expect(field).toHaveAttribute("aria-pressed", "true");
    const region = screen.getByRole("button", { name: /Region for Certified Input Weight/ });
    expect(region).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: /Region for Operator License/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^Operator License/, pressed: true })).toBeInTheDocument());
  });

  it("survives missing and invalid bounding boxes and malformed fields", async () => {
    const batch = getBatchById("batch-001")!;
    const doc = batch.documents[0];
    doc.extractedFields[0].boundingBox = undefined;
    doc.extractedFields[1].boundingBox = { top: NaN, left: 10, width: 500, height: -3 };
    (doc.extractedFields as unknown[]).push({ id: "bad" });
    const { demoAttachDocuments } = await import("@/lib/store");
    void demoAttachDocuments;
    localStorage.setItem("w2v_demo_store_v2", JSON.stringify([batch, ...JSON.parse(localStorage.getItem("w2v_demo_store_v2") ?? "[]").filter((b: { id: string }) => b.id !== batch.id)]));
    route("/evidence/doc-101", "doc-101");
    renderWithProviders(<EvidencePage />);
    expect(await screen.findAllByText(/No region recorded for this field/)).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /Region for/ })).not.toBeInTheDocument();
  });

  it("records an audited correction, keeps the original and re-verifies", async () => {
    route("/evidence/batch-001", "batch-001");
    const user = userEvent.setup();
    renderWithProviders(<EvidencePage />);
    await screen.findByRole("button", { name: /^Certified Input Weight/ });
    await user.click(screen.getByRole("button", { name: /Correct value for Certified Input Weight/ }));
    const dialog = await screen.findByRole("dialog", { name: "Correct extracted value" });
    const save = within(dialog).getByRole("button", { name: /Save correction/ });
    expect(save).toBeDisabled();
    const value = within(dialog).getByLabelText(/Corrected value/);
    await user.clear(value);
    await user.type(value, "abc");
    await user.type(within(dialog).getByLabelText(/Reason for correction/), "Scale slip");
    await user.click(save);
    expect(await within(dialog).findByText(/numeric; enter a valid number/)).toBeInTheDocument();
    await user.clear(value);
    await user.type(value, "3000");
    await user.click(save);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("Audited correction")).toBeInTheDocument();
    expect(screen.getByText(/Original extracted value:/)).toHaveTextContent("4920");
    expect(screen.getByText(/Correction saved\. Verification re-run/)).toBeInTheDocument();
    expect(getBatchById("batch-001")!.status).toBe("REVIEW_REQUIRED");
  });

  it("shows a not-found state and a Live Mode failure", async () => {
    route("/evidence/nope", "nope");
    const { unmount } = renderWithProviders(<EvidencePage />);
    expect(await screen.findByText("Evidence not found")).toBeInTheDocument();
    unmount();
    setExecutionMode("live");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("down")));
    renderWithProviders(<EvidencePage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Could not load evidence/);
  });
});

describe("Batch detail", () => {
  it("shows independent status panels, lifecycle quantities, and deep-links to a finding", async () => {
    route("/batches/batch-002", "batch-002");
    const finding = getBatchById("batch-002")!.findings.find((f) => f.ruleId === "MB-002")!;
    window.location.hash = `#finding-${finding.id}`;
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    renderWithProviders(<BatchPage />);
    expect(await screen.findByRole("heading", { name: "BATCH-2025-002" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Documentary verification" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Risk assessment" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Passport lifecycle" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Processed input mass" }).closest("tr")).toHaveTextContent("Not recorded");
    expect(screen.getByRole("rowheader", { name: "Recovered output mass" }).closest("tr")).toHaveTextContent("Not recorded");
    await waitFor(() => expect(scroll).toHaveBeenCalled());
    expect(document.getElementById(`finding-${finding.id}`)).toHaveFocus();
    expect(screen.getAllByRole("link", { name: /WBR-2025-1104\.pdf/ }).length).toBeGreaterThan(0);
  });

  it("explains a deep link to a finding that no longer exists", async () => {
    route("/batches/batch-002", "batch-002");
    window.location.hash = "#finding-find-GONE";
    renderWithProviders(<BatchPage />);
    expect(await screen.findByText(/no longer exists on this batch/)).toBeInTheDocument();
  });

  it("only offers a passport when evidence supported, and shows revocation without changing verification", async () => {
    route("/batches/batch-002", "batch-002");
    window.location.hash = "";
    const { unmount } = renderWithProviders(<BatchPage />);
    await screen.findByRole("heading", { name: "BATCH-2025-002" });
    expect(screen.queryByRole("button", { name: /Issue Circularity Passport/ })).not.toBeInTheDocument();
    unmount();

    demoRevokePassport("W2V-CP-0001", "test revocation");
    route("/batches/batch-001", "batch-001");
    renderWithProviders(<BatchPage />);
    await screen.findByRole("heading", { name: "BATCH-2025-001" });
    expect(screen.getAllByText("Evidence Supported").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Passport Revoked/).length).toBeGreaterThan(0);
  });

  it("requires a justification before recording a decision", async () => {
    route("/batches/batch-002", "batch-002");
    window.location.hash = "";
    const user = userEvent.setup();
    renderWithProviders(<BatchPage />);
    await screen.findByRole("heading", { name: "BATCH-2025-002" });
    await user.click(screen.getByRole("button", { name: /Reject batch/ }));
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Reject batch" });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/Justification/), "Fraud confirmed");
    await user.click(confirm);
    await waitFor(() => expect(getBatchById("batch-002")!.status).toBe("REJECTED"));
    expect(await screen.findByText(/Decision recorded/)).toBeInTheDocument();
  });

  it("shows not-found for an unknown batch", async () => {
    route("/batches/zzz", "zzz");
    renderWithProviders(<BatchPage />);
    expect(await screen.findByText("Batch not found")).toBeInTheDocument();
  });
});

describe("Passport page", () => {
  it("uses the neutral title and shows independent states, lifecycle quantities and valuation disclosure", async () => {
    route("/passports/W2V-CP-0001", "W2V-CP-0001");
    renderWithProviders(<PassportPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "Circularity Passport — Evidence-Supported Record" })).toBeInTheDocument();
    expect(await screen.findByText("Hash Matches")).toBeInTheDocument();
    expect(screen.getByText("Not Configured")).toBeInTheDocument();
    expect(screen.getByText("Received mass")).toBeInTheDocument();
    expect(screen.getByText("Evidence-supported mass")).toBeInTheDocument();
    expect(screen.getByText(/not a regulatory certificate/)).toBeInTheDocument();
    expect(screen.getByText("View calculation")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /QR code for http:\/\/localhost:3000\/verify\/W2V-CP-0001/ })).toBeInTheDocument();
  });

  it("falls back to manual copy when the clipboard fails, and copies when it works", async () => {
    route("/passports/W2V-CP-0001", "W2V-CP-0001");
    const user = userEvent.setup();
    renderWithProviders(<PassportPage />);
    const btn = await screen.findByRole("button", { name: /Copy verification link/ });
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) }, configurable: true });
    document.execCommand = vi.fn().mockReturnValue(false);
    await user.click(btn);
    const input = await screen.findByLabelText("Copy manually");
    expect(input).toHaveValue("http://localhost:3000/verify/W2V-CP-0001");
    expect(screen.getByText(/Automatic copy failed/)).toBeInTheDocument();
    expect(screen.queryByText("Verification link copied")).not.toBeInTheDocument();

    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText: write }, configurable: true });
    await user.click(btn);
    await waitFor(() => expect(write).toHaveBeenCalledWith("http://localhost:3000/verify/W2V-CP-0001"));
    expect(await screen.findByText("Verification link copied")).toBeInTheDocument();
  });

  it("revokes with a mandatory justification and leaves documentary status untouched", async () => {
    route("/passports/W2V-CP-0001", "W2V-CP-0001");
    const user = userEvent.setup();
    renderWithProviders(<PassportPage />);
    await user.click(await screen.findByRole("button", { name: "Revoke passport" }));
    const dialog = await screen.findByRole("dialog", { name: "Revoke this Circularity Passport?" });
    const confirm = within(dialog).getByRole("button", { name: "Revoke passport" });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/Revocation justification/), "post-closure discrepancy");
    await user.click(confirm);
    expect(await screen.findByText(/This passport has been revoked/)).toBeInTheDocument();
    expect(getBatchById("batch-001")!.status).toBe("SUPPORTED");
    expect(screen.getAllByText("Evidence Supported").length).toBeGreaterThan(0);
    expect(await screen.findByText("Hash Matches")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revoke passport" })).not.toBeInTheDocument();
  });

  it("in Live Mode reports a failed revocation truthfully and keeps the passport active", async () => {
    setExecutionMode("live");
    const passport = {
      passport_id: "P-1", version: 1, batch_id: "b1", batch_number: "B-1", qr_code_url: "/verify/P-1", verification_url: "/verify/P-1",
      issue_timestamp: "2025-03-15T11:00:00Z", issuer_name: "x", recycler_name: "R", recycler_license: "L", facility_location: "F",
      category: "it_telecom", claimed_kg: 100, evidence_supported_kg: 99, recovery_rate_percent: 99, estimated_value_usd: 10,
      sha256_hash: "a".repeat(64), signature_status: "DEMO_SIMULATED_KMS_SIGNATURE", revoked: false, recovery_pathway: "material_recovery",
    };
    const batch = {
      id: "b1", batch_number: "B-1", category: "it_telecom", claimed_quantity: 100, unit: "kg", recycler_name: "R", recycler_registration_id: "L",
      collection_date: "2025-01-01", processing_date: "2025-01-02", origin_location: "A", destination_location: "B", status: "SUPPORTED",
      risk_score: { overall_score: 10, risk_level: "low", policy_version: "v", summary_explanation: "s", calculated_at: "2025-01-01T00:00:00Z", breakdown: { extraction_confidence: 95, evidence_completeness: 100, cross_document_consistency: 95, operational_risk: 0 } },
      mass_balance: { claimed_kg: 100, received_kg: 99, evidence_supported_kg: 99, tolerance_percentage: 2, is_within_tolerance: true },
      material_estimate: { total_gross_value_usd: 1, modeled_processing_cost_usd: 0, net_estimated_recovery_value_usd: 10, recommended_pathway: "material_recovery", reference_price_date: "2025-03-01", dataset_version: "d", calculated_at: "2025-01-01T00:00:00Z", basis_kg: 99, is_available: true },
      passport, documents: [], findings: [], timeline: [], created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-01T00:00:00Z",
    };
    const verify = { passport_id: "P-1", verification_status: "FOUND", payload_integrity: { status: "VALID", stored_sha256: "a".repeat(64), recomputed_sha256: "a".repeat(64) }, signature: { status: "SIMULATED", provider: "DEMO_SIMULATED_KMS", algorithm: "x" }, documentary_status: "SUPPORTED", lifecycle_status: "ACTIVE" };
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
      const r = (b: unknown, s = 200) => Promise.resolve(new Response(JSON.stringify(b), { status: s }));
      if (url.includes("/revoke")) return r({ detail: "database offline" }, 500);
      if (url.includes("/verify/")) return r(verify);
      if (url.includes("/passports/")) return r(passport);
      void init;
      return r(batch);
    }));
    route("/passports/P-1", "P-1");
    const user = userEvent.setup();
    renderWithProviders(<PassportPage />);
    await user.click(await screen.findByRole("button", { name: "Revoke passport" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Revocation justification/), "reason");
    await user.click(within(dialog).getByRole("button", { name: "Revoke passport" }));
    expect(await screen.findByText(/Passport revocation failed/)).toBeInTheDocument();
    expect(screen.getByText(/Your record has not been changed/)).toBeInTheDocument();
    expect(screen.queryByText(/This passport has been revoked/)).not.toBeInTheDocument();
    expect(screen.getByText("Simulated (not authentic)")).toBeInTheDocument();
  });

  it("shows not-found for an unknown passport", async () => {
    route("/passports/NOPE", "NOPE");
    renderWithProviders(<PassportPage />);
    expect(await screen.findByText("Circularity Passport not found")).toBeInTheDocument();
  });
});

describe("Public verification", () => {
  it("shows four independent pillars and never calls an unconfigured signature valid", async () => {
    route("/verify/W2V-CP-0001", "W2V-CP-0001");
    renderWithProviders(<VerifyPage />);
    expect(await screen.findByRole("heading", { name: /1\. Payload integrity/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /2\. Issuer signature/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /3\. Documentary verification/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /4\. Passport lifecycle/ })).toBeInTheDocument();
    expect(screen.getByText("Hash Matches")).toBeInTheDocument();
    expect(screen.getByText("Not Configured")).toBeInTheDocument();
    expect(screen.queryByText("Signature Valid")).not.toBeInTheDocument();
    expect(screen.getAllByText(/does not identify the issuer or prove physical recycling/).length).toBeGreaterThan(0);
  });

  it("identifies a revoked passport even though its hash is intact", async () => {
    demoRevokePassport("W2V-CP-0001", "withdrawn");
    route("/verify/W2V-CP-0001", "W2V-CP-0001");
    renderWithProviders(<VerifyPage />);
    expect(await screen.findByText("This passport has been revoked")).toBeInTheDocument();
    expect(screen.getByText("Hash Matches")).toBeInTheDocument();
    expect(screen.getAllByText(/Passport Revoked/).length).toBeGreaterThan(0);
    expect(screen.getByText("Evidence Supported")).toBeInTheDocument();
  });

  it("reports an altered stored payload as a hash mismatch", async () => {
    getPassportById("W2V-CP-0001").passport!.evidenceSupportedKg += 100;
    route("/verify/W2V-CP-0001", "W2V-CP-0001");
    renderWithProviders(<VerifyPage />);
    expect(await screen.findByText("Hash Mismatch")).toBeInTheDocument();
    expect(screen.queryByText("Hash Matches")).not.toBeInTheDocument();
  });

  it("handles unknown ids and network failures", async () => {
    route("/verify/NOPE", "NOPE");
    const { unmount } = renderWithProviders(<VerifyPage />);
    expect(await screen.findByText("Passport not found")).toBeInTheDocument();
    unmount();
    setExecutionMode("live");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("down")));
    renderWithProviders(<VerifyPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Verification could not be completed/);
  });

  it("tamper demonstration fails the altered copy and leaves the real passport verifiable", async () => {
    route("/verify/W2V-CP-0001", "W2V-CP-0001");
    const user = userEvent.setup();
    renderWithProviders(<VerifyPage />);
    await screen.findByText("Hash Matches");
    const before = getBatchById("batch-001")!.passport!.sha256Hash;
    await user.click(screen.getByRole("button", { name: /Run tamper demonstration/ }));
    const result = await screen.findByText(/Integrity check on the altered copy/);
    expect(within(result.closest("p") as HTMLElement).getByText("Hash Mismatch")).toBeInTheDocument();
    expect(getBatchById("batch-001")!.passport!.sha256Hash).toBe(before);
    expect(getBatchById("batch-001")!.passport!.evidenceSupportedKg).toBe(4920);
    await user.click(screen.getByRole("button", { name: "Re-check" }));
    await waitFor(() => expect(screen.getAllByText("Hash Matches").length).toBeGreaterThan(0));
  });
});
