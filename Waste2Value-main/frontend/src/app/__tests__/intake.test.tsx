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

import NewBatchPage from "../batches/new/page";
import { navState, renderWithProviders, routerMock, useFreshDemoData } from "@/test-utils";
import { getStoredBatches } from "@/lib/store";
import { setExecutionMode } from "@/lib/api-client";

const pdf = (name: string, content = name) => new File([content], name, { type: "application/pdf" });

async function fillDetails(user: ReturnType<typeof userEvent.setup>, over: Partial<Record<string, string>> = {}) {
  const set = async (label: RegExp, value: string) => {
    const el = screen.getByLabelText(label);
    await user.clear(el);
    if (value) await user.type(el, value);
  };
  await set(/Batch identifier/, over.batch ?? "BATCH-UI-1");
  await set(/^Claimed quantity \*/, over.qty ?? "5000");
  await set(/Recycler \/ operator name/, over.recycler ?? "GreenTech Circular Ltd");
  await set(/Facility registration ID/, "REG-1");
  await set(/Collection date/, over.collect ?? "2025-04-01");
  if (over.process !== undefined || true) await set(/Processing date/, over.process ?? "2025-04-05");
  await set(/Collection origin/, "Frankfurt");
  await set(/Destination facility/, "Leipzig");
}

beforeEach(() => {
  useFreshDemoData();
  navState.pathname = "/batches/new";
  routerMock.push.mockClear();
});
afterEach(() => setExecutionMode("demo"));

describe("Intake wizard - step 1 validation", () => {
  it("keeps the claimed-quantity number input usable beside the unit select (select must not be w-full)", () => {
    renderWithProviders(<NewBatchPage />);
    const unit = screen.getByLabelText("Claimed quantity unit");
    expect(unit.className).not.toMatch(/(^|\s)w-full(\s|$)/);
    expect(unit.className).toContain("w-36");
    expect(screen.getByLabelText(/^Claimed quantity \*/).className).toContain("flex-1");
  });

  it("shows field-level errors and stays on step 1", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewBatchPage />);
    await user.click(screen.getByRole("button", { name: /Continue to evidence/ }));
    const qty = screen.getByLabelText(/^Claimed quantity \*/);
    expect(qty).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Claimed quantity is required and must be a number.")).toBeInTheDocument();
    expect(screen.getByText("Recycler or operator name is required.")).toBeInTheDocument();
    expect(screen.getByText("Collection date is required.")).toBeInTheDocument();
    expect(screen.queryByText("Evidence documents")).not.toBeInTheDocument();
  });

  it("rejects non-positive quantities", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewBatchPage />);
    await fillDetails(user, { qty: "-5" });
    await user.click(screen.getByRole("button", { name: /Continue to evidence/ }));
    expect(screen.getByText("Claimed quantity must be greater than 0.")).toBeInTheDocument();
  });

  it("does not reject a chronology anomaly as an input error; it only warns", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewBatchPage />);
    await fillDetails(user, { collect: "2025-03-25", process: "2025-02-14" });
    expect(screen.getByRole("note")).toHaveTextContent(/before the collection date/);
    await user.click(screen.getByRole("button", { name: /Continue to evidence/ }));
    expect(screen.getByRole("heading", { name: "Evidence documents" })).toBeInTheDocument();
  });

  it("explains collection versus processing date", () => {
    renderWithProviders(<NewBatchPage />);
    expect(screen.getByText(/When the e-waste was collected and dispatched/)).toBeInTheDocument();
    expect(screen.getByText(/When the recycler processed it\. Leave empty if pending/)).toBeInTheDocument();
  });
});

describe("Intake wizard - evidence step", () => {
  async function toEvidence(user: ReturnType<typeof userEvent.setup>) {
    await fillDetails(user);
    await user.click(screen.getByRole("button", { name: /Continue to evidence/ }));
  }

  it("shows category-specific requirements and starts with no fabricated documents", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewBatchPage />);
    await toEvidence(user);
    expect(screen.getByText(/Transport Waybill \(required\)/)).toBeInTheDocument();
    expect(screen.getByText(/Weighbridge Record \(required\)/)).toBeInTheDocument();
    expect(screen.getByText(/No evidence attached/)).toBeInTheDocument();
  });

  it("accepts real files, reads them with progress, validates type and detects duplicates", async () => {
    // applyAccept:false simulates drag-and-drop, which bypasses the input's accept filter.
    const user = userEvent.setup({ applyAccept: false });
    renderWithProviders(<NewBatchPage />);
    await toEvidence(user);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, [pdf("waybill-1.pdf", "alpha"), new File(["x"], "malware.exe", { type: "application/x-msdownload" })]);
    expect(await screen.findByRole("alert")).toHaveTextContent(/malware\.exe: Unsupported file type/);
    expect(await screen.findByText("Ready")).toBeInTheDocument();
    expect(screen.getByLabelText(/Document type/)).toHaveValue("transport_waybill");

    // same name+size again
    await user.upload(input, [pdf("waybill-1.pdf", "alpha")]);
    expect(await screen.findByText(/same name and size is already attached/)).toBeInTheDocument();

    // same content under a different name
    await user.upload(input, [pdf("copy-of-it.pdf", "alpha")]);
    expect(await screen.findByText(/Duplicate content: identical to waybill-1\.pdf/)).toBeInTheDocument();
  });

  it("asks for confirmation before removing a file", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewBatchPage />);
    await toEvidence(user);
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, [pdf("scale-ticket.pdf", "beta")]);
    await screen.findByText("Ready");
    await user.click(screen.getByRole("button", { name: "Remove scale-ticket.pdf" }));
    const dialog = await screen.findByRole("dialog", { name: "Remove this evidence file?" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("scale-ticket.pdf")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove scale-ticket.pdf" }));
    await user.click(await screen.findByRole("button", { name: "Remove file" }));
    await waitFor(() => expect(screen.queryByText("scale-ticket.pdf")).not.toBeInTheDocument());
  });

  it("preserves details, files and entered quantities when navigating back and forward", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewBatchPage />);
    await toEvidence(user);
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, [pdf("weighbridge-a.pdf", "gamma")]);
    await screen.findByText("Ready");
    const weight = screen.getByLabelText(/Net weight stated on the weighbridge record/);
    await user.type(weight, "4900");

    await user.click(screen.getByRole("button", { name: /Continue to readiness/ }));
    expect(screen.getByRole("heading", { name: "Submission readiness" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Back to evidence/ }));
    expect(screen.getByText("weighbridge-a.pdf")).toBeInTheDocument();
    expect(screen.getByLabelText(/Net weight stated on the weighbridge record/)).toHaveValue(4900);

    await user.click(screen.getByRole("button", { name: /Back to details/ }));
    expect(screen.getByLabelText(/Batch identifier/)).toHaveValue("BATCH-UI-1");
    expect(screen.getByLabelText(/Recycler \/ operator name/)).toHaveValue("GreenTech Circular Ltd");
  });
});

describe("Intake wizard - readiness and submission", () => {
  async function toReadiness(user: ReturnType<typeof userEvent.setup>, files: File[] = []) {
    await fillDetails(user);
    await user.click(screen.getByRole("button", { name: /Continue to evidence/ }));
    if (files.length) {
      await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, files);
      await waitFor(() => expect(screen.getAllByText("Ready").length).toBe(files.length));
    }
    await user.click(screen.getByRole("button", { name: /Continue to readiness/ }));
  }

  it("groups items into Blocked, Needs attention and Ready with reasons; missing documents do not block", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewBatchPage />);
    await toReadiness(user);
    const attention = screen.getByRole("region", { name: /Needs attention/ });
    expect(attention).toHaveTextContent(/Transport Waybill is missing \(required by policy\)/);
    expect(attention).toHaveTextContent(/verification will raise a completeness finding/);
    expect(screen.getByRole("region", { name: /Ready/ })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /Blocked/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit Batch and Run Verification" })).toBeEnabled();
  });

  it("blocks while a file is invalid or details are broken", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewBatchPage />);
    await toReadiness(user, [pdf("a.pdf", "same-content"), pdf("b.pdf", "same-content")].slice(0, 1));
    // an invalid second file (duplicate content) leaves an error item that blocks
    await user.click(screen.getByRole("button", { name: /Back to evidence/ }));
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, [pdf("b.pdf", "same-content")]);
    await screen.findByText(/Duplicate content/);
    await user.click(screen.getByRole("button", { name: /Continue to readiness/ }));
    expect(screen.getByRole("region", { name: /Blocked/ })).toHaveTextContent(/failed validation/);
    expect(screen.getByRole("button", { name: "Submit Batch and Run Verification" })).toBeDisabled();
  });

  it("prevents duplicate submissions and navigates to the created batch with a truthful result", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewBatchPage />);
    await toReadiness(user, [pdf("waybill-x.pdf", "w"), pdf("weighbridge-x.pdf", "s")]);
    const before = getStoredBatches().length;
    const submit = screen.getByRole("button", { name: "Submit Batch and Run Verification" });
    await user.dblClick(submit);
    await waitFor(() => expect(routerMock.push).toHaveBeenCalled());
    expect(getStoredBatches().length).toBe(before + 1);
    expect(routerMock.push).toHaveBeenCalledTimes(1);
    const created = getStoredBatches().find((b) => b.batchNumber === "BATCH-UI-1")!;
    expect(routerMock.push).toHaveBeenCalledWith(`/batches/${created.id}`);
    expect(created.status).toBe("REVIEW_REQUIRED"); // no stated quantities were entered
    expect(await screen.findByText(/Batch created\. Verification completed/)).toBeInTheDocument();
  });

  it("returns to step 1 with a field error when the batch id already exists", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewBatchPage />);
    await fillDetails(user, { batch: "BATCH-2025-001" });
    await user.click(screen.getByRole("button", { name: /Continue to evidence/ }));
    await user.click(screen.getByRole("button", { name: /Continue to readiness/ }));
    expect(screen.getByRole("region", { name: /Blocked/ })).toHaveTextContent(/already exists/);
    expect(screen.getByRole("button", { name: "Submit Batch and Run Verification" })).toBeDisabled();
  });

  it("in Live Mode does not claim success when the backend is down and writes nothing locally", async () => {
    setExecutionMode("live");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("down")));
    const user = userEvent.setup();
    renderWithProviders(<NewBatchPage />);
    await toReadiness(user);
    const before = getStoredBatches().length;
    await user.click(screen.getByRole("button", { name: "Submit Batch and Run Verification" }));
    expect(await screen.findAllByRole("alert")).not.toHaveLength(0);
    expect(screen.getAllByText(/unreachable/i).length).toBeGreaterThan(0);
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(getStoredBatches().length).toBe(before);
    vi.unstubAllGlobals();
  });

  it("in Live Mode retries evidence registration after a partial failure", async () => {
    setExecutionMode("live");
    const createdBatch = {
      id: "b-live",
      batch_number: "BATCH-UI-1",
      category: "it_telecom",
      claimed_quantity: 5000,
      unit: "kg",
      recycler_name: "GreenTech Circular Ltd",
      recycler_registration_id: "REG-1",
      collection_date: "2025-04-01",
      processing_date: "2025-04-05",
      origin_location: "Frankfurt",
      destination_location: "Leipzig",
      status: "REVIEW_REQUIRED",
      risk_score: { overall_score: 40, risk_level: "medium", policy_version: "v", summary_explanation: "s", calculated_at: "2025-01-01T00:00:00Z", breakdown: { extraction_confidence: 95, evidence_completeness: 50, cross_document_consistency: 65, operational_risk: 25 } },
      mass_balance: { claimed_kg: 5000, tolerance_percentage: 2, is_within_tolerance: false },
      material_estimate: { total_gross_value_usd: 0, modeled_processing_cost_usd: 0, net_estimated_recovery_value_usd: 0, recommended_pathway: "material_recovery", reference_price_date: "2025-03-01", dataset_version: "d", calculated_at: "2025-01-01T00:00:00Z", is_available: false },
      documents: [],
      findings: [],
      timeline: [],
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    };
    let docAttempts = 0;
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const json = (b: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(b), { status }));
      if (url.endsWith("/batches") && init?.method === "POST") return json(createdBatch, 201);
      if (url.includes("/documents")) {
        docAttempts += 1;
        return docAttempts === 1 ? json({ detail: "storage hiccup" }, 500) : json({ id: "d", batch_id: "b-live", title: "t", document_type: "transport_waybill", file_name: "f", upload_timestamp: "x" }, 201);
      }
      return json(createdBatch);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderWithProviders(<NewBatchPage />);
    await toReadiness(user, [pdf("waybill-live.pdf", "live")]);
    await user.click(screen.getByRole("button", { name: "Submit Batch and Run Verification" }));
    expect(await screen.findByText(/The batch exists, but these evidence records were not registered/)).toBeInTheDocument();
    expect(screen.getByText(/storage hiccup/)).toBeInTheDocument();
    expect(routerMock.push).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /Retry evidence registration/ }));
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith("/batches/b-live"));
    expect(docAttempts).toBe(2);
    vi.unstubAllGlobals();
  });

  it("offers clearly labelled simulated samples only in Demo Mode", async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithProviders(<NewBatchPage />);
    await user.click(screen.getByRole("button", { name: "Clean sample" }));
    await user.click(screen.getByRole("button", { name: /Continue to evidence/ }));
    expect(screen.getAllByText(/Simulated sample \(no file\)/).length).toBe(3);
    unmount();
    setExecutionMode("live");
    renderWithProviders(<NewBatchPage />);
    expect(screen.queryByRole("button", { name: "Clean sample" })).not.toBeInTheDocument();
  });
});
