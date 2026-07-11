"use server";

// Server Actions for the publication authoring workspace: revision-guarded
// atomic saves, per-administrator recovery drafts, DOI metadata lookup, and
// the validated publish gate. Everything here is additive on top of
// app/actions/publications.ts and degrades gracefully until migration
// 0085_publication_authoring_workspace.sql is applied.

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requirePermission } from "@/lib/auth/requireAdmin";
import { logAdminAction } from "@/app/actions/audit";
import { createAdminNotification } from "@/lib/admin-notifications";
import { indexPdfPagesSafe } from "@/lib/pdf-page-index";
import { rateLimit } from "@/lib/rate-limit";
import { queuePublicationEmbedding } from "@/lib/publications/admin-side-effects";
import {
  upgradeLegacyCitationTokens,
  validatePublicationCitations,
} from "@/lib/publications/citations";
import {
  formatReadableReference,
  mapCrossrefLikeMetadata,
  normalizeReferenceDoi,
  type StructuredReferenceMetadata,
} from "@/lib/publications/reference-metadata";
import { buildPublicationReview, type PublicationReviewResult } from "@/lib/publications/review";
import { PUBLICATION_DETAIL_SELECT } from "@/lib/publications";
import {
  createPublication,
  updatePublication,
  togglePublicationPublishStatus,
  type AuthorshipInput,
  type PublicationData,
  type PublicationFileInput,
} from "@/app/actions/publications";

const REVALIDATE_PATHS = ["/admin/publications", "/publications"];
const MAX_DRAFT_PAYLOAD_CHARS = 800_000;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Forbidden";
}

function revalidateAll() {
  REVALIDATE_PATHS.forEach((p) => revalidatePath(p));
}

type DbErrorLike = { code?: string | null; message?: string | null } | null | undefined;

/**
 * True when the database object this feature needs does not exist yet —
 * i.e. migration 0085 has not been applied. Callers fall back to the legacy
 * behavior instead of failing the administrator's work.
 */
function isMissingDbObject(error: DbErrorLike): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  if (["42P01", "42883", "42703", "PGRST202", "PGRST204", "PGRST205"].includes(code)) return true;
  const message = (error.message ?? "").toLowerCase();
  return message.includes("schema cache") || message.includes("does not exist");
}

// ── Atomic save ───────────────────────────────────────────────────────────────

export interface WorkspaceSaveInput {
  /** Null/undefined creates a new publication. */
  publicationId?: string | null;
  /**
   * content_revision the editor loaded. Required for updates once migration
   * 0085 is live; null means "no guard available" (pre-migration row).
   */
  expectedRevision?: number | null;
  data: PublicationData;
  authorships: AuthorshipInput[];
  files: PublicationFileInput[];
}

export type WorkspaceSaveResult =
  | { success: true; id: string; revision: number | null }
  | { success: false; error: string; conflict?: boolean };

/** Whitelisted editable columns sent to save_publication_atomic. */
function buildRpcPayload(data: PublicationData, references: unknown): Record<string, unknown> {
  return {
    slug: data.slug,
    title: data.title,
    title_km: data.title_km ?? null,
    article_type: data.article_type ?? "article",
    journal_name: data.journal_name ?? null,
    volume: data.volume ?? null,
    issue_no: data.issue_no ?? null,
    page_start: data.page_start ?? null,
    page_end: data.page_end ?? null,
    article_no: data.article_no ?? null,
    doi: data.doi ?? null,
    publication_date: data.publication_date ?? null,
    abstract: data.abstract ?? null,
    abstract_km: data.abstract_km ?? null,
    keywords: (data.keywords ?? []).slice(0, 20),
    publisher: data.publisher ?? null,
    isbn: data.isbn ?? null,
    subjects: (data.subjects ?? []).slice(0, 12),
    table_of_contents: (data.table_of_contents ?? []).slice(0, 100),
    learning_outcomes: (data.learning_outcomes ?? []).slice(0, 20),
    faqs: (data.faqs ?? []).slice(0, 20),
    license: data.license ?? null,
    copyright: data.copyright ?? null,
    language: data.language ?? "en",
    cover_url: data.cover_url ?? null,
    pdf_url: data.pdf_url ?? null,
    references,
  };
}

/**
 * Save the publication row, authorships, and supporting files in ONE
 * transaction with optimistic concurrency (RPC save_publication_atomic).
 * Publication status is server-owned and never changed by this action.
 * Falls back to the legacy non-transactional save until 0085 is applied.
 */
export async function savePublicationWorkspace(
  input: WorkspaceSaveInput,
): Promise<WorkspaceSaveResult> {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("publications", "write");
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
  const { supabase, userId } = admin;

  const data = input.data;
  if (!data?.title?.trim()) return { success: false, error: "Title is required" };
  if (!data?.slug?.trim()) return { success: false, error: "Slug is required" };
  if (data.publication_date) {
    const year = new Date(String(data.publication_date)).getFullYear();
    const current = new Date().getFullYear();
    if (Number.isNaN(year) || year < 1900 || year > current + 1) {
      return { success: false, error: `Publication year must be between 1900 and ${current + 1}` };
    }
  }

  // Same validation contract as the legacy actions: dangling or malformed
  // citation tokens and bad reference rows never reach the database.
  const citationValidation = validatePublicationCitations(data.references ?? [], [
    { id: "abstract-en", text: data.abstract },
    { id: "abstract-km", text: data.abstract_km },
  ]);
  if (citationValidation.errors.length > 0) {
    return {
      success: false,
      error: citationValidation.errors.slice(0, 3).map((issue) => issue.message).join(" "),
    };
  }
  const references = citationValidation.references;
  const abstract =
    typeof data.abstract === "string"
      ? upgradeLegacyCitationTokens(data.abstract, references)
      : data.abstract;
  const abstractKm =
    typeof data.abstract_km === "string"
      ? upgradeLegacyCitationTokens(data.abstract_km, references)
      : data.abstract_km;
  const prepared: PublicationData = { ...data, abstract, abstract_km: abstractKm, references };
  delete prepared.is_published;

  const isUpdate = !!input.publicationId;
  const authorships = (input.authorships ?? []).slice(0, 100);
  const files = (input.files ?? []).slice(0, 100);

  // Pre-migration rows carry no revision; the RPC would (correctly) refuse
  // an update without one, so use the legacy path for those saves.
  const useRpc = !isUpdate || (input.expectedRevision ?? 0) >= 1;

  if (useRpc) {
    let previousPdfUrl: string | null = null;
    if (isUpdate) {
      const { data: before } = await supabase
        .from("publications")
        .select("pdf_url")
        .eq("id", input.publicationId as string)
        .maybeSingle();
      previousPdfUrl = (before?.pdf_url as string | null) ?? null;
    }

    const { data: result, error } = await supabase.rpc("save_publication_atomic", {
      p_publication: buildRpcPayload(prepared, references),
      p_authorships: authorships,
      p_files: files.map((f, i) => ({ ...f, sort_order: f.sort_order ?? i })),
      p_publication_id: input.publicationId ?? null,
      p_expected_revision: isUpdate ? input.expectedRevision : 0,
      p_actor_id: userId,
    });

    if (!error) {
      const row = result as { id: string; revision: number };
      await queuePublicationEmbedding(row.id);
      if (prepared.pdf_url && prepared.pdf_url !== previousPdfUrl) {
        const pdfUrl = prepared.pdf_url;
        after(() => indexPdfPagesSafe("publication", row.id, pdfUrl));
      }
      await logAdminAction(
        userId,
        isUpdate ? "publication.update" : "publication.create",
        "publications",
        row.id,
        { title: prepared.title, revision: row.revision },
      );
      if (!isUpdate) {
        await createAdminNotification(
          "new_publication",
          `New publication: "${prepared.title}"`,
          undefined,
          "/admin/publications",
        );
      }
      revalidateAll();
      return { success: true, id: row.id, revision: row.revision };
    }

    if (error.code === "40001" || error.message?.includes("publication_revision_conflict")) {
      return {
        success: false,
        conflict: true,
        error:
          "Someone saved a newer version of this publication while you were editing. " +
          "Reload the page to continue from the latest version — your text can be copied out first.",
      };
    }
    if (error.code === "23505") {
      return { success: false, error: "A publication with this slug already exists." };
    }
    if (!isMissingDbObject(error)) {
      return { success: false, error: error.message };
    }
    // Migration 0085 not applied yet — fall through to the legacy save.
  }

  if (isUpdate) {
    const legacy = await updatePublication(input.publicationId as string, prepared, authorships, files);
    if (!legacy.success) return { success: false, error: legacy.error };
    return { success: true, id: input.publicationId as string, revision: null };
  }
  const legacy = await createPublication(prepared, authorships, files);
  if (!legacy.success) return { success: false, error: legacy.error };
  return { success: true, id: legacy.id, revision: null };
}

// ── Recovery drafts (autosave) ────────────────────────────────────────────────

export interface DraftTarget {
  /** Existing publication being edited… */
  publicationId?: string | null;
  /** …or a per-tab key for a publication that does not exist yet. */
  draftKey?: string | null;
}

export type DraftSaveResult =
  | { status: "saved"; updatedAt: string }
  | { status: "stale" }
  | { status: "unavailable" }
  | { status: "error"; error: string };

function validDraftTarget(target: DraftTarget): { column: "publication_id" | "draft_key"; value: string } | null {
  const publicationId = target.publicationId?.trim();
  const draftKey = target.draftKey?.trim();
  if (publicationId && !draftKey) return { column: "publication_id", value: publicationId };
  if (draftKey && !publicationId && draftKey.length >= 8 && draftKey.length <= 128) {
    return { column: "draft_key", value: draftKey };
  }
  return null;
}

/**
 * Persist a private recovery snapshot. Snapshots never touch the publication
 * row itself. `clientSequence` must increase monotonically per editing
 * session so a slow request cannot overwrite a newer snapshot.
 */
export async function savePublicationDraft(
  target: DraftTarget,
  payload: Record<string, unknown>,
  baseRevision: number,
  clientSequence: number,
): Promise<DraftSaveResult> {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("publications", "write");
  } catch (error) {
    return { status: "error", error: errorMessage(error) };
  }
  const { supabase, userId } = admin;

  const where = validDraftTarget(target);
  if (!where) return { status: "error", error: "Invalid draft target" };
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { status: "error", error: "Draft payload must be an object" };
  }
  if (JSON.stringify(payload).length > MAX_DRAFT_PAYLOAD_CHARS) {
    return { status: "error", error: "Draft is too large to autosave" };
  }
  const sequence = Number.isFinite(clientSequence) ? Math.max(0, Math.trunc(clientSequence)) : 0;
  const revision = Number.isFinite(baseRevision) ? Math.max(0, Math.trunc(baseRevision)) : 0;

  const { data: updated, error: updateError } = await supabase
    .from("publication_drafts")
    .update({ payload, base_revision: revision, client_sequence: sequence })
    .eq("user_id", userId)
    .eq(where.column, where.value)
    .lt("client_sequence", sequence)
    .select("updated_at");

  if (updateError) {
    if (isMissingDbObject(updateError)) return { status: "unavailable" };
    return { status: "error", error: updateError.message };
  }
  if (updated && updated.length > 0) {
    return { status: "saved", updatedAt: updated[0].updated_at as string };
  }

  // No row matched: either no draft exists yet, or a newer snapshot is
  // already stored (late response) — insert decides which.
  const { data: inserted, error: insertError } = await supabase
    .from("publication_drafts")
    .insert({
      user_id: userId,
      [where.column]: where.value,
      payload,
      base_revision: revision,
      client_sequence: sequence,
    })
    .select("updated_at")
    .maybeSingle();

  if (!insertError && inserted) {
    return { status: "saved", updatedAt: inserted.updated_at as string };
  }
  if (insertError?.code === "23505") return { status: "stale" };
  if (isMissingDbObject(insertError)) return { status: "unavailable" };
  return { status: "error", error: insertError?.message ?? "Draft save failed" };
}

export type DraftLoadResult =
  | { status: "found"; payload: Record<string, unknown>; baseRevision: number; updatedAt: string }
  | { status: "none" }
  | { status: "unavailable" }
  | { status: "error"; error: string };

export async function loadPublicationDraft(target: DraftTarget): Promise<DraftLoadResult> {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("publications", "write");
  } catch (error) {
    return { status: "error", error: errorMessage(error) };
  }
  const { supabase, userId } = admin;

  const where = validDraftTarget(target);
  if (!where) return { status: "error", error: "Invalid draft target" };

  const { data, error } = await supabase
    .from("publication_drafts")
    .select("payload, base_revision, updated_at")
    .eq("user_id", userId)
    .eq(where.column, where.value)
    .maybeSingle();

  if (error) {
    if (isMissingDbObject(error)) return { status: "unavailable" };
    return { status: "error", error: error.message };
  }
  if (!data) return { status: "none" };
  return {
    status: "found",
    payload: (data.payload ?? {}) as Record<string, unknown>,
    baseRevision: Number(data.base_revision ?? 0),
    updatedAt: data.updated_at as string,
  };
}

export async function discardPublicationDraft(target: DraftTarget): Promise<{ success: boolean }> {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("publications", "write");
  } catch {
    return { success: false };
  }
  const { supabase, userId } = admin;

  const where = validDraftTarget(target);
  if (!where) return { success: false };

  const { error } = await supabase
    .from("publication_drafts")
    .delete()
    .eq("user_id", userId)
    .eq(where.column, where.value);
  return { success: !error || isMissingDbObject(error) };
}

// ── DOI metadata lookup ───────────────────────────────────────────────────────

export type DoiLookupResult =
  | { status: "ok"; doi: string; metadata: StructuredReferenceMetadata; formatted: string }
  | { status: "invalid" }
  | { status: "not_found"; doi: string }
  | { status: "rate_limited" }
  | { status: "unavailable" };

/**
 * Resolve a DOI to structured metadata via the public Crossref API. Runs
 * server-side only (admin-gated + rate-limited); no API key is involved and
 * none is exposed. The administrator confirms/edits the result before it is
 * ever stored.
 */
export async function lookupDoiMetadata(rawDoi: string): Promise<DoiLookupResult> {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("publications", "write");
  } catch {
    return { status: "unavailable" };
  }

  const doi = normalizeReferenceDoi(rawDoi);
  if (!doi) return { status: "invalid" };

  const [perUser, global] = await Promise.all([
    rateLimit(`doi-lookup:${admin.userId}`, 10, 60_000),
    rateLimit("doi-lookup:global", 40, 60_000),
  ]);
  if (!perUser.success || !global.success) return { status: "rate_limited" };

  try {
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://elibrary.ptec.edu.kh";
    const response = await fetch(
      `https://api.crossref.org/works/${encodeURIComponent(doi)}`,
      {
        headers: {
          Accept: "application/json",
          // Crossref "polite pool" etiquette: identify the caller.
          "User-Agent": `PTEC-eLibrary/1.0 (${site})`,
        },
        signal: AbortSignal.timeout(8_000),
        cache: "no-store",
      },
    );

    if (response.status === 404) return { status: "not_found", doi };
    if (response.status === 429) return { status: "rate_limited" };
    if (!response.ok) return { status: "unavailable" };

    const body = (await response.json()) as unknown;
    const metadata = mapCrossrefLikeMetadata(body);
    if (!metadata) return { status: "unavailable" };
    const withDoi: StructuredReferenceMetadata = { ...metadata, doi: metadata.doi ?? doi };
    return {
      status: "ok",
      doi: withDoi.doi ?? doi,
      metadata: withDoi,
      formatted: formatReadableReference(withDoi),
    };
  } catch {
    return { status: "unavailable" };
  }
}

// ── Validated publish ─────────────────────────────────────────────────────────

export type PublishValidatedResult =
  | { success: true; review: PublicationReviewResult }
  | { success: false; error: string; review?: PublicationReviewResult };

/**
 * Publish gate: re-reads canonical server data, runs the full publish
 * review, and only then delegates to the existing publish action. A crafted
 * client payload therefore cannot publish an invalid publication.
 */
export async function publishPublicationValidated(id: string): Promise<PublishValidatedResult> {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("publications", "write");
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }

  const { data: row, error } = await admin.supabase
    .from("publications")
    .select(PUBLICATION_DETAIL_SELECT)
    .eq("id", id)
    .single();
  if (error || !row) {
    return { success: false, error: error?.message ?? "Publication not found" };
  }

  const record = row as Record<string, unknown> & {
    publication_authorships?: unknown[];
  };
  const review = buildPublicationReview({
    title: record.title as string | null,
    title_km: record.title_km as string | null,
    slug: record.slug as string | null,
    journal_name: record.journal_name as string | null,
    volume: record.volume as string | null,
    issue_no: record.issue_no as string | null,
    page_start: record.page_start as string | null,
    page_end: record.page_end as string | null,
    article_no: record.article_no as string | null,
    doi: record.doi as string | null,
    publication_date: record.publication_date as string | null,
    abstract: record.abstract as string | null,
    abstract_km: record.abstract_km as string | null,
    keywords: (record.keywords as string[] | null) ?? [],
    subjects: (record.subjects as string[] | null) ?? [],
    license: record.license as string | null,
    cover_url: record.cover_url as string | null,
    hasPdf: !!record.pdf_url,
    authorshipCount: Array.isArray(record.publication_authorships)
      ? record.publication_authorships.length
      : 0,
    references: record.references,
  });

  if (!review.publishable) {
    return {
      success: false,
      error: "This publication has blocking problems and cannot be published yet.",
      review,
    };
  }

  const result = await togglePublicationPublishStatus(id, true);
  if (!result.success) return { success: false, error: result.error, review };
  return { success: true, review };
}
