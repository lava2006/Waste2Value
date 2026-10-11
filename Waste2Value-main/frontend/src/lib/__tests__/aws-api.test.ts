/** Live-Mode AWS-backed flows: integrations, S3 presigned upload -> register -> Textract, investigator, workflow. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  fetchEvidenceContentUrl,
  fetchInvestigation,
  fetchIntegrations,
  fetchWorkflowStatus,
  setExecutionMode,
  startWorkflow,
  storageEnabled,
  uploadAndExtract,
} from "../api-client";

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

const integrations = {
  environment: "prod",
  region: "us-east-1",
  repository: { provider: "dynamodb", live_aws: true },
  signing: { provider: "aws-kms", live_aws: true },
  extraction: { provider: "amazon-textract", live_aws: true },
  ai: { provider: "amazon-bedrock", live_aws: true, model: "m" },
  evidence_storage: { provider: "amazon-s3", live_aws: true },
  orchestration: { provider: "aws-step-functions", live_aws: true },
  authentication: { provider: "amazon-cognito", live_aws: true, required: true },
};

class FakeXhr {
  static last: FakeXhr | null = null;
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  timeout = 0;
  status = 204;
  url = "";
  body: FormData | null = null;
  open(_m: string, url: string) {
    this.url = url;
    FakeXhr.last = this;
  }
  send(body: FormData) {
    this.body = body;
    this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
    queueMicrotask(() => this.onload?.());
  }
}

beforeEach(() => setExecutionMode("live"));
afterEach(() => {
  vi.unstubAllGlobals();
  setExecutionMode("demo");
});

describe("integrations status", () => {
  it("is null in Demo Mode and parsed in Live Mode", async () => {
    setExecutionMode("demo");
    expect(await fetchIntegrations(true)).toBeNull();
    expect(await storageEnabled()).toBeNull();
    setExecutionMode("live");
    vi.stubGlobal("fetch", vi.fn(() => json(integrations)));
    const live = await fetchIntegrations(true);
    expect(live?.extraction.provider).toBe("amazon-textract");
    expect(await storageEnabled()).toBe(true);
  });

  it("treats a failing status endpoint as storage unavailable rather than assuming it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("down")));
    await fetchIntegrations(true).catch(() => undefined);
    expect(await storageEnabled()).toBe(false);
  });
});

describe("evidence upload to S3 then Textract", () => {
  it("uploads with presigned POST fields, registers the stored document and runs extraction in order", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        const path = url.replace(/^.*\/api/, "");
        calls.push(`${init?.method ?? "GET"} ${path}`);
        if (path.endsWith("/documents/upload-url"))
          return json({ doc_id: "doc-abc", storage_key: "evidence/b1/doc-abc/scale.pdf", max_bytes: 10485760, upload: { url: "https://bucket.s3.amazonaws.com/", fields: { key: "evidence/b1/doc-abc/scale.pdf", "Content-Type": "application/pdf", policy: "p" } } });
        if (path.endsWith("/batches/b1/documents")) {
          const body = JSON.parse(String(init?.body));
          expect(body).toMatchObject({ id: "doc-abc", status: "pending", content_stored: true, storage_key: "evidence/b1/doc-abc/scale.pdf" });
          return json({ id: "doc-abc", batch_id: "b1", title: "t", document_type: "weighbridge_record", file_name: "scale.pdf", upload_timestamp: "x" }, 201);
        }
        if (path.endsWith("/extract")) return json({ id: "doc-abc", batch_id: "b1", title: "t", document_type: "weighbridge_record", file_name: "scale.pdf", upload_timestamp: "x" });
        return json({}, 404);
      })
    );
    const progress: number[] = [];
    const file = new File(["%PDF"], "scale.pdf", { type: "application/pdf" });
    await uploadAndExtract(
      "b1",
      { localId: "l1", title: "Weighbridge Record", documentType: "weighbridge_record", fileName: "scale.pdf", fileSize: "1 KB", fields: [{ fieldName: "net_weight", label: "Net", value: 4900, unit: "kg" }], file },
      (p) => progress.push(p)
    );
    expect(calls).toEqual(["POST /batches/b1/documents/upload-url", "POST /batches/b1/documents", "POST /documents/doc-abc/extract"]);
    expect(FakeXhr.last?.url).toBe("https://bucket.s3.amazonaws.com/");
    const fields = Array.from((FakeXhr.last?.body as FormData).keys());
    expect(fields).toEqual(["key", "Content-Type", "policy", "file"]); // file must be the last form field
    expect(progress).toEqual([50]);
  });

  it("stops and reports when storage rejects the upload; nothing is registered", async () => {
    class Reject extends FakeXhr {
      status = 403;
    }
    vi.stubGlobal("XMLHttpRequest", Reject);
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        calls.push(url);
        return json({ doc_id: "d", storage_key: "k", max_bytes: 1, upload: { url: "https://b/", fields: {} } });
      })
    );
    const file = new File(["x"], "a.pdf", { type: "application/pdf" });
    await expect(
      uploadAndExtract("b1", { localId: "l", title: "t", documentType: "other", fileName: "a.pdf", fileSize: "1 B", fields: [], file })
    ).rejects.toMatchObject({ status: 403 });
    expect(calls).toHaveLength(1);
  });

  it("reports progress steps and fails with a clear error instead of hanging when storage never answers", async () => {
    class Stall extends FakeXhr {
      send() {
        queueMicrotask(() => this.ontimeout?.());
      }
    }
    vi.stubGlobal("XMLHttpRequest", Stall);
    vi.stubGlobal("fetch", vi.fn(() => json({ doc_id: "d", storage_key: "k", max_bytes: 1, upload: { url: "https://b/", fields: {} } })));
    const steps: string[] = [];
    const file = new File(["x"], "a.pdf", { type: "application/pdf" });
    await expect(
      uploadAndExtract("b1", { localId: "l", title: "t", documentType: "other", fileName: "a.pdf", fileSize: "1 B", fields: [], file }, undefined, (m) => steps.push(m))
    ).rejects.toThrow(/did not finish/);
    expect(FakeXhr.last?.timeout).toBeGreaterThan(0);
    expect(steps).toEqual(["Preparing upload of a.pdf…", "Uploading a.pdf to secure storage…"]);
  });

  it("surfaces a Textract failure from the backend", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.endsWith("/upload-url")) return json({ doc_id: "d", storage_key: "k", max_bytes: 1, upload: { url: "https://b/", fields: {} } });
        if (url.endsWith("/documents")) return json({ id: "d", batch_id: "b", title: "t", document_type: "other", file_name: "f", upload_timestamp: "x" }, 201);
        return json({ detail: "Amazon Textract call failed: throttled" }, 502);
      })
    );
    const file = new File(["x"], "a.pdf", { type: "application/pdf" });
    await expect(
      uploadAndExtract("b", { localId: "l", title: "t", documentType: "other", fileName: "a.pdf", fileSize: "1 B", fields: [], file })
    ).rejects.toThrow(/throttled/);
  });

  it("returns a presigned download URL for stored evidence", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({ url: "https://bucket/x?X-Amz-Signature=1", expires_in: 600 })));
    expect(await fetchEvidenceContentUrl("doc-1")).toContain("X-Amz-Signature");
  });
});

describe("investigator and workflow", () => {
  it("refuses the investigator in Demo Mode and parses the live report", async () => {
    setExecutionMode("demo");
    await expect(fetchInvestigation("b")).rejects.toBeInstanceOf(ApiError);
    setExecutionMode("live");
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        json({
          batch_number: "B-1",
          executive_summary: "Summary",
          grounded_citations: [{ document_id: "d", document_name: "n.pdf", field_label: "Net", observed_value: 8500, page_number: 1 }],
          auditor_questions: [{ target_entity: "Carrier", question: "q?", rationale: "r", urgency: "warning" }],
          passport_recommendation: "PAUSED",
          generated_by: "Amazon Bedrock (m)",
          generated_at: "2026-01-01T00:00:00Z",
        })
      )
    );
    const r = await fetchInvestigation("b");
    expect(r.citations[0].observedValue).toBe("8500");
    expect(r.questions[0].urgency).toBe("warning");
    expect(r.generatedBy).toMatch(/Bedrock/);
  });

  it("starts and polls the Step Functions workflow", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url.includes("/workflow/status") ? json({ status: "SUCCEEDED", started: "2026-01-01T00:00:00Z", stopped: "2026-01-01T00:00:05Z" }) : json({ execution_arn: "arn:aws:states:us-east-1:1:execution:m:x", status: "RUNNING" }, 202)
      )
    );
    const arn = await startWorkflow("b1");
    expect(arn).toContain("execution");
    expect(await fetchWorkflowStatus(arn)).toEqual({ status: "SUCCEEDED", stopped: "2026-01-01T00:00:05Z" });
  });

  it("reports an unconfigured workflow as an error, not success", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({ detail: "The AWS Step Functions workflow is not configured (STATE_MACHINE_ARN is unset)." }, 503)));
    await expect(startWorkflow("b")).rejects.toMatchObject({ status: 503 });
  });
});

describe("integrations contract", () => {
  it("accepts the payload shape a deployed backend returned (authentication without live_aws)", async () => {
    setExecutionMode("live");
    const real = {
      environment: "prod", region: "us-east-1",
      repository: { provider: "dynamodb", live_aws: true }, signing: { provider: "aws-kms", live_aws: true },
      extraction: { provider: "amazon-rekognition+nova", live_aws: true }, ai: { provider: "amazon-bedrock", model: "us.amazon.nova-lite-v1:0", live_aws: true },
      evidence_storage: { provider: "amazon-s3", live_aws: true }, orchestration: { provider: "aws-step-functions", live_aws: true },
      authentication: { provider: "amazon-cognito", required: true },
    };
    vi.stubGlobal("fetch", vi.fn(() => json(real)));
    const r = await fetchIntegrations(true);
    expect(r?.authentication.required).toBe(true);
    expect(r?.extraction.provider).toBe("amazon-rekognition+nova");
  });
});
