/**
 * Data-access layer. Every operation has two implementations selected by the execution mode:
 *  - "live": the FastAPI backend. Failures surface as ApiError; there is NO fallback to demo data.
 *  - "demo": the browser-local demo store + demo engine (a labelled simulation).
 * Pages call only the functions exported here.
 */
import { z } from "zod";
import { authConfigured, getIdToken, getUser } from "./auth";
import type {
  Batch,
  CircularityPassport,
  DocumentEvidence,
  ExecutionMode,
  IntegrationsStatus,
  InvestigationReport,
  PublicVerification,
  TamperDemoResult,
  VerificationStatus,
} from "@/types";
import {
  batchListSchema,
  batchSchema,
  documentSchema,
  integrationsSchema,
  investigationSchema,
  passportSchema,
  publicVerifySchema,
  revokeResponseSchema,
  tamperDemoSchema,
  uploadUrlSchema,
  workflowStartSchema,
  workflowStatusSchema,
} from "./backend-schemas";
import {
  DemoStoreError,
  createDemoBatch,
  demoAttachDocuments,
  demoCorrectField,
  demoIssuePassport,
  demoRecordDecision,
  demoRevokePassport,
  demoVerify,
  findBatchByDocumentId,
  getBatchById,
  getPassportById,
  getStoredBatches,
  resetStore,
} from "./store";
import { BatchInput } from "./demo-engine";
import { demoPublicVerification, demoTamper } from "./passport";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";
const MODE_KEY = "w2v_execution_mode";
const OPERATOR_KEY = "w2v_operator_label";
export const MODE_EVENT = "w2v-mode-change";
const REQUEST_TIMEOUT_MS = 15000;
// Document reading (Rekognition / Nova) is slower than a CRUD call; API Gateway cuts HTTP APIs off at 30 s.
const EXTRACT_TIMEOUT_MS = 28000;
const UPLOAD_TIMEOUT_MS = 120000;

// ---------------------------------------------------------------- mode + operator label
export function getExecutionMode(): ExecutionMode {
  if (typeof window === "undefined") return "demo";
  const fallback: ExecutionMode = process.env.NEXT_PUBLIC_DEFAULT_MODE === "live" ? "live" : "demo";
  try {
    const stored = localStorage.getItem(MODE_KEY);
    return stored === "live" || stored === "demo" ? stored : fallback;
  } catch {
    return fallback;
  }
}

export function setExecutionMode(mode: ExecutionMode): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // ignore storage failures; mode then stays at its previous value
  }
  window.dispatchEvent(new Event(MODE_EVENT));
}

/** Free-text, UNVERIFIED label recorded with corrections/decisions. No authentication exists. */
export function getOperatorLabel(): string {
  if (typeof window === "undefined") return "operator-unverified";
  // A signed-in user is the verified identity (the backend overrides this value anyway).
  const user = authConfigured() ? getUser() : null;
  if (user) return user.email;
  try {
    return localStorage.getItem(OPERATOR_KEY)?.trim() || "operator-unverified";
  } catch {
    return "operator-unverified";
  }
}

export function setOperatorLabel(label: string): void {
  try {
    localStorage.setItem(OPERATOR_KEY, label.trim());
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------- errors
export type ApiErrorKind = "network" | "http" | "contract" | "demo";

export class ApiError extends Error {
  constructor(message: string, public kind: ApiErrorKind, public status?: number) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Unexpected error";
}

function detailToMessage(detail: unknown): string | null {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((d) => {
        if (d && typeof d === "object" && "msg" in d) {
          const loc = Array.isArray((d as { loc?: unknown[] }).loc) ? (d as { loc: unknown[] }).loc.slice(1).join(".") : "";
          return `${loc ? `${loc}: ` : ""}${String((d as { msg: unknown }).msg)}`;
        }
        return null;
      })
      .filter((x): x is string => !!x);
    return parts.length ? parts.join("; ") : null;
  }
  return null;
}

async function request<S extends z.ZodTypeAny>(
  path: string,
  schema: S,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<z.output<S>> {
  const controller = new AbortController();
  const token = await getIdToken();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      cache: "no-store",
      ...init,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
      signal: controller.signal,
    });
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === "AbortError";
    throw new ApiError(
      timedOut
        ? `The verification service did not respond within ${timeoutMs / 1000}s (${API_BASE_URL}).`
        : `The verification service is unreachable at ${API_BASE_URL}. Start the FastAPI backend or switch to Demo Mode in Settings. Live Mode never falls back to demo data.`,
      "network"
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || (res.status === 403 && authConfigured() && !token)) {
    throw new ApiError("Sign in is required to use Live Mode on this deployment.", "http", 401);
  }
  if (!res.ok) {
    let detail: string | null = null;
    try {
      detail = detailToMessage(((await res.json()) as { detail?: unknown }).detail);
    } catch {
      // body was not JSON
    }
    throw new ApiError(detail ?? `The verification service returned HTTP ${res.status} (${res.statusText || "error"}).`, "http", res.status);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ApiError("The verification service returned a response that is not valid JSON.", "contract", res.status);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(
      `The verification service response did not match the expected contract (${parsed.error.issues[0]?.path.join(".") || "root"}: ${parsed.error.issues[0]?.message}).`,
      "contract",
      res.status
    );
  }
  return parsed.data;
}

function demoCall<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof DemoStoreError) throw new ApiError(err.message, "demo", err.code === "not_found" ? 404 : err.code === "conflict" ? 409 : 422);
    throw err;
  }
}

const jsonBody = (value: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(value) });

// ---------------------------------------------------------------- reads
export async function fetchBatches(): Promise<Batch[]> {
  if (getExecutionMode() === "demo") return getStoredBatches();
  return request("/batches", batchListSchema);
}

export async function fetchBatch(id: string): Promise<Batch> {
  if (getExecutionMode() === "demo") {
    const b = getBatchById(id);
    if (!b) throw new ApiError(`Batch '${id}' was not found in the Demo Mode dataset.`, "demo", 404);
    return b;
  }
  return request(`/batches/${encodeURIComponent(id)}`, batchSchema);
}

/** Resolve a batch id OR a document id to its batch plus (when given a document id) the document id. */
export async function fetchEvidenceContext(id: string): Promise<{ batch: Batch; documentId?: string }> {
  if (getExecutionMode() === "demo") {
    const direct = getBatchById(id);
    if (direct) return { batch: direct };
    const found = findBatchByDocumentId(id);
    if (found) return { batch: found.batch, documentId: id };
    throw new ApiError(`No batch or evidence document matches '${id}' in the Demo Mode dataset.`, "demo", 404);
  }
  try {
    return { batch: await fetchBatch(id) };
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 404) throw err;
  }
  const doc = await request(`/documents/${encodeURIComponent(id)}`, documentSchema);
  return { batch: await fetchBatch(doc.batchId), documentId: doc.id };
}

export async function fetchPassportRecord(id: string): Promise<{ batch: Batch; passport: CircularityPassport }> {
  if (getExecutionMode() === "demo") {
    let { batch, passport } = getPassportById(id);
    if (!passport) {
      const byBatch = getBatchById(id);
      if (byBatch?.passport) {
        batch = byBatch;
        passport = byBatch.passport;
      }
    }
    if (!batch || !passport) throw new ApiError(`No passport matches '${id}' in the Demo Mode dataset.`, "demo", 404);
    return { batch, passport };
  }
  let passport: CircularityPassport;
  try {
    passport = await request(`/passports/${encodeURIComponent(id)}`, passportSchema);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      const batch = await fetchBatch(id).catch(() => null);
      if (batch?.passport) return { batch, passport: batch.passport };
    }
    throw err;
  }
  return { batch: await fetchBatch(passport.batchId), passport };
}

export async function fetchPublicVerification(id: string): Promise<PublicVerification> {
  if (getExecutionMode() === "demo") {
    const { batch, passport } = getPassportById(id);
    if (!batch || !passport) {
      return { found: false, passportId: id, message: "No record in the Demo Mode dataset matches this passport identifier." };
    }
    return demoPublicVerification(batch, passport);
  }
  return request(`/verify/${encodeURIComponent(id)}`, publicVerifySchema);
}

export async function runTamperDemo(passport: CircularityPassport | { passportId: string }): Promise<TamperDemoResult> {
  if (getExecutionMode() === "demo") {
    const { passport: stored } = getPassportById(passport.passportId);
    if (!stored) throw new ApiError("Passport not found in the Demo Mode dataset.", "demo", 404);
    return demoTamper(stored);
  }
  return request(`/verify/${encodeURIComponent(passport.passportId)}/tamper-demo`, tamperDemoSchema, { method: "POST" });
}

// ---------------------------------------------------------------- writes
export interface EvidenceDraftField {
  fieldName: string;
  label: string;
  value: number | string;
  unit?: string;
}

export interface EvidenceDraft {
  localId: string;
  title: string;
  documentType: DocumentEvidence["documentType"];
  fileName: string;
  fileSize: string;
  fields: EvidenceDraftField[];
  /** The real browser File; uploaded to evidence storage when the backend has it. */
  file?: File;
}

export interface CreateBatchPayload {
  input: BatchInput;
  notes?: string;
  evidence: EvidenceDraft[];
  /** Human-readable progress ("Uploading scale.pdf…") for long-running submits. */
  onStatus?: (message: string) => void;
}

export interface CreateBatchResult {
  batch: Batch;
  failedEvidence: { fileName: string; message: string }[];
}

function draftToDocument(d: EvidenceDraft, batchId: string, docId: string): DocumentEvidence {
  return {
    id: docId,
    batchId,
    title: d.title,
    documentType: d.documentType,
    fileName: d.fileName,
    fileSize: d.fileSize,
    uploadTimestamp: new Date().toISOString(),
    status: "extracted",
    contentStored: false,
    extractedFields: d.fields.map((f, i) => ({
      id: `${docId}-f${i + 1}`,
      documentId: docId,
      fieldName: f.fieldName,
      label: f.label,
      value: f.value,
      unit: f.unit,
      confidence: 1,
      pageNumber: 1,
      extractionSource: "manual_entry" as const,
    })),
  };
}

export async function createBatch(payload: CreateBatchPayload): Promise<CreateBatchResult> {
  const { input } = payload;
  if (getExecutionMode() === "demo") {
    const documents = payload.evidence.map((d) => draftToDocument(d, "pending", `doc-${d.localId}`));
    const batch = demoCall(() => createDemoBatch({ input, notes: payload.notes, documents }));
    return { batch, failedEvidence: [] };
  }

  const created = await request(
    "/batches",
    batchSchema,
    jsonBody({
      batch_number: input.batchNumber,
      category: input.category,
      claimed_quantity: input.claimedQuantity,
      unit: input.unit,
      recycler_name: input.recyclerName,
      recycler_registration_id: input.recyclerRegistrationId,
      collection_date: input.collectionDate,
      processing_date: input.processingDate,
      origin_location: input.originLocation,
      destination_location: input.destinationLocation,
      notes: payload.notes || null,
    })
  );

  const attached = await attachEvidence(created.id, payload.evidence, payload.onStatus);
  return { batch: attached.batch, failedEvidence: attached.failedEvidence };
}

/** Register evidence records on an existing batch. Safe to retry: already-attached ids are skipped. */
export async function attachEvidence(batchId: string, evidence: EvidenceDraft[], onStatus?: (message: string) => void): Promise<CreateBatchResult> {
  if (getExecutionMode() === "demo") {
    const docs = evidence.map((d) => draftToDocument(d, batchId, `doc-${d.localId}`));
    return { batch: demoCall(() => demoAttachDocuments(batchId, docs)), failedEvidence: [] };
  }
  const failedEvidence: CreateBatchResult["failedEvidence"] = [];
  const useStorage = (await storageEnabled()) === true;
  for (const d of evidence) {
    if (useStorage && d.file) {
      try {
        await uploadAndExtract(batchId, d, undefined, onStatus);
      } catch (err) {
        failedEvidence.push({ fileName: d.fileName, message: errorMessage(err) });
      }
      continue;
    }
    const doc = draftToDocument(d, batchId, `doc-${d.localId}`);
    try {
      await request(
        `/batches/${encodeURIComponent(batchId)}/documents`,
        documentSchema,
        jsonBody({
          id: doc.id,
          batch_id: batchId,
          title: doc.title,
          document_type: doc.documentType,
          file_name: doc.fileName,
          file_size: doc.fileSize,
          upload_timestamp: doc.uploadTimestamp,
          status: "extracted",
          content_stored: false,
          extracted_fields: doc.extractedFields.map((f) => ({
            id: f.id,
            document_id: f.documentId,
            field_name: f.fieldName,
            label: f.label,
            value: f.value,
            unit: f.unit ?? null,
            confidence: f.confidence,
            page_number: f.pageNumber,
            extraction_source: f.extractionSource,
          })),
        })
      );
    } catch (err) {
      // 409 means this exact evidence record is already attached (a retry): treat as success.
      if (!(err instanceof ApiError && err.status === 409)) failedEvidence.push({ fileName: d.fileName, message: errorMessage(err) });
    }
  }
  return { batch: await fetchBatch(batchId), failedEvidence };
}

// ---------------------------------------------------------------- AWS-backed capabilities
let integrationsCache: { key: string; value: IntegrationsStatus } | null = null;

/** Runtime integration status. null in Demo Mode (nothing is connected there). */
export async function fetchIntegrations(force = false): Promise<IntegrationsStatus | null> {
  if (getExecutionMode() === "demo") return null;
  if (!force && integrationsCache && integrationsCache.key === API_BASE_URL) return integrationsCache.value;
  try {
    const value = await request("/integrations", integrationsSchema);
    integrationsCache = { key: API_BASE_URL, value };
    return value;
  } catch (err) {
    integrationsCache = null; // never keep trusting a status we could not re-confirm
    throw err;
  }
}

export async function storageEnabled(): Promise<boolean | null> {
  try {
    const i = await fetchIntegrations();
    return i ? i.evidence_storage.live_aws : null;
  } catch {
    return false;
  }
}

function postWithProgress(url: string, form: FormData, onProgress?: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new ApiError(`Evidence upload was rejected by storage (HTTP ${xhr.status}).`, "http", xhr.status));
    xhr.onerror = () => reject(new ApiError("Evidence upload failed: storage was unreachable.", "network"));
    xhr.ontimeout = () => reject(new ApiError(`Evidence upload did not finish within ${UPLOAD_TIMEOUT_MS / 1000}s. Check the connection and retry.`, "network"));
    xhr.onabort = () => reject(new ApiError("Evidence upload was cancelled.", "network"));
    xhr.send(form);
  });
}

/** Upload the real file to private S3 storage, register it, then run Amazon Textract on it. */
export async function uploadAndExtract(
  batchId: string,
  d: EvidenceDraft,
  onProgress?: (pct: number) => void,
  onStatus?: (message: string) => void
): Promise<void> {
  if (!d.file) throw new ApiError("No file to upload.", "demo");
  onStatus?.(`Preparing upload of ${d.fileName}…`);
  const target = await request(
    `/batches/${encodeURIComponent(batchId)}/documents/upload-url`,
    uploadUrlSchema,
    jsonBody({ file_name: d.fileName, size: d.file.size, document_type: d.documentType })
  );
  const form = new FormData();
  Object.entries(target.upload.fields).forEach(([k, v]) => form.append(k, v));
  form.append("file", d.file);
  onStatus?.(`Uploading ${d.fileName} to secure storage…`);
  await postWithProgress(target.upload.url, form, onProgress);
  onStatus?.(`Registering ${d.fileName}…`);

  const manual = draftToDocument(d, batchId, target.doc_id).extractedFields;
  await request(
    `/batches/${encodeURIComponent(batchId)}/documents`,
    documentSchema,
    jsonBody({
      id: target.doc_id,
      batch_id: batchId,
      title: d.title,
      document_type: d.documentType,
      file_name: d.fileName,
      file_size: d.fileSize,
      upload_timestamp: new Date().toISOString(),
      status: "pending",
      content_stored: true,
      storage_key: target.storage_key,
      extracted_fields: manual.map((f) => ({
        id: f.id, document_id: f.documentId, field_name: f.fieldName, label: f.label, value: f.value,
        unit: f.unit ?? null, confidence: f.confidence, page_number: f.pageNumber, extraction_source: f.extractionSource,
      })),
    })
  );
  onStatus?.(`Reading ${d.fileName} with AWS document AI…`);
  await request(`/documents/${encodeURIComponent(target.doc_id)}/extract`, documentSchema, { method: "POST" }, EXTRACT_TIMEOUT_MS);
}

export async function fetchEvidenceContentUrl(docId: string): Promise<string> {
  const r = await request(`/documents/${encodeURIComponent(docId)}/content-url`, z.object({ url: z.string() }));
  return r.url;
}

export async function fetchInvestigation(batchId: string): Promise<InvestigationReport> {
  if (getExecutionMode() === "demo") {
    throw new ApiError("The AI investigator runs on the backend and is not available in Demo Mode.", "demo", 501);
  }
  return request(`/batches/${encodeURIComponent(batchId)}/investigation`, investigationSchema);
}

export async function startWorkflow(batchId: string): Promise<string> {
  const r = await request(`/batches/${encodeURIComponent(batchId)}/workflow`, workflowStartSchema, { method: "POST" });
  return r.execution_arn;
}

export async function fetchWorkflowStatus(executionArn: string): Promise<{ status: string; stopped: string | null }> {
  const r = await request(`/workflow/status?execution_arn=${encodeURIComponent(executionArn)}`, workflowStatusSchema);
  return { status: r.status, stopped: r.stopped ?? null };
}

export async function verifyBatch(id: string): Promise<Batch> {
  if (getExecutionMode() === "demo") return demoCall(() => demoVerify(id));
  await request(`/batches/${encodeURIComponent(id)}/verify`, z.object({ batch_id: z.string() }).passthrough(), { method: "POST" });
  return fetchBatch(id);
}

export async function issuePassport(id: string): Promise<{ batch: Batch; passport: CircularityPassport }> {
  if (getExecutionMode() === "demo") {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return demoCall(() => demoIssuePassport(id, origin));
  }
  const passport = await request(`/batches/${encodeURIComponent(id)}/passport`, passportSchema, { method: "POST" });
  return { batch: await fetchBatch(id), passport };
}

export async function recordDecision(id: string, decision: VerificationStatus, reason: string): Promise<Batch> {
  const auditor = getOperatorLabel();
  if (getExecutionMode() === "demo") return demoCall(() => demoRecordDecision(id, decision, reason, auditor));
  return request(`/batches/${encodeURIComponent(id)}/decision`, batchSchema, jsonBody({ decision, reason, auditor_id: auditor }));
}

export async function correctField(
  batchId: string,
  docId: string,
  fieldId: string,
  value: string | number,
  reason: string
): Promise<Batch> {
  const auditor = getOperatorLabel();
  if (getExecutionMode() === "demo") return demoCall(() => demoCorrectField(docId, fieldId, value, reason, auditor).batch);
  await request(
    `/documents/${encodeURIComponent(docId)}/fields`,
    documentSchema,
    { method: "PATCH", body: JSON.stringify({ field_id: fieldId, corrected_value: value, reason, auditor_id: auditor }) }
  );
  return fetchBatch(batchId);
}

export async function revokePassport(passportId: string, reason: string): Promise<{ batch: Batch; passport: CircularityPassport }> {
  if (getExecutionMode() === "demo") return demoCall(() => demoRevokePassport(passportId, reason));
  await request(`/passports/${encodeURIComponent(passportId)}/revoke`, revokeResponseSchema, jsonBody({ reason }));
  return fetchPassportRecord(passportId);
}

// ---------------------------------------------------------------- admin
export interface BackendHealth {
  reachable: boolean;
  detail: string;
}

export async function checkBackendHealth(): Promise<BackendHealth> {
  try {
    await request("/health", z.object({ status: z.string() }).passthrough());
    return { reachable: true, detail: `Responded at ${API_BASE_URL}` };
  } catch (err) {
    return { reachable: false, detail: errorMessage(err) };
  }
}

/** Resets the dataset of the CURRENT mode only. In Live Mode this resets the server database. */
export async function resetDataset(): Promise<void> {
  if (getExecutionMode() === "demo") {
    resetStore();
    return;
  }
  await request("/reset", z.object({ status: z.string() }).passthrough(), { method: "POST" });
}
