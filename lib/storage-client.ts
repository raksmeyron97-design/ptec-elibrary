import "server-only";

/**
 * Typed, server-only client for the separate `storage` project's /api/v1
 * file-manager API. This is the ONLY place that talks HTTP to the storage
 * service for the /admin/storage module — app/actions/storage.ts calls these
 * functions rather than scattering raw fetch() calls through components.
 *
 * STORAGE_API_URL / STORAGE_SERVICE_TOKEN are server-only env vars (never
 * NEXT_PUBLIC_*) — see .env.example. The token is a scoped API key issued by
 * the storage service's own key management (storage:list/write/trash/purge
 * scopes), never the storage service's master key.
 */

import type {
  StorageActionResult,
  StorageErrorCode,
  StorageFile,
  StorageListItem,
  StoragePagination,
  StorageSummary,
  StorageUploadResult,
} from "@/lib/types/storage";

const REQUEST_TIMEOUT_MS = 15_000;
const UPLOAD_TIMEOUT_MS = 120_000;

function config() {
  const baseUrl = process.env.STORAGE_API_URL;
  const token = process.env.STORAGE_SERVICE_TOKEN;
  if (!baseUrl || !token) {
    throw new Error(
      "Storage service is not configured (STORAGE_API_URL / STORAGE_SERVICE_TOKEN missing).",
    );
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), token };
}

export interface ActorContext {
  actorId?: string | null;
  actorRole?: string | null;
  requestId?: string | null;
}

interface RequestOptions {
  method?: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  formData?: FormData;
  idempotencyKey?: string;
  timeoutMs?: number;
}

interface RawResult {
  ok: boolean;
  data?: unknown;
  meta?: Record<string, unknown>;
  error?: { code: StorageErrorCode; message: string };
}

function buildUrl(baseUrl: string, path: string, query?: RequestOptions["query"]) {
  const url = new URL(`${baseUrl}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    }
  }
  return url;
}

/** Single low-level entry point: builds the request, attaches actor/
 *  idempotency headers, applies a timeout, and normalizes every failure mode
 *  (network error, timeout, non-JSON response, 401/403, envelope error) into
 *  one stable shape. Every exported function below is a thin, typed wrapper
 *  around this — never call fetch() directly elsewhere in the app. */
async function callRaw(path: string, actor: ActorContext, options: RequestOptions = {}): Promise<RawResult> {
  let baseUrl: string, token: string;
  try {
    ({ baseUrl, token } = config());
  } catch {
    return { ok: false, error: { code: "STORAGE_UNAVAILABLE", message: "Storage service is not configured." } };
  }

  const url = buildUrl(baseUrl, path, options.query);
  const headers: Record<string, string> = { "x-api-key": token };
  if (actor.actorId) headers["x-actor-id"] = actor.actorId;
  if (actor.actorRole) headers["x-actor-role"] = actor.actorRole;
  if (actor.requestId) headers["x-request-id"] = actor.requestId;
  if (options.idempotencyKey) headers["x-idempotency-key"] = options.idempotencyKey;

  let body: BodyInit | undefined;
  if (options.formData) {
    body = options.formData; // fetch sets multipart Content-Type + boundary itself
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body,
      signal: AbortSignal.timeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") {
      return { ok: false, error: { code: "TIMEOUT", message: "Storage service did not respond in time." } };
    }
    return { ok: false, error: { code: "NETWORK_ERROR", message: "Could not reach the storage service." } };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    // Non-JSON response (proxy error page, etc.) — never leak the raw body.
    return {
      ok: false,
      error: { code: res.status === 503 ? "STORAGE_UNAVAILABLE" : "INTERNAL_ERROR", message: "Storage service returned an unexpected response." },
    };
  }

  const envelope = json as { success?: boolean; data?: unknown; meta?: Record<string, unknown>; error?: { code?: string; message?: string } };
  if (res.status === 401) return { ok: false, error: { code: "UNAUTHORIZED", message: "Storage service rejected the request credentials." } };
  if (res.status === 403) return { ok: false, error: { code: "FORBIDDEN", message: envelope?.error?.message ?? "Not permitted." } };
  if (!envelope?.success) {
    return {
      ok: false,
      error: { code: (envelope?.error?.code as StorageErrorCode) ?? "INTERNAL_ERROR", message: envelope?.error?.message ?? "The storage service reported an error." },
    };
  }
  return { ok: true, data: envelope.data, meta: envelope.meta };
}

/** Typed wrapper for endpoints whose `data` is the whole payload. */
async function call<T>(path: string, actor: ActorContext, options?: RequestOptions): Promise<StorageActionResult<T>> {
  const raw = await callRaw(path, actor, options);
  if (!raw.ok) return { ok: false, error: raw.error! };
  return { ok: true, data: raw.data as T };
}

/** Typed wrapper for list-shaped endpoints that also carry `meta.pagination`. */
async function callPaged<T>(
  path: string,
  actor: ActorContext,
  options?: RequestOptions,
): Promise<StorageActionResult<{ items: T; pagination: StoragePagination }>> {
  const raw = await callRaw(path, actor, options);
  if (!raw.ok) return { ok: false, error: raw.error! };
  return {
    ok: true,
    data: { items: raw.data as T, pagination: (raw.meta?.pagination as StoragePagination) ?? { cursor: 0, limit: 0, total: 0, nextCursor: null } },
  };
}

export async function checkStorageHealth(actor: ActorContext) {
  return call<{ status: string; filesystemWritable: boolean }>("/health", actor);
}

export async function getStorageSummary(actor: ActorContext) {
  return call<StorageSummary>("/summary", actor);
}

export async function listStorageFiles(
  actor: ActorContext,
  params: { folder: string; cursor?: number; limit?: number; sortBy?: "name" | "size" | "modified"; order?: "asc" | "desc" },
) {
  return callPaged<StorageListItem[]>("/files", actor, {
    query: { folder: params.folder, cursor: params.cursor, limit: params.limit, sortBy: params.sortBy, order: params.order },
  });
}

export async function searchStorageFiles(
  actor: ActorContext,
  params: { q?: string; folder?: string; extension?: string; uploadedBy?: string; status?: "active" | "trashed"; cursor?: number; limit?: number },
) {
  return callPaged<StorageFile[]>("/search", actor, { query: params });
}

export async function getStorageFileMetadata(actor: ActorContext, storageKey: string) {
  return call<StorageFile>("/files/metadata", actor, { query: { key: storageKey } });
}

export async function createStorageFolder(actor: ActorContext, params: { folder: string; name: string }, idempotencyKey?: string) {
  return call<{ folder: string }>("/folders", actor, { method: "POST", body: params, idempotencyKey });
}

export async function uploadStorageFiles(actor: ActorContext, folder: string, files: File[]) {
  const formData = new FormData();
  formData.set("folder", folder);
  for (const file of files) formData.append("files", file, file.name);
  return call<StorageUploadResult[]>("/files", actor, { method: "POST", formData, timeoutMs: UPLOAD_TIMEOUT_MS });
}

export async function renameStorageFile(actor: ActorContext, storageKey: string, name: string, idempotencyKey?: string) {
  return call<StorageFile>("/files", actor, { method: "PATCH", body: { storageKey, name }, idempotencyKey });
}

export async function moveStorageFile(actor: ActorContext, storageKey: string, destinationFolder: string, idempotencyKey?: string) {
  return call<StorageFile>("/files/move", actor, { method: "POST", body: { storageKey, destinationFolder }, idempotencyKey });
}

export async function copyStorageFile(actor: ActorContext, storageKey: string, destinationFolder: string, idempotencyKey?: string) {
  return call<StorageFile>("/files/copy", actor, { method: "POST", body: { storageKey, destinationFolder }, idempotencyKey });
}

export async function getStorageSignedUrl(actor: ActorContext, storageKey: string, ttlSeconds?: number) {
  return call<{ url: string; expiresAt: string }>("/files/signed-url", actor, { method: "POST", body: { storageKey, ttlSeconds } });
}

export async function trashStorageFile(actor: ActorContext, storageKey: string, idempotencyKey?: string) {
  return call<StorageFile>("/files/trash", actor, { method: "POST", body: { storageKey }, idempotencyKey });
}

export async function listStorageTrash(actor: ActorContext, params: { cursor?: number; limit?: number }) {
  return callPaged<StorageFile[]>("/trash", actor, { query: params });
}

export async function restoreStorageFile(actor: ActorContext, id: string, idempotencyKey?: string) {
  return call<StorageFile>(`/trash/${encodeURIComponent(id)}/restore`, actor, { method: "POST", idempotencyKey });
}

export async function permanentlyDeleteStorageFile(actor: ActorContext, id: string, idempotencyKey?: string) {
  return call<{ id: string; status: string }>(`/trash/${encodeURIComponent(id)}`, actor, {
    method: "DELETE",
    body: { confirm: true },
    idempotencyKey,
  });
}

/**
 * Raw (non-JSON) streaming fetch for the download/preview proxy route —
 * returns the upstream Response directly so the caller can pipe its body
 * straight through without buffering the whole file in memory. Timeouts and
 * network errors still throw; the route handler is responsible for catching
 * and mapping those to a safe HTTP response (never leak the raw error).
 */
export async function streamStorageFile(
  actor: ActorContext,
  storageKey: string,
  mode: "download" | "preview",
): Promise<Response> {
  const { baseUrl, token } = config();
  const path = mode === "preview" ? "/files/preview" : "/files/download";
  const url = buildUrl(baseUrl, path, { key: storageKey });
  const headers: Record<string, string> = { "x-api-key": token };
  if (actor.actorId) headers["x-actor-id"] = actor.actorId;
  if (actor.actorRole) headers["x-actor-role"] = actor.actorRole;
  if (actor.requestId) headers["x-request-id"] = actor.requestId;
  return fetch(url, { headers, signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS), cache: "no-store" });
}
