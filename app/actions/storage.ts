"use server";

import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { requirePermission, isAdminAuthError, type AdminAuthError } from "@/lib/auth/requireAdmin";
import { rateLimit } from "@/lib/rate-limit";
import { ratePolicy, type PolicyName } from "@/lib/rate-limit-policy";
import { logAdminAction } from "@/app/actions/audit";
import {
  checkStorageHealth,
  getStorageSummary,
  listStorageFiles,
  searchStorageFiles,
  getStorageFileMetadata,
  createStorageFolder,
  uploadStorageFiles,
  renameStorageFile,
  moveStorageFile,
  copyStorageFile,
  getStorageSignedUrl,
  trashStorageFile,
  listStorageTrash,
  restoreStorageFile,
  permanentlyDeleteStorageFile,
  type ActorContext,
} from "@/lib/storage-client";
import type {
  StorageActionResult,
  StorageFile,
  StorageListItem,
  StoragePagination,
  StorageSummary,
  StorageUploadResult,
} from "@/lib/types/storage";

/**
 * Server Actions for the /admin/storage module. Every action:
 *   1. Enforces the permission resource server-side (never trusts the UI
 *      having hidden a disabled button).
 *   2. Applies an app-side rate-limit policy (defense in depth — the storage
 *      service also rate-limits /api/v1 independently).
 *   3. Attaches the verified admin's identity + a correlation id as
 *      attribution headers (lib/storage-client.ts), never a client-supplied id.
 *   4. Records an admin_audit_log entry for the outcome, same convention as
 *      every other admin module (books/posts/theses/team/...).
 */

type Resource = "storage" | "storage_manage";
type Level = "read" | "write";

async function guard(resource: Resource, level: Level, policy: PolicyName) {
  const admin = await requirePermission(resource, level);
  const { limit, windowMs } = ratePolicy(policy);
  const rl = await rateLimit(admin.userId, limit, windowMs);
  if (!rl.success) {
    const err = new Error("Too many storage requests. Please slow down and try again shortly.");
    (err as Error & { rateLimited: true }).rateLimited = true;
    throw err;
  }
  const h = await headers();
  const actor: ActorContext = {
    actorId: admin.userId,
    actorRole: admin.role,
    requestId: h.get("x-request-id"),
  };
  return { admin, actor };
}

function errorResult<T>(error: unknown): StorageActionResult<T> {
  if (isAdminAuthError(error)) {
    const authErr = error as AdminAuthError;
    return {
      ok: false,
      error: { code: authErr.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", message: authErr.message },
    };
  }
  if (error instanceof Error && (error as Error & { rateLimited?: boolean }).rateLimited) {
    return { ok: false, error: { code: "RATE_LIMITED", message: error.message } };
  }
  console.error("[storage action] unexpected error:", error);
  return { ok: false, error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } };
}

async function audit(
  admin: { userId: string },
  action: string,
  targetId: string | undefined,
  result: { ok: boolean; error?: { code: string; message: string } },
  metadata: Record<string, unknown> = {},
) {
  await logAdminAction(admin.userId, `storage.${action}`, "storage_files", targetId, {
    ...metadata,
    result: result.ok ? "success" : "failed",
    ...(result.error ? { errorCode: result.error.code } : {}),
  });
}

// ---- reads ----

export async function getStorageSummaryAction(): Promise<StorageActionResult<StorageSummary>> {
  try {
    const { actor } = await guard("storage", "read", "storageBrowse");
    return await getStorageSummary(actor);
  } catch (e) {
    return errorResult(e);
  }
}

export async function checkStorageHealthAction(): Promise<StorageActionResult<{ status: string; filesystemWritable: boolean }>> {
  try {
    const { actor } = await guard("storage", "read", "storageBrowse");
    return await checkStorageHealth(actor);
  } catch (e) {
    return errorResult(e);
  }
}

export async function listStorageFilesAction(
  folder: string,
  opts: { cursor?: number; limit?: number; sortBy?: "name" | "size" | "modified"; order?: "asc" | "desc" } = {},
): Promise<StorageActionResult<{ items: StorageListItem[]; pagination: StoragePagination }>> {
  try {
    const { actor } = await guard("storage", "read", "storageBrowse");
    return await listStorageFiles(actor, { folder, ...opts });
  } catch (e) {
    return errorResult(e);
  }
}

export async function searchStorageFilesAction(params: {
  q?: string; folder?: string; extension?: string; uploadedBy?: string; status?: "active" | "trashed"; cursor?: number; limit?: number;
}): Promise<StorageActionResult<{ items: StorageFile[]; pagination: StoragePagination }>> {
  try {
    const { actor } = await guard("storage", "read", "storageBrowse");
    return await searchStorageFiles(actor, params);
  } catch (e) {
    return errorResult(e);
  }
}

export async function getStorageFileAction(storageKey: string): Promise<StorageActionResult<StorageFile>> {
  try {
    const { actor } = await guard("storage", "read", "storageBrowse");
    return await getStorageFileMetadata(actor, storageKey);
  } catch (e) {
    return errorResult(e);
  }
}

export async function getStorageSignedUrlAction(storageKey: string, ttlSeconds?: number): Promise<StorageActionResult<{ url: string; expiresAt: string }>> {
  try {
    const { actor } = await guard("storage", "read", "storageBrowse");
    return await getStorageSignedUrl(actor, storageKey, ttlSeconds);
  } catch (e) {
    return errorResult(e);
  }
}

export async function listStorageTrashAction(opts: { cursor?: number; limit?: number } = {}): Promise<StorageActionResult<{ items: StorageFile[]; pagination: StoragePagination }>> {
  try {
    const { actor } = await guard("storage", "read", "storageBrowse");
    return await listStorageTrash(actor, opts);
  } catch (e) {
    return errorResult(e);
  }
}

// ---- writes ----

export async function createStorageFolderAction(folder: string, name: string): Promise<StorageActionResult<{ folder: string }>> {
  try {
    const { admin, actor } = await guard("storage", "write", "storageMutate");
    const result = await createStorageFolder(actor, { folder, name });
    await audit(admin, "folder_created", undefined, result, { folder, name });
    return result;
  } catch (e) {
    return errorResult(e);
  }
}

export async function uploadStorageFilesAction(folder: string, files: File[]): Promise<StorageActionResult<StorageUploadResult[]>> {
  try {
    const { admin, actor } = await guard("storage", "write", "storageUpload");
    const result = await uploadStorageFiles(actor, folder, files);
    if (result.ok) {
      for (const item of result.data) {
        await audit(admin, item.success ? "upload" : "upload_rejected", item.file?.id ?? undefined, { ok: item.success, error: item.error }, {
          folder, originalName: item.originalName, size: item.file?.size, mimeType: item.file?.mimeType,
        });
      }
    } else {
      await audit(admin, "upload_rejected", undefined, result, { folder, fileCount: files.length });
    }
    return result;
  } catch (e) {
    return errorResult(e);
  }
}

export async function renameStorageFileAction(storageKey: string, name: string): Promise<StorageActionResult<StorageFile>> {
  try {
    const { admin, actor } = await guard("storage", "write", "storageMutate");
    const result = await renameStorageFile(actor, storageKey, name);
    await audit(admin, "renamed", result.ok ? result.data.id ?? undefined : undefined, result, { storageKey, newName: name });
    return result;
  } catch (e) {
    return errorResult(e);
  }
}

export async function moveStorageFileAction(storageKey: string, destinationFolder: string): Promise<StorageActionResult<StorageFile>> {
  try {
    const { admin, actor } = await guard("storage", "write", "storageMutate");
    const result = await moveStorageFile(actor, storageKey, destinationFolder);
    await audit(admin, "moved", result.ok ? result.data.id ?? undefined : undefined, result, { fromKey: storageKey, destinationFolder });
    return result;
  } catch (e) {
    return errorResult(e);
  }
}

export async function copyStorageFileAction(storageKey: string, destinationFolder: string): Promise<StorageActionResult<StorageFile>> {
  try {
    const { admin, actor } = await guard("storage", "write", "storageMutate");
    const result = await copyStorageFile(actor, storageKey, destinationFolder);
    await audit(admin, "copied", result.ok ? result.data.id ?? undefined : undefined, result, { fromKey: storageKey, destinationFolder });
    return result;
  } catch (e) {
    return errorResult(e);
  }
}

export async function trashStorageFileAction(storageKey: string): Promise<StorageActionResult<StorageFile>> {
  try {
    const { admin, actor } = await guard("storage", "write", "storageMutate");
    const result = await trashStorageFile(actor, storageKey);
    await audit(admin, "trashed", result.ok ? result.data.id ?? undefined : undefined, result, { storageKey });
    return result;
  } catch (e) {
    return errorResult(e);
  }
}

export async function restoreStorageFileAction(id: string): Promise<StorageActionResult<StorageFile>> {
  try {
    const { admin, actor } = await guard("storage", "write", "storageMutate");
    const result = await restoreStorageFile(actor, id);
    await audit(admin, "restored", id, result);
    return result;
  } catch (e) {
    return errorResult(e);
  }
}

/** Permanent delete — the one storage action gated by the separate,
 *  higher-trust `storage_manage` resource (super_admin only by default). */
export async function permanentlyDeleteStorageFileAction(id: string): Promise<StorageActionResult<{ id: string; status: string }>> {
  try {
    const { admin, actor } = await guard("storage_manage", "write", "storagePurge");
    const result = await permanentlyDeleteStorageFile(actor, id);
    await audit(admin, "purged", id, result);
    return result;
  } catch (e) {
    return errorResult(e);
  }
}

// ---- usage resolution ----
// The storage service intentionally has no idea what a book/post/thesis is
// — that's this app's schema, not its. "Used by" can only be answered here,
// by pattern-matching the file's storageKey against the URL columns this app
// actually stores. Best-effort: a miss means "no reference found", not
// necessarily "definitely unused" (see docs in the final handoff).
export interface StorageUsageRef {
  table: string;
  id: string;
  title: string | null;
}

const USAGE_SOURCES: Array<{ table: string; column: string; titleColumn: string | null }> = [
  { table: "books", column: "cover_url", titleColumn: "title" },
  { table: "book_files", column: "file_url", titleColumn: null },
  { table: "posts", column: "cover_url", titleColumn: "title" },
  { table: "catalog_books", column: "cover_url", titleColumn: "title" },
  { table: "research_reports", column: "cover_url", titleColumn: "title" },
  { table: "research_reports", column: "file_url", titleColumn: "title" },
  { table: "publications", column: "cover_url", titleColumn: "title" },
  { table: "publication_files", column: "file_url", titleColumn: null },
  { table: "team_members", column: "photo_url", titleColumn: "name" },
  { table: "profiles", column: "avatar_url", titleColumn: "full_name" },
];

export async function resolveStorageFileUsageAction(storageKey: string): Promise<StorageActionResult<{ refs: StorageUsageRef[]; checkedAllSources: boolean }>> {
  try {
    await guard("storage", "read", "storageBrowse");
    const db = createServiceClient();
    let checkedAllSources = true;

    const results = await Promise.allSettled(
      USAGE_SOURCES.map(async ({ table, column, titleColumn }) => {
        const select = titleColumn ? `id, ${titleColumn}` : "id";
        const { data, error } = (await db.from(table).select(select).ilike(column, `%${storageKey}`).limit(10)) as unknown as {
          data: Record<string, unknown>[] | null;
          error: { message: string } | null;
        };
        if (error) throw error;
        return (data ?? []).map((row) => {
          const record = row;
          return {
            table,
            id: String(record.id),
            title: titleColumn ? ((record[titleColumn] as string | null) ?? null) : null,
          } satisfies StorageUsageRef;
        });
      }),
    );

    const refs: StorageUsageRef[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") refs.push(...r.value);
      else checkedAllSources = false; // a table/column that doesn't exist in this deployment — degrade, don't fail the whole lookup
    }
    return { ok: true, data: { refs, checkedAllSources } };
  } catch (e) {
    return errorResult(e);
  }
}
