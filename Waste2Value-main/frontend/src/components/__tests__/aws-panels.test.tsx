import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/batches/batch-001",
  useSearchParams: () => new URLSearchParams(),
}));

import { InvestigatorPanel, WorkflowButton } from "../AwsPanels";
import { ToastProvider } from "@/components/ui/Toast";
import { getInitialBatches } from "@/lib/demo-data";
import { setExecutionMode } from "@/lib/api-client";
import { renderHook } from "@testing-library/react";
import { useRouteId } from "@/lib/route";
import type { IntegrationsStatus } from "@/types";

const status = (over: Partial<IntegrationsStatus> = {}): IntegrationsStatus => ({
  environment: "prod",
  region: "us-east-1",
  repository: { provider: "dynamodb", live_aws: true },
  signing: { provider: "aws-kms", live_aws: true },
  extraction: { provider: "amazon-textract", live_aws: true },
  ai: { provider: "amazon-bedrock", live_aws: true, model: "claude-haiku" },
  evidence_storage: { provider: "amazon-s3", live_aws: true },
  orchestration: { provider: "aws-step-functions", live_aws: true },
  authentication: { provider: "amazon-cognito", live_aws: true, required: true },
  ...over,
});

const batch = getInitialBatches()[1];
const json = (b: unknown, s = 200) => Promise.resolve(new Response(JSON.stringify(b), { status: s }));

afterEach(() => {
  vi.unstubAllGlobals();
  setExecutionMode("demo");
});

describe("InvestigatorPanel", () => {
  it("labels AI output, shows grounded citations and questions", async () => {
    setExecutionMode("live");
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        json({
          batch_number: batch.batchNumber,
          executive_summary: "Received mass is well below the claim.",
          grounded_citations: [{ document_id: "doc-202", document_name: "WBR-2025-1104.pdf", field_label: "Weighbridge Inbound Net", observed_value: 8500, page_number: 1 }],
          auditor_questions: [{ target_entity: "Carrier", question: "Why the shortfall?", rationale: "MB-002", urgency: "warning" }],
          passport_recommendation: "PAUSED: passport blocked.",
          generated_by: "Amazon Bedrock (claude-haiku), grounded on this batch's verification findings",
          generated_at: "2026-10-11T10:00:00Z",
        })
      )
    );
    const user = userEvent.setup();
    render(<InvestigatorPanel batch={batch} integrations={status()} />);
    expect(screen.getByText(/Amazon Bedrock \(claude-haiku\) summarizes/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Generate investigator summary/ }));
    expect(await screen.findByText("Received mass is well below the claim.")).toBeInTheDocument();
    expect(screen.getByText("AI-generated")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "WBR-2025-1104.pdf" })).toHaveAttribute("href", "/evidence/doc-202");
    expect(screen.getByText("Why the shortfall?")).toBeInTheDocument();
  });

  it("says plainly when no AI model is used, and shows failures instead of fake output", async () => {
    setExecutionMode("live");
    vi.stubGlobal("fetch", vi.fn(() => json({ detail: "Amazon Bedrock investigation failed: AccessDenied" }, 502)));
    const user = userEvent.setup();
    render(<InvestigatorPanel batch={batch} integrations={status({ ai: { provider: "deterministic-rules", live_aws: false } })} />);
    expect(screen.getByText(/deterministic rule summary \(no AI model\)/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Generate investigator summary/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/AccessDenied/);
    expect(screen.queryByText("AI-generated")).not.toBeInTheDocument();
  });
});

describe("WorkflowButton", () => {
  it("is hidden when Step Functions is not live", () => {
    const { container } = render(
      <ToastProvider>
        <WorkflowButton batch={batch} integrations={status({ orchestration: { provider: "none", live_aws: false } })} onFinished={vi.fn()} />
      </ToastProvider>
    );
    expect(container.querySelector("button")).toBeNull();
  });

  it("starts the execution, polls to completion and reloads the batch", async () => {
    setExecutionMode("live");
    let polls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/workflow/status")) {
          polls += 1;
          return json({ status: polls < 2 ? "RUNNING" : "SUCCEEDED", started: "2026-01-01T00:00:00Z", stopped: null });
        }
        return json({ execution_arn: "arn:aws:states:us-east-1:1:execution:m:x", status: "RUNNING" }, 202);
      })
    );
    const onFinished = vi.fn();
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <WorkflowButton batch={batch} integrations={status()} onFinished={onFinished} />
      </ToastProvider>
    );
    await user.click(screen.getByRole("button", { name: /Run AWS verification workflow/ }));
    expect(await screen.findByText("Workflow started")).toBeInTheDocument();
    await waitFor(() => expect(onFinished).toHaveBeenCalled(), { timeout: 8000 });
    expect(await screen.findByText("Workflow finished")).toBeInTheDocument();
  }, 15000);

  it("reports a failed execution truthfully", async () => {
    setExecutionMode("live");
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url.includes("/workflow/status") ? json({ status: "FAILED", started: "x", stopped: "y" }) : json({ execution_arn: "arn:aws:states:us-east-1:1:execution:m:x", status: "RUNNING" }, 202)
      )
    );
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <WorkflowButton batch={batch} integrations={status()} onFinished={vi.fn()} />
      </ToastProvider>
    );
    await user.click(screen.getByRole("button", { name: /Run AWS verification workflow/ }));
    expect(await screen.findByText("Workflow did not succeed", undefined, { timeout: 8000 })).toBeInTheDocument();
  }, 15000);
});

describe("useRouteId", () => {
  it("reads the real id from the URL path (works with the static-export placeholder)", () => {
    const { result } = renderHook(() => useRouteId("batches"));
    expect(result.current).toBe("batch-001");
    expect(renderHook(() => useRouteId("verify")).result.current).toBe("");
  });
});
