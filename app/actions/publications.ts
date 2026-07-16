"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidateLocalizedPath as revalidatePath, revalidatePublication } from "@/lib/cache/revalidate";
import { after } from "next/server";
import { zimaDelete } from "@/lib/zima";
import { createAdminNotification } from "@/lib/admin-notifications";
import { requirePermission } from "@/lib/auth/requireAdmin";
import { logAdminAction } from "@/app/actions/audit";
import { indexPdfPagesSafe } from "@/lib/pdf-page-index";
import { logContentView } from "@/lib/analytics/events";
import {
  notifyPublicationSubscribers,
  queuePublicationEmbedding,
} from "@/lib/publications/admin-side-effects";
import {
  mapRowToPublication,
  PUBLICATION_DETAIL_SELECT,
  type Publication,
  type PublicationAuthor,
  type PublicationAffiliation,
  type PublicationReference,
  type PublicationTocEntry,
  type PublicationFaq,
} from "@/lib/publications";
import {
  upgradeLegacyCitationTokens,
  validatePublicationCitations,
} from "@/lib/publications/citations";

const REVALIDATE_PATHS = ["/admin/publications", "/publications"];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Forbidden";
}

/** Strip PostgREST filter metacharacters before building .or(...) strings. */
function sanitizeSearchTerm(input: string): string {
  return input
    .replace(/[%,()\\*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function revalidateAll(slug?: string | null) {
  // Central helper busts the publications + collection-stats tags, the
  // public listing/detail pages and the homepage; the loop keeps the
  // admin-side paths fresh.
  revalidatePublication(slug);
  REVALIDATE_PATHS.forEach((p) => revalidatePath(p));
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PublicationData {
  slug: string;
  title: string;
  title_km?: string | null;
  article_type?: string;
  journal_name?: string | null;
  volume?: string | null;
  issue_no?: string | null;
  page_start?: string | null;
  page_end?: string | null;
  article_no?: string | null;
  doi?: string | null;
  publication_date?: string | null;
  abstract?: string | null;
  abstract_km?: string | null;
  keywords?: string[];
  publisher?: string | null;
  isbn?: string | null;
  subjects?: string[];
  table_of_contents?: PublicationTocEntry[];
  learning_outcomes?: string[];
  faqs?: PublicationFaq[];
  license?: string | null;
  copyright?: string | null;
  language?: string;
  cover_url?: string | null;
  pdf_url?: string | null;
  references?: PublicationReference[];
  is_published?: boolean;
}

// Server actions accept arbitrary JSON at runtime — whitelist columns so
// extra keys (view_count, created_by, embedding, …) can never reach the
// insert/update, and reject implausible publication dates.
const PUBLICATION_FIELDS = [
  "slug", "title", "title_km", "article_type", "journal_name", "volume",
  "issue_no", "page_start", "page_end", "article_no", "doi",
  "publication_date", "abstract", "abstract_km", "keywords", "publisher",
  "isbn", "subjects", "table_of_contents", "learning_outcomes", "faqs",
  "license", "copyright", "language", "cover_url", "pdf_url", "references",
  "is_published",
] as const satisfies readonly (keyof PublicationData)[];

function pickAuthorship(a: AuthorshipInput) {
  return {
    author_id: a.author_id,
    author_order: a.author_order,
    is_corresponding: a.is_corresponding,
    affiliation_ids: a.affiliation_ids,
  };
}

function pickFile(f: PublicationFileInput, index: number) {
  return {
    label: f.label,
    file_url: f.file_url,
    file_type: f.file_type ?? null,
    size_bytes: f.size_bytes ?? null,
    sort_order: f.sort_order ?? index,
  };
}

function sanitizePublicationData(formData: PublicationData): { data?: Partial<PublicationData>; error?: string } {
  const data: Record<string, unknown> = {};
  for (const key of PUBLICATION_FIELDS) {
    if (key in formData) data[key] = formData[key];
  }
  if (data.publication_date) {
    const year = new Date(String(data.publication_date)).getFullYear();
    const current = new Date().getFullYear();
    if (Number.isNaN(year) || year < 1900 || year > current + 1) {
      return { error: `Publication year must be between 1900 and ${current + 1}` };
    }
  }

  if (data.abstract != null && typeof data.abstract !== "string") {
    return { error: "The English abstract must be text." };
  }
  if (data.abstract_km != null && typeof data.abstract_km !== "string") {
    return { error: "The Khmer abstract must be text." };
  }

  const citationValidation = validatePublicationCitations(data.references ?? [], [
    { id: "abstract-en", text: data.abstract as string | null | undefined },
    { id: "abstract-km", text: data.abstract_km as string | null | undefined },
  ]);
  if (citationValidation.errors.length > 0) {
    return {
      error: citationValidation.errors.slice(0, 3).map((issue) => issue.message).join(" "),
    };
  }
  data.references = citationValidation.references;
  if (typeof data.abstract === "string") {
    data.abstract = upgradeLegacyCitationTokens(data.abstract, citationValidation.references);
  }
  if (typeof data.abstract_km === "string") {
    data.abstract_km = upgradeLegacyCitationTokens(data.abstract_km, citationValidation.references);
  }
  return { data: data as Partial<PublicationData> };
}

export interface AuthorshipInput {
  author_id: string;
  author_order: number;
  is_corresponding: boolean;
  affiliation_ids: string[];
}

export interface PublicationFileInput {
  label: string;
  file_url: string;
  file_type?: string | null;
  size_bytes?: number | null;
  sort_order?: number;
}

// ── Public queries ─────────────────────────────────────────────────────────────

export async function getPublications({
  q,
  keyword,
  year,
  language,
  articleType,
  publishedOnly = true,
}: {
  q?: string;
  keyword?: string;
  year?: string;
  language?: string;
  articleType?: string;
  publishedOnly?: boolean;
}) {
  const supabase = await createClient();

  let query = supabase
    .from("publications_with_stats")
    .select("*")
    .order("publication_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (publishedOnly) query = query.eq("is_published", true);
  if (keyword) query = query.contains("keywords", [keyword]);
  if (language) query = query.eq("language", language);
  if (articleType) query = query.eq("article_type", articleType);
  if (year) {
    query = query
      .gte("publication_date", `${year}-01-01`)
      .lte("publication_date", `${year}-12-31`);
  }
  if (q) {
    const term = sanitizeSearchTerm(q);
    if (term) {
      query = query.or(
        `title.ilike.%${term}%,title_km.ilike.%${term}%,abstract.ilike.%${term}%,author_names.ilike.%${term}%`,
      );
    }
  }

  const { data, error } = await query;
  if (error) {
    console.error("Error fetching publications:", error);
    return { data: null, error: error.message };
  }
  return { data: (data ?? []).map(mapRowToPublication), error: null };
}

export async function getPublicationBySlug(slug: string): Promise<{
  data: Publication | null;
  error: string | null;
}> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("publications")
    .select(PUBLICATION_DETAIL_SELECT)
    .eq("slug", slug)
    .eq("is_published", true)
    .single();

  if (error || !data) {
    return { data: null, error: error?.message ?? "Not found" };
  }
  const pub = mapRowToPublication(data);
  // Never expose a personal author email on the PUBLIC detail page — it would
  // otherwise be serialized into client-component props even when not displayed.
  // Admin fetches (getPublicationForAdmin) keep the email for editing.
  if (pub.authorships) {
    pub.authorships = pub.authorships.map((a) => ({
      ...a,
      author: { ...a.author, email: null },
    }));
  }
  return { data: pub, error: null };
}

export async function incrementPublicationViewCount(id: string) {
  // The lifetime counter stays signed-in-only (spam-resistant public badge);
  // view_logs analytics record every human visitor — anonymous included,
  // bot-filtered and rate-limited inside logContentView.
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();

  let error: { message: string } | null = null;
  if (user) {
    const supabase = createServiceClient();
    ({ error } = await supabase.rpc("increment_publication_view_count", { row_id: id }));
  }

  await logContentView("publication", id);
  if (error) {
    console.error("Failed to increment publication view count:", error);
  }
}

// ── Admin queries ──────────────────────────────────────────────────────────────

/** Admin edit-page fetch: sees drafts. Guarded, service client. */
export async function getPublicationForAdmin(id: string): Promise<{
  data: Publication | null;
  error: string | null;
}> {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("publications", "read");
  } catch (error) {
    return { data: null, error: errorMessage(error) };
  }

  const { data, error } = await admin.supabase
    .from("publications")
    .select(PUBLICATION_DETAIL_SELECT)
    .eq("id", id)
    .single();

  if (error || !data) {
    return { data: null, error: error?.message ?? "Not found" };
  }
  return { data: mapRowToPublication(data), error: null };
}

// ── Publication mutations ──────────────────────────────────────────────────────

export async function createPublication(
  formData: PublicationData,
  authorships: AuthorshipInput[] = [],
  files: PublicationFileInput[] = [],
) {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("publications", "write");
  } catch (error) {
    return { success: false as const, error: errorMessage(error) };
  }
  const { supabase, userId } = admin;

  if (!formData.title?.trim()) return { success: false as const, error: "Title is required" };
  if (!formData.slug?.trim()) return { success: false as const, error: "Slug is required" };

  const sanitized = sanitizePublicationData(formData);
  if (sanitized.error || !sanitized.data) {
    return { success: false as const, error: sanitized.error ?? "Invalid publication data" };
  }

  const { data: created, error } = await supabase
    .from("publications")
    .insert([{
      ...sanitized.data,
      keywords: (formData.keywords ?? []).slice(0, 20),
      subjects: (formData.subjects ?? []).slice(0, 12),
      table_of_contents: (formData.table_of_contents ?? []).slice(0, 100),
      learning_outcomes: (formData.learning_outcomes ?? []).slice(0, 20),
      faqs: (formData.faqs ?? []).slice(0, 20),
      references: sanitized.data.references ?? [],
      created_by: userId,
    }])
    .select("id, title, slug")
    .single();

  if (error || !created) {
    if (error?.code === "23505") {
      return { success: false as const, error: "A publication with this slug already exists." };
    }
    return { success: false as const, error: error?.message ?? "Insert failed" };
  }

  if (authorships.length > 0) {
    const { error: authErr } = await supabase.from("publication_authorships").insert(
      authorships.map((a) => ({ ...pickAuthorship(a), publication_id: created.id })),
    );
    if (authErr) {
      return { success: false as const, error: `Saved article but failed to link authors: ${authErr.message}` };
    }
  }

  if (files.length > 0) {
    const { error: fileErr } = await supabase.from("publication_files").insert(
      files.map((f, i) => ({ ...pickFile(f, i), publication_id: created.id })),
    );
    if (fileErr) {
      return { success: false as const, error: `Saved article but failed to attach files: ${fileErr.message}` };
    }
  }

  await queuePublicationEmbedding(created.id);
  if (formData.pdf_url) {
    const pdfUrl = formData.pdf_url;
    after(() => indexPdfPagesSafe("publication", created.id, pdfUrl));
  }
  await logAdminAction(userId, "publication.create", "publications", created.id, { title: created.title });
  await createAdminNotification("new_publication", `New publication: "${created.title}"`, undefined, "/admin/publications");
  revalidateAll(created.slug as string);
  return { success: true as const, id: created.id as string };
}

export async function updatePublication(
  id: string,
  formData: PublicationData,
  authorships?: AuthorshipInput[],
  files?: PublicationFileInput[],
) {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("publications", "write");
  } catch (error) {
    return { success: false as const, error: errorMessage(error) };
  }
  const { supabase, userId } = admin;

  const sanitized = sanitizePublicationData(formData);
  if (sanitized.error || !sanitized.data) {
    return { success: false as const, error: sanitized.error ?? "Invalid publication data" };
  }

  const { data: before } = await supabase
    .from("publications")
    .select("pdf_url")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("publications")
    .update({
      ...sanitized.data,
      keywords: (formData.keywords ?? []).slice(0, 20),
      subjects: (formData.subjects ?? []).slice(0, 12),
      table_of_contents: (formData.table_of_contents ?? []).slice(0, 100),
      learning_outcomes: (formData.learning_outcomes ?? []).slice(0, 20),
      faqs: (formData.faqs ?? []).slice(0, 20),
      references: sanitized.data.references ?? [],
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { success: false as const, error: "A publication with this slug already exists." };
    }
    return { success: false as const, error: error.message };
  }

  // Replace-all semantics keep the form simple (rows are tiny link records).
  if (authorships) {
    await supabase.from("publication_authorships").delete().eq("publication_id", id);
    if (authorships.length > 0) {
      const { error: authErr } = await supabase.from("publication_authorships").insert(
        authorships.map((a) => ({ ...pickAuthorship(a), publication_id: id })),
      );
      if (authErr) {
        return { success: false as const, error: `Updated article but failed to link authors: ${authErr.message}` };
      }
    }
  }

  if (files) {
    await supabase.from("publication_files").delete().eq("publication_id", id);
    if (files.length > 0) {
      const { error: fileErr } = await supabase.from("publication_files").insert(
        files.map((f, i) => ({ ...pickFile(f, i), publication_id: id })),
      );
      if (fileErr) {
        return { success: false as const, error: `Updated article but failed to attach files: ${fileErr.message}` };
      }
    }
  }

  await queuePublicationEmbedding(id);
  if (formData.pdf_url && formData.pdf_url !== before?.pdf_url) {
    const pdfUrl = formData.pdf_url;
    after(() => indexPdfPagesSafe("publication", id, pdfUrl));
  }
  await logAdminAction(userId, "publication.update", "publications", id, { title: formData.title });
  revalidateAll(formData.slug);
  return { success: true as const };
}

export async function togglePublicationPublishStatus(id: string, isPublished: boolean) {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("publications", "write");
  } catch (error) {
    return { success: false as const, error: errorMessage(error) };
  }
  const { supabase, userId } = admin;

  const updatePayload: { is_published: boolean; published_at?: string } = { is_published: isPublished };

  let firstPublish = false;
  if (isPublished) {
    const { data } = await supabase.from("publications").select("published_at").eq("id", id).single();
    if (data && !data.published_at) {
      updatePayload.published_at = new Date().toISOString();
      firstPublish = true;
    }
  }

  const { error } = await supabase.from("publications").update(updatePayload).eq("id", id);
  if (error) {
    return { success: false as const, error: error.message };
  }

  await logAdminAction(
    userId,
    isPublished ? "publication.publish" : "publication.unpublish",
    "publications",
    id,
  );
  // Only the FIRST publish notifies subscribers — re-publishing after an
  // unpublish/fix cycle must not spam them (published_at is set once).
  if (firstPublish) {
    await notifyPublicationSubscribers(id);
  }
  revalidateAll();
  return { success: true as const };
}

export async function deletePublication(id: string) {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("publications", "write");
  } catch (error) {
    return { success: false as const, error: errorMessage(error) };
  }
  const { supabase, userId } = admin;

  // Fetch URLs before deleting so we can clean up storage afterwards
  const { data: row } = await supabase
    .from("publications")
    .select("title, pdf_url, cover_url, publication_files(file_url)")
    .eq("id", id)
    .single();

  await supabase.from("view_logs").delete().eq("content_type", "publication").eq("content_id", id);
  await supabase.from("book_pages").delete().eq("record_type", "publication").eq("record_id", id);
  await supabase.from("book_chunks").delete().eq("record_type", "publication").eq("record_id", id);

  const { error } = await supabase.from("publications").delete().eq("id", id);
  if (error) {
    return { success: false as const, error: error.message };
  }

  // Best-effort Zima cleanup (non-fatal — DB row is already gone)
  const extraFiles = Array.isArray(row?.publication_files) ? row.publication_files : [];
  const urls = [row?.pdf_url, row?.cover_url, ...extraFiles.map((f: { file_url: string }) => f.file_url)];
  for (const url of urls) {
    if (url) await zimaDelete(url as string).catch(() => null);
  }

  await logAdminAction(userId, "publication.delete", "publications", id, { title: row?.title });
  revalidateAll();
  return { success: true as const };
}

// ── Author / affiliation management ───────────────────────────────────────────

export async function searchPublicationAuthors(q: string): Promise<{
  data: PublicationAuthor[] | null;
  error: string | null;
}> {
  const supabase = await createClient();

  let query = supabase
    .from("publication_authors")
    .select("id, full_name, full_name_km, orcid, email, bio, bio_km, photo_url")
    .order("full_name", { ascending: true })
    .limit(20);

  const term = sanitizeSearchTerm(q ?? "");
  if (term) {
    query = query.or(`full_name.ilike.%${term}%,full_name_km.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as PublicationAuthor[], error: null };
}

export async function upsertPublicationAuthor(author: {
  id?: string;
  full_name: string;
  full_name_km?: string | null;
  orcid?: string | null;
  email?: string | null;
  bio?: string | null;
  bio_km?: string | null;
  photo_url?: string | null;
}): Promise<{ data: PublicationAuthor | null; error: string | null }> {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("publications", "write");
  } catch (error) {
    return { data: null, error: errorMessage(error) };
  }
  const { supabase, userId } = admin;

  const full_name = author.full_name?.trim();
  if (!full_name) return { data: null, error: "Author name is required" };

  const payload = {
    full_name,
    full_name_km: author.full_name_km?.trim() || null,
    orcid: author.orcid?.trim() || null,
    email: author.email?.trim() || null,
    bio: author.bio?.trim() || null,
    bio_km: author.bio_km?.trim() || null,
    photo_url: author.photo_url?.trim() || null,
  };

  const query = author.id
    ? supabase.from("publication_authors").update(payload).eq("id", author.id)
    : supabase.from("publication_authors").insert(payload);

  const { data, error } = await query
    .select("id, full_name, full_name_km, orcid, email, bio, bio_km, photo_url")
    .single();
  if (error) return { data: null, error: error.message };

  await logAdminAction(
    userId,
    author.id ? "publication_author.update" : "publication_author.create",
    "publication_authors",
    (data as PublicationAuthor).id,
    { full_name },
  );
  return { data: data as PublicationAuthor, error: null };
}

export async function deletePublicationAuthor(id: string): Promise<{ success: boolean; error?: string }> {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("publications", "write");
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
  const { supabase, userId } = admin;

  const { error } = await supabase.from("publication_authors").delete().eq("id", id);
  if (error) return { success: false, error: error.message };

  await logAdminAction(userId, "publication_author.delete", "publication_authors", id);
  return { success: true };
}

export async function getPublicationAffiliations(): Promise<{
  data: PublicationAffiliation[] | null;
  error: string | null;
}> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("publication_affiliations")
    .select("id, name, name_km, city, country")
    .order("name", { ascending: true });

  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as PublicationAffiliation[], error: null };
}

export async function upsertPublicationAffiliation(affiliation: {
  id?: string;
  name: string;
  name_km?: string | null;
  city?: string | null;
  country?: string | null;
}): Promise<{ data: PublicationAffiliation | null; error: string | null }> {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("publications", "write");
  } catch (error) {
    return { data: null, error: errorMessage(error) };
  }
  const { supabase, userId } = admin;

  const name = affiliation.name?.trim();
  if (!name) return { data: null, error: "Affiliation name is required" };

  const payload = {
    name,
    name_km: affiliation.name_km?.trim() || null,
    city: affiliation.city?.trim() || null,
    country: affiliation.country?.trim() || null,
  };

  const query = affiliation.id
    ? supabase.from("publication_affiliations").update(payload).eq("id", affiliation.id)
    : supabase.from("publication_affiliations").insert(payload);

  const { data, error } = await query.select("id, name, name_km, city, country").single();
  if (error) return { data: null, error: error.message };

  await logAdminAction(
    userId,
    affiliation.id ? "publication_affiliation.update" : "publication_affiliation.create",
    "publication_affiliations",
    (data as PublicationAffiliation).id,
    { name },
  );
  return { data: data as PublicationAffiliation, error: null };
}

export async function deletePublicationAffiliation(id: string): Promise<{ success: boolean; error?: string }> {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("publications", "write");
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
  const { supabase, userId } = admin;

  const { error } = await supabase.from("publication_affiliations").delete().eq("id", id);
  if (error) return { success: false, error: error.message };

  await logAdminAction(userId, "publication_affiliation.delete", "publication_affiliations", id);
  return { success: true };
}
