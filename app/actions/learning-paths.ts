"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireLibrarian } from "@/lib/auth/requireAdmin";
import { logAdminAction } from "@/app/actions/audit";
import { revalidateLocalizedPath as revalidatePath, revalidateLearningPath } from "@/lib/cache/revalidate";
import { slugify } from "@/lib/books";

// ── Types ─────────────────────────────────────────────────────────────────────

export type StepResourceType = "book" | "research" | "catalog" | "publication" | "external";

/** Lifecycle states (migration 0111). `is_published` mirrors `status === "published"`. */
export type LearningPathStatus = "draft" | "published" | "scheduled" | "archived";

export type PathDifficulty = "beginner" | "intermediate" | "advanced";
export type PathLanguage = "en" | "km" | "both";

/** A bilingual free-text entry — learning outcome or prerequisite. */
export interface BilingualEntry {
  en: string;
  km: string;
}

export interface LearningPathSummary {
  id: string;
  slug: string;
  title: string;
  title_km: string | null;
  description: string | null;
  description_km: string | null;
  audience: string | null;
  cover_url: string | null;
  is_published: boolean;
  status: LearningPathStatus;
  featured: boolean;
  difficulty: PathDifficulty | null;
  subject: string | null;
  language: PathLanguage | null;
  tags: string[];
  position: number;
  stepCount: number;
  moduleCount: number;
  /** Total est. duration in minutes: the manual `estimated_minutes` override, else the sum of step estimates, else null. */
  durationMinutes: number | null;
  updated_at: string | null;
}

export interface LearningPathStep {
  id: string;
  resource_type: StepResourceType;
  resource_id: string | null;
  resource_title: string | null;
  external_url: string | null;
  instruction: string | null;
  instruction_km: string | null;
  est_minutes: number | null;
  is_required: boolean;
  position: number;
  /** Resolved at read-time from the source table; null if the resource was since deleted. */
  url: string | null;
  coverUrl: string | null;
  /** True when the referenced resource no longer resolves (deleted/unpublished). */
  missing: boolean;
}

export interface LearningPathModule {
  id: string;
  title: string;
  title_km: string | null;
  description: string | null;
  description_km: string | null;
  position: number;
  steps: LearningPathStep[];
}

export interface LearningPathDetail extends LearningPathSummary {
  estimated_minutes: number | null;
  outcomes: BilingualEntry[];
  prerequisites: BilingualEntry[];
  seo_title: string | null;
  seo_description: string | null;
  og_image_url: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  archived_at: string | null;
  modules: LearningPathModule[];
}

/** Coerce a jsonb column into a clean BilingualEntry[] (defensive against legacy/hand-edited data). */
function toBilingualList(raw: unknown): BilingualEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e) => {
      if (typeof e === "string") return { en: e, km: "" };
      if (e && typeof e === "object") {
        const o = e as Record<string, unknown>;
        return { en: typeof o.en === "string" ? o.en : "", km: typeof o.km === "string" ? o.km : "" };
      }
      return { en: "", km: "" };
    })
    .filter((e) => e.en.trim() || e.km.trim());
}

/** Sum of step estimates across a path's modules, or null when none carry one. */
function sumStepMinutes(modules: { learning_path_steps?: { est_minutes?: number | null }[] | null }[]): number | null {
  let total = 0;
  let any = false;
  for (const m of modules) {
    for (const s of m.learning_path_steps ?? []) {
      const v = Number(s.est_minutes ?? 0);
      if (Number.isFinite(v) && v > 0) { total += v; any = true; }
    }
  }
  return any ? total : null;
}

function stepUrl(type: StepResourceType, resourceId: string | null, externalUrl: string | null): string | null {
  if (type === "external") return externalUrl;
  if (!resourceId) return null;
  if (type === "book") return `/books/${resourceId}`; // resolved to slug below
  if (type === "research") return `/theses/${resourceId}`; // resolved to slug below
  if (type === "catalog") return `/catalogs/${resourceId}`; // resolved to slug below
  if (type === "publication") return `/publications/${resourceId}`; // resolved to slug below
  return null;
}

/** Resolve resource_id → live title/slug/cover across the 4 internal source tables. */
async function resolveStepResources(
  db: ReturnType<typeof createServiceClient>,
  steps: { id: string; resource_type: StepResourceType; resource_id: string | null }[],
) {
  const idsByType: Record<string, string[]> = { book: [], research: [], catalog: [], publication: [] };
  for (const s of steps) {
    if (s.resource_type !== "external" && s.resource_id) idsByType[s.resource_type]?.push(s.resource_id);
  }

  type Row = { id: string; slug: string | null; title: string; cover_url: string | null };
  const empty = Promise.resolve({ data: [] as Row[] });
  const [books, research, catalog, publications] = await Promise.all([
    idsByType.book.length ? db.from("books").select("id, slug, title, cover_url").in("id", idsByType.book) : empty,
    idsByType.research.length ? db.from("research_reports").select("id, slug, title, cover_url").in("id", idsByType.research) : empty,
    idsByType.catalog.length ? db.from("catalog_books").select("id, slug, title, cover_url").in("id", idsByType.catalog) : empty,
    idsByType.publication.length ? db.from("publications").select("id, slug, title, cover_url").in("id", idsByType.publication) : empty,
  ]);

  const bookMap = new Map((books.data ?? []).map((b) => [b.id, b]));
  const researchMap = new Map((research.data ?? []).map((r) => [r.id, r]));
  const catalogMap = new Map((catalog.data ?? []).map((c) => [c.id, c]));
  const publicationMap = new Map((publications.data ?? []).map((p) => [p.id, p]));

  return { bookMap, researchMap, catalogMap, publicationMap };
}

// ── Public reads ───────────────────────────────────────────────────────────────

const SUMMARY_SELECT =
  "id, slug, title, title_km, description, description_km, audience, cover_url, is_published, status, featured, difficulty, subject, language, tags, estimated_minutes, position, updated_at, learning_path_modules(id, learning_path_steps(id, est_minutes))";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSummary(p: any): LearningPathSummary {
  const modules = (p.learning_path_modules ?? []) as { learning_path_steps?: { est_minutes?: number | null }[] | null }[];
  const stepCount = modules.reduce((sum, m) => sum + (m.learning_path_steps?.length ?? 0), 0);
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    title_km: p.title_km,
    description: p.description,
    description_km: p.description_km,
    audience: p.audience,
    cover_url: p.cover_url,
    is_published: p.is_published,
    status: (p.status ?? (p.is_published ? "published" : "draft")) as LearningPathStatus,
    featured: !!p.featured,
    difficulty: (p.difficulty ?? null) as PathDifficulty | null,
    subject: p.subject ?? null,
    language: (p.language ?? null) as PathLanguage | null,
    tags: Array.isArray(p.tags) ? p.tags : [],
    position: p.position,
    stepCount,
    moduleCount: modules.length,
    durationMinutes: p.estimated_minutes && p.estimated_minutes > 0 ? p.estimated_minutes : sumStepMinutes(modules),
    updated_at: p.updated_at ?? null,
  };
}

export async function getPublishedPaths(): Promise<LearningPathSummary[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("learning_paths")
    .select(SUMMARY_SELECT)
    .eq("status", "published")
    .order("position", { ascending: true });

  if (error) {
    console.error("[getPublishedPaths]", error.message);
    return [];
  }
  return (data ?? []).map(mapSummary);
}

/** The single manually-featured published path, or null. Used by the /paths hero. */
export async function getFeaturedPath(): Promise<LearningPathSummary | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("learning_paths")
    .select(SUMMARY_SELECT)
    .eq("status", "published")
    .eq("featured", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return mapSummary(data);
}

const DETAIL_SELECT =
  "id, slug, title, title_km, description, description_km, audience, cover_url, is_published, status, featured, difficulty, subject, language, tags, estimated_minutes, outcomes, prerequisites, seo_title, seo_description, og_image_url, scheduled_at, published_at, archived_at, position, updated_at";

const MODULE_STEP_SELECT =
  "id, title, title_km, description, description_km, position, learning_path_steps(id, resource_type, resource_id, resource_title, external_url, instruction, instruction_km, est_minutes, is_required, position)";

export async function getPathBySlug(slug: string): Promise<LearningPathDetail | null> {
  const db = createServiceClient();
  const { data: path, error } = await db
    .from("learning_paths")
    .select(DETAIL_SELECT)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (error || !path) return null;

  const { data: modules } = await db
    .from("learning_path_modules")
    .select(MODULE_STEP_SELECT)
    .eq("path_id", path.id)
    .order("position", { ascending: true });

  const allSteps = (modules ?? []).flatMap(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (m: any) => (m.learning_path_steps ?? []) as { id: string; resource_type: StepResourceType; resource_id: string | null }[],
  );
  const { bookMap, researchMap, catalogMap, publicationMap } = await resolveStepResources(db, allSteps);

  const resolvedModules: LearningPathModule[] = (modules ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((m: any) => ({
      id: m.id,
      title: m.title,
      title_km: m.title_km,
      description: m.description ?? null,
      description_km: m.description_km ?? null,
      position: m.position,
      steps: ((m.learning_path_steps ?? []) as LearningPathStep[])
        .sort((a, b) => a.position - b.position)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((s: any): LearningPathStep => {
          let url = stepUrl(s.resource_type, s.resource_id, s.external_url);
          let coverUrl: string | null = null;
          let liveTitle = s.resource_title;
          // A step is "missing" only when it points at an internal resource we
          // couldn't resolve (deleted/unpublished). External links are never missing.
          let missing = s.resource_type !== "external" && !!s.resource_id;

          if (s.resource_type === "book" && s.resource_id) {
            const b = bookMap.get(s.resource_id);
            if (b) { url = `/books/${b.slug}`; coverUrl = b.cover_url; liveTitle = b.title; missing = false; }
          } else if (s.resource_type === "research" && s.resource_id) {
            const r = researchMap.get(s.resource_id);
            if (r) { url = `/theses/${r.slug ?? s.resource_id}`; coverUrl = r.cover_url; liveTitle = r.title; missing = false; }
          } else if (s.resource_type === "catalog" && s.resource_id) {
            const c = catalogMap.get(s.resource_id);
            if (c) { url = `/catalogs/${c.slug}`; coverUrl = c.cover_url; liveTitle = c.title; missing = false; }
          } else if (s.resource_type === "publication" && s.resource_id) {
            const p = publicationMap.get(s.resource_id);
            if (p) { url = `/publications/${p.slug ?? s.resource_id}`; coverUrl = p.cover_url; liveTitle = p.title; missing = false; }
          }

          return {
            id: s.id,
            resource_type: s.resource_type,
            resource_id: s.resource_id,
            resource_title: liveTitle,
            external_url: s.external_url,
            instruction: s.instruction,
            instruction_km: s.instruction_km,
            est_minutes: s.est_minutes,
            is_required: s.is_required ?? true,
            position: s.position,
            url,
            coverUrl,
            missing,
          };
        }),
    }))
    .sort((a, b) => a.position - b.position);

  const stepCount = resolvedModules.reduce((sum, m) => sum + m.steps.length, 0);
  const durationMinutes =
    path.estimated_minutes && path.estimated_minutes > 0
      ? path.estimated_minutes
      : sumStepMinutes(resolvedModules.map((m) => ({ learning_path_steps: m.steps })));

  return {
    id: path.id,
    slug: path.slug,
    title: path.title,
    title_km: path.title_km,
    description: path.description,
    description_km: path.description_km,
    audience: path.audience,
    cover_url: path.cover_url,
    is_published: path.is_published,
    status: (path.status ?? (path.is_published ? "published" : "draft")) as LearningPathStatus,
    featured: !!path.featured,
    difficulty: (path.difficulty ?? null) as PathDifficulty | null,
    subject: path.subject ?? null,
    language: (path.language ?? null) as PathLanguage | null,
    tags: Array.isArray(path.tags) ? path.tags : [],
    position: path.position,
    stepCount,
    moduleCount: resolvedModules.length,
    durationMinutes,
    updated_at: path.updated_at ?? null,
    estimated_minutes: path.estimated_minutes ?? null,
    outcomes: toBilingualList(path.outcomes),
    prerequisites: toBilingualList(path.prerequisites),
    seo_title: path.seo_title ?? null,
    seo_description: path.seo_description ?? null,
    og_image_url: path.og_image_url ?? null,
    scheduled_at: path.scheduled_at ?? null,
    published_at: path.published_at ?? null,
    archived_at: path.archived_at ?? null,
    modules: resolvedModules,
  };
}

// ── Enrollment + progress (auth'd user; RLS-scoped to own rows) ────────────────

export async function getUserPathProgress(
  pathId: string,
): Promise<{ enrolled: boolean; completedStepIds: string[]; completedAt: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { enrolled: false, completedStepIds: [], completedAt: null };

  const db = createServiceClient();
  const [{ data: enrollment }, { data: progress }] = await Promise.all([
    db.from("learning_path_enrollments").select("completed_at").eq("user_id", user.id).eq("path_id", pathId).maybeSingle(),
    db
      .from("learning_path_step_progress")
      .select("step_id, learning_path_steps!inner(module_id, learning_path_modules!inner(path_id))")
      .eq("user_id", user.id)
      .eq("learning_path_steps.learning_path_modules.path_id", pathId),
  ]);

  return {
    enrolled: !!enrollment,
    completedAt: enrollment?.completed_at ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    completedStepIds: (progress ?? []).map((r: any) => r.step_id),
  };
}

export interface InProgressPath {
  id: string;
  slug: string;
  title: string;
  title_km: string | null;
  cover_url: string | null;
  completedSteps: number;
  totalSteps: number;
}

/** Paths the current user has started but not finished — for the dashboard "continue" card. */
export async function getInProgressPaths(limit = 3): Promise<InProgressPath[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const db = createServiceClient();

  const { data: enrollments } = await db
    .from("learning_path_enrollments")
    .select("path_id, enrolled_at, learning_paths!inner(id, slug, title, title_km, cover_url, is_published)")
    .eq("user_id", user.id)
    .is("completed_at", null)
    .eq("learning_paths.is_published", true)
    .order("enrolled_at", { ascending: false })
    .limit(limit);

  if (!enrollments || enrollments.length === 0) return [];

  const pathIds = enrollments.map((e) => e.path_id);

  const [{ data: modules }, { data: doneRows }] = await Promise.all([
    db.from("learning_path_modules").select("path_id, learning_path_steps(id)").in("path_id", pathIds),
    db
      .from("learning_path_step_progress")
      .select("learning_path_steps!inner(module_id, learning_path_modules!inner(path_id))")
      .eq("user_id", user.id),
  ]);

  const totalByPath = new Map<string, number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const m of (modules ?? []) as any[]) {
    totalByPath.set(m.path_id, (totalByPath.get(m.path_id) ?? 0) + (m.learning_path_steps?.length ?? 0));
  }

  const completedByPath = new Map<string, number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (doneRows ?? []) as any[]) {
    const pid = row.learning_path_steps?.learning_path_modules?.path_id;
    if (pid && pathIds.includes(pid)) completedByPath.set(pid, (completedByPath.get(pid) ?? 0) + 1);
  }

  return enrollments
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((e: any) => ({
      id: e.learning_paths.id,
      slug: e.learning_paths.slug,
      title: e.learning_paths.title,
      title_km: e.learning_paths.title_km,
      cover_url: e.learning_paths.cover_url,
      completedSteps: completedByPath.get(e.path_id) ?? 0,
      totalSteps: totalByPath.get(e.path_id) ?? 0,
    }))
    // A path with 0 steps has nothing left to "continue" — exclude it.
    .filter((p) => p.totalSteps > 0);
}

/** Per-path progress for the current user across every enrolled published path. */
export interface PathProgressRecord {
  pathId: string;
  slug: string;
  title: string;
  title_km: string | null;
  cover_url: string | null;
  audience: string | null;
  completedSteps: number;
  totalSteps: number;
  completedAt: string | null;
  enrolledAt: string | null;
  /** The next unfinished step to resume at (null when the path is complete or empty). */
  nextStep: { moduleTitle: string; moduleTitleKm: string | null; stepTitle: string | null; url: string | null } | null;
}

/**
 * All of the current user's path progress in one call — powers card progress
 * badges and the /paths "Continue learning" rail. Called from a client island
 * after hydration so the public page shell stays cacheable (never bakes
 * per-user data into ISR output). Returns [] for signed-out users.
 */
export async function getMyPathProgress(): Promise<PathProgressRecord[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const db = createServiceClient();
  const { data: enrollments } = await db
    .from("learning_path_enrollments")
    .select("path_id, enrolled_at, completed_at, learning_paths!inner(id, slug, title, title_km, cover_url, audience, is_published)")
    .eq("user_id", user.id)
    .eq("learning_paths.is_published", true)
    .order("enrolled_at", { ascending: false });

  if (!enrollments || enrollments.length === 0) return [];
  const pathIds = enrollments.map((e) => e.path_id);

  const [{ data: modules }, { data: doneRows }] = await Promise.all([
    db
      .from("learning_path_modules")
      .select("id, path_id, title, title_km, position, learning_path_steps(id, resource_title, resource_type, resource_id, external_url, position)")
      .in("path_id", pathIds)
      .order("position", { ascending: true }),
    db
      .from("learning_path_step_progress")
      .select("step_id")
      .eq("user_id", user.id),
  ]);

  const doneSet = new Set((doneRows ?? []).map((r) => r.step_id));

  // Order steps per path and find the first unfinished one for resume.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modulesByPath = new Map<string, any[]>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const m of (modules ?? []) as any[]) {
    const arr = modulesByPath.get(m.path_id) ?? [];
    arr.push(m);
    modulesByPath.set(m.path_id, arr);
  }

  return enrollments
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((e: any): PathProgressRecord => {
      const mods = (modulesByPath.get(e.path_id) ?? []).sort((a, b) => a.position - b.position);
      let total = 0;
      let done = 0;
      let nextStep: PathProgressRecord["nextStep"] = null;
      for (const m of mods) {
        const steps = ((m.learning_path_steps ?? []) as { id: string; position: number; resource_title: string | null; resource_type: StepResourceType; resource_id: string | null; external_url: string | null }[])
          .slice()
          .sort((a, b) => a.position - b.position);
        for (const s of steps) {
          total += 1;
          if (doneSet.has(s.id)) { done += 1; continue; }
          if (!nextStep) {
            nextStep = {
              moduleTitle: m.title,
              moduleTitleKm: m.title_km,
              stepTitle: s.resource_title,
              url: stepUrl(s.resource_type, s.resource_id, s.external_url),
            };
          }
        }
      }
      return {
        pathId: e.path_id,
        slug: e.learning_paths.slug,
        title: e.learning_paths.title,
        title_km: e.learning_paths.title_km,
        cover_url: e.learning_paths.cover_url,
        audience: e.learning_paths.audience,
        completedSteps: done,
        totalSteps: total,
        completedAt: e.completed_at,
        enrolledAt: e.enrolled_at,
        nextStep,
      };
    })
    .filter((p) => p.totalSteps > 0);
}

export async function enrollInPath(pathId: string): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to enroll in this learning path." };

  const db = createServiceClient();
  const { error } = await db
    .from("learning_path_enrollments")
    .upsert({ user_id: user.id, path_id: pathId }, { onConflict: "user_id,path_id", ignoreDuplicates: true });

  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return { success: true };
}

export async function setStepComplete(
  stepId: string,
  pathId: string,
  completed: boolean,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in required." };

  const db = createServiceClient();

  if (completed) {
    const { error } = await db
      .from("learning_path_step_progress")
      .upsert({ user_id: user.id, step_id: stepId }, { onConflict: "user_id,step_id", ignoreDuplicates: true });
    if (error) return { error: error.message };
  } else {
    const { error } = await db
      .from("learning_path_step_progress")
      .delete()
      .eq("user_id", user.id)
      .eq("step_id", stepId);
    if (error) return { error: error.message };
  }

  // Auto-complete the path enrollment once every step is done.
  const { data: modules } = await db
    .from("learning_path_modules")
    .select("learning_path_steps(id)")
    .eq("path_id", pathId);
  const allStepIds = (modules ?? []).flatMap(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (m: any) => (m.learning_path_steps ?? []).map((s: { id: string }) => s.id),
  );
  const { data: doneRows } = await db
    .from("learning_path_step_progress")
    .select("step_id")
    .eq("user_id", user.id)
    .in("step_id", allStepIds);
  const allDone = allStepIds.length > 0 && (doneRows?.length ?? 0) >= allStepIds.length;

  await db
    .from("learning_path_enrollments")
    .update({ completed_at: allDone ? new Date().toISOString() : null })
    .eq("user_id", user.id)
    .eq("path_id", pathId);

  revalidatePath("/dashboard");
  return { success: true };
}

// ── Admin ────────────────────────────────────────────────────────────────────

export interface PathStepInput {
  resource_type: StepResourceType;
  resource_id: string | null;
  resource_title: string | null;
  external_url: string | null;
  instruction: string | null;
  instruction_km: string | null;
  est_minutes: number | null;
  is_required?: boolean;
}

export interface PathModuleInput {
  title: string;
  title_km: string | null;
  description?: string | null;
  description_km?: string | null;
  steps: PathStepInput[];
}

export interface PathInput {
  title: string;
  title_km: string | null;
  description: string | null;
  description_km: string | null;
  audience: string | null;
  cover_url: string | null;
  /** New callers pass `status`; the legacy builder passes `is_published`. Either is accepted. */
  status?: LearningPathStatus;
  is_published?: boolean;
  featured?: boolean;
  difficulty?: PathDifficulty | null;
  subject?: string | null;
  language?: PathLanguage | null;
  estimated_minutes?: number | null;
  outcomes?: BilingualEntry[];
  prerequisites?: BilingualEntry[];
  tags?: string[];
  seo_title?: string | null;
  seo_description?: string | null;
  og_image_url?: string | null;
  scheduled_at?: string | null;
  modules: PathModuleInput[];
}

export interface AdminPathRow extends LearningPathSummary {
  updated_by: string | null;
  editorName: string | null;
}

/** Admin-facing summary rows (all statuses), with the editor who last touched each. */
export async function adminGetPaths(): Promise<AdminPathRow[]> {
  const { supabase } = await requireLibrarian();
  const { data, error } = await supabase
    .from("learning_paths")
    .select(`${SUMMARY_SELECT}, updated_by`)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("position", { ascending: true });

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Record<string, unknown>[];

  // Resolve editor display names in one batched query.
  const editorIds = [...new Set(rows.map((r) => r.updated_by).filter((v): v is string => !!v))];
  const editorNames = new Map<string, string>();
  if (editorIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", editorIds);
    for (const p of profiles ?? []) {
      editorNames.set(p.id as string, (p.full_name as string) || (p.email as string) || "");
    }
  }

  return rows.map((r) => ({
    ...mapSummary(r),
    updated_by: (r.updated_by as string) ?? null,
    editorName: r.updated_by ? editorNames.get(r.updated_by as string) ?? null : null,
  }));
}

export interface AdminPathStats {
  total: number;
  published: number;
  draft: number;
  scheduled: number;
  archived: number;
  featured: number;
  /** Distinct learners currently enrolled in a published path and not finished. */
  activeLearners: number;
  /** Completed enrollments across published paths. */
  completions: number;
  /** Path with the most enrollments, if any enrollments exist. */
  mostStarted: { slug: string; title: string; count: number } | null;
}

/**
 * Real, data-backed admin metrics. Learner figures come from actual
 * enrollments; when there are none the counts are simply 0 / null — nothing is
 * fabricated. Returns undefined learner fields gracefully on any read error.
 */
export async function adminGetPathStats(): Promise<AdminPathStats> {
  const { supabase } = await requireLibrarian();

  const [{ data: pathRows }, { data: enrollRows }] = await Promise.all([
    supabase.from("learning_paths").select("id, slug, title, status, featured"),
    supabase
      .from("learning_path_enrollments")
      .select("user_id, path_id, completed_at, learning_paths!inner(slug, title, is_published)")
      .eq("learning_paths.is_published", true),
  ]);

  const paths = (pathRows ?? []) as { id: string; slug: string; title: string; status: LearningPathStatus; featured: boolean }[];
  const counts = { total: paths.length, published: 0, draft: 0, scheduled: 0, archived: 0, featured: 0 };
  for (const p of paths) {
    if (p.status in counts) (counts as Record<string, number>)[p.status] += 1;
    if (p.featured) counts.featured += 1;
  }

  const activeUsers = new Set<string>();
  let completions = 0;
  const startsByPath = new Map<string, { slug: string; title: string; count: number }>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (enrollRows ?? []) as any[]) {
    if (e.completed_at) completions += 1;
    else activeUsers.add(e.user_id);
    const key = e.path_id as string;
    const rec = startsByPath.get(key) ?? { slug: e.learning_paths.slug, title: e.learning_paths.title, count: 0 };
    rec.count += 1;
    startsByPath.set(key, rec);
  }

  const mostStarted = [...startsByPath.values()].sort((a, b) => b.count - a.count)[0] ?? null;

  return {
    ...counts,
    activeLearners: activeUsers.size,
    completions,
    mostStarted,
  };
}

export async function adminGetPathDetail(pathId: string): Promise<LearningPathDetail | null> {
  const { supabase } = await requireLibrarian();

  const { data: path } = await supabase.from("learning_paths").select("*").eq("id", pathId).maybeSingle();
  if (!path) return null;

  const { data: modules } = await supabase
    .from("learning_path_modules")
    .select("id, title, title_km, description, description_km, position, learning_path_steps(*)")
    .eq("path_id", pathId)
    .order("position", { ascending: true });

  const resolvedModules: LearningPathModule[] = (modules ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((m: any) => ({
      id: m.id,
      title: m.title,
      title_km: m.title_km,
      description: m.description ?? null,
      description_km: m.description_km ?? null,
      position: m.position,
      steps: ((m.learning_path_steps ?? []) as LearningPathStep[])
        .sort((a, b) => a.position - b.position)
        .map((s) => ({ ...s, is_required: s.is_required ?? true, url: null, coverUrl: null, missing: false })),
    }))
    .sort((a, b) => a.position - b.position);

  const stepCount = resolvedModules.reduce((sum, m) => sum + m.steps.length, 0);
  const durationMinutes =
    path.estimated_minutes && path.estimated_minutes > 0
      ? path.estimated_minutes
      : sumStepMinutes(resolvedModules.map((m) => ({ learning_path_steps: m.steps })));

  return {
    id: path.id,
    slug: path.slug,
    title: path.title,
    title_km: path.title_km,
    description: path.description,
    description_km: path.description_km,
    audience: path.audience,
    cover_url: path.cover_url,
    is_published: path.is_published,
    status: (path.status ?? (path.is_published ? "published" : "draft")) as LearningPathStatus,
    featured: !!path.featured,
    difficulty: (path.difficulty ?? null) as PathDifficulty | null,
    subject: path.subject ?? null,
    language: (path.language ?? null) as PathLanguage | null,
    tags: Array.isArray(path.tags) ? path.tags : [],
    position: path.position,
    stepCount,
    moduleCount: resolvedModules.length,
    durationMinutes,
    updated_at: path.updated_at ?? null,
    estimated_minutes: path.estimated_minutes ?? null,
    outcomes: toBilingualList(path.outcomes),
    prerequisites: toBilingualList(path.prerequisites),
    seo_title: path.seo_title ?? null,
    seo_description: path.seo_description ?? null,
    og_image_url: path.og_image_url ?? null,
    scheduled_at: path.scheduled_at ?? null,
    published_at: path.published_at ?? null,
    archived_at: path.archived_at ?? null,
    modules: resolvedModules,
  };
}

/** Trim + drop empty bilingual entries before persisting to jsonb. */
function cleanBilingual(list: BilingualEntry[] | undefined): BilingualEntry[] {
  return (list ?? [])
    .map((e) => ({ en: (e.en ?? "").trim(), km: (e.km ?? "").trim() }))
    .filter((e) => e.en || e.km);
}

/**
 * Whole-document save: upserts the path row, then replaces its module/step tree
 * atomically via the `replace_learning_path_curriculum` RPC (see migration
 * 0111) so a mid-save failure can't leave a half-written curriculum.
 */
export async function savePath(
  pathId: string | null,
  input: PathInput,
): Promise<{ success: true; id: string; slug: string } | { error: string }> {
  const { supabase, user } = await requireLibrarian();

  const title = input.title.trim();
  if (!title) return { error: "Title is required." };
  if (input.modules.length === 0) return { error: "Add at least one module." };

  const status: LearningPathStatus = input.status ?? (input.is_published ? "published" : "draft");

  // Shared column payload (the trigger keeps is_published + timestamps in sync).
  const columns = {
    title,
    title_km: input.title_km?.trim() || null,
    description: input.description?.trim() || null,
    description_km: input.description_km?.trim() || null,
    audience: input.audience?.trim() || null,
    cover_url: input.cover_url || null,
    status,
    featured: input.featured ?? false,
    difficulty: input.difficulty ?? null,
    subject: input.subject?.trim() || null,
    language: input.language ?? null,
    estimated_minutes: input.estimated_minutes ?? null,
    outcomes: cleanBilingual(input.outcomes),
    prerequisites: cleanBilingual(input.prerequisites),
    tags: (input.tags ?? []).map((t) => t.trim()).filter(Boolean),
    seo_title: input.seo_title?.trim() || null,
    seo_description: input.seo_description?.trim() || null,
    og_image_url: input.og_image_url?.trim() || null,
    scheduled_at: status === "scheduled" ? input.scheduled_at ?? null : null,
    updated_by: user.id,
  };

  let id = pathId;
  let slug: string;
  const isNew = !id;

  try {
    if (id) {
      const { data: existing, error: fetchErr } = await supabase
        .from("learning_paths").select("slug").eq("id", id).single();
      if (fetchErr || !existing) return { error: "Path not found." };
      slug = existing.slug;

      const { error: updateErr } = await supabase.from("learning_paths").update(columns).eq("id", id);
      if (updateErr) return { error: updateErr.message };
    } else {
      const baseSlug = slugify(title);
      slug = baseSlug;
      let suffix = 1;
      while (true) {
        const { data: clash } = await supabase.from("learning_paths").select("id").eq("slug", slug).maybeSingle();
        if (!clash) break;
        slug = `${baseSlug}-${++suffix}`;
      }

      const { data: created, error: insertErr } = await supabase
        .from("learning_paths")
        .insert({ ...columns, slug, created_by: user.id })
        .select("id")
        .single();
      if (insertErr || !created) return { error: insertErr?.message ?? "Failed to create path." };
      id = created.id;
    }

    // Atomic module/step replacement.
    const modulesPayload = input.modules.map((mod) => ({
      title: mod.title.trim(),
      title_km: mod.title_km?.trim() || "",
      description: mod.description?.trim() || "",
      description_km: mod.description_km?.trim() || "",
      steps: mod.steps.map((s) => ({
        resource_type: s.resource_type,
        resource_id: s.resource_type === "external" ? null : s.resource_id,
        resource_title: s.resource_title ?? "",
        external_url: s.resource_type === "external" ? s.external_url ?? "" : "",
        instruction: s.instruction?.trim() || "",
        instruction_km: s.instruction_km?.trim() || "",
        est_minutes: s.est_minutes ?? null,
        is_required: s.is_required ?? true,
      })),
    }));

    const { error: rpcErr } = await supabase.rpc("replace_learning_path_curriculum", {
      p_path_id: id,
      p_modules: modulesPayload,
    });
    if (rpcErr) return { error: rpcErr.message };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save path." };
  }

  await logAdminAction(user.id, isNew ? "create" : "update", "learning_paths", id!, { slug, status });
  revalidateLearningPath(slug);
  revalidatePath("/admin/paths");
  return { success: true, id: id!, slug };
}

/** Change a path's lifecycle status (publish / unpublish / archive / schedule). */
export async function setPathStatus(
  pathId: string,
  status: LearningPathStatus,
  scheduledAt?: string | null,
): Promise<{ success: true } | { error: string }> {
  const { supabase, user } = await requireLibrarian();
  const { data: existing } = await supabase.from("learning_paths").select("slug").eq("id", pathId).maybeSingle();
  if (!existing) return { error: "Path not found." };

  const { error } = await supabase
    .from("learning_paths")
    .update({
      status,
      scheduled_at: status === "scheduled" ? scheduledAt ?? null : null,
      updated_by: user.id,
    })
    .eq("id", pathId);
  if (error) return { error: error.message };

  await logAdminAction(user.id, `status:${status}`, "learning_paths", pathId, { slug: existing.slug });
  revalidateLearningPath(existing.slug);
  revalidatePath("/admin/paths");
  return { success: true };
}

/** Toggle the single manually-featured path. Featuring one un-features the rest. */
export async function setPathFeatured(
  pathId: string,
  featured: boolean,
): Promise<{ success: true } | { error: string }> {
  const { supabase, user } = await requireLibrarian();
  if (featured) {
    // Only one featured path at a time.
    await supabase.from("learning_paths").update({ featured: false }).eq("featured", true);
  }
  const { data: existing } = await supabase.from("learning_paths").select("slug").eq("id", pathId).maybeSingle();
  const { error } = await supabase
    .from("learning_paths")
    .update({ featured, updated_by: user.id })
    .eq("id", pathId);
  if (error) return { error: error.message };

  await logAdminAction(user.id, featured ? "feature" : "unfeature", "learning_paths", pathId);
  revalidateLearningPath(existing?.slug ?? null);
  revalidatePath("/admin/paths");
  return { success: true };
}

/** Archive a path — the default, reversible alternative to deletion. */
export async function archivePath(pathId: string): Promise<{ success: true } | { error: string }> {
  return setPathStatus(pathId, "archived");
}

/** Duplicate a path (as a draft) with its full curriculum. */
export async function duplicatePath(
  pathId: string,
): Promise<{ success: true; id: string; slug: string } | { error: string }> {
  const detail = await adminGetPathDetail(pathId);
  if (!detail) return { error: "Path not found." };

  return savePath(null, {
    title: `${detail.title} (copy)`,
    title_km: detail.title_km,
    description: detail.description,
    description_km: detail.description_km,
    audience: detail.audience,
    cover_url: detail.cover_url,
    status: "draft",
    featured: false,
    difficulty: detail.difficulty,
    subject: detail.subject,
    language: detail.language,
    estimated_minutes: detail.estimated_minutes,
    outcomes: detail.outcomes,
    prerequisites: detail.prerequisites,
    tags: detail.tags,
    seo_title: detail.seo_title,
    seo_description: detail.seo_description,
    og_image_url: detail.og_image_url,
    modules: detail.modules.map((m) => ({
      title: m.title,
      title_km: m.title_km,
      description: m.description,
      description_km: m.description_km,
      steps: m.steps.map((s) => ({
        resource_type: s.resource_type,
        resource_id: s.resource_id,
        resource_title: s.resource_title,
        external_url: s.external_url,
        instruction: s.instruction,
        instruction_km: s.instruction_km,
        est_minutes: s.est_minutes,
        is_required: s.is_required,
      })),
    })),
  });
}

/** Bulk lifecycle change over several paths (publish/unpublish/archive). */
export async function bulkSetPathStatus(
  pathIds: string[],
  status: LearningPathStatus,
): Promise<{ success: true; count: number } | { error: string }> {
  const { supabase, user } = await requireLibrarian();
  if (pathIds.length === 0) return { success: true, count: 0 };

  const { data, error } = await supabase
    .from("learning_paths")
    .update({ status, scheduled_at: null, updated_by: user.id })
    .in("id", pathIds)
    .select("slug");
  if (error) return { error: error.message };

  await logAdminAction(user.id, `bulk-status:${status}`, "learning_paths", undefined, { count: data?.length ?? 0 });
  revalidateLearningPath();
  revalidatePath("/admin/paths");
  return { success: true, count: data?.length ?? 0 };
}

/**
 * Hard delete — gated behind explicit confirmation in the UI. Prefer
 * archivePath. Writes an audit entry before removing the row (cascade drops
 * modules, steps, enrollments and progress).
 */
export async function deletePath(pathId: string): Promise<{ success: true } | { error: string }> {
  const { supabase, user } = await requireLibrarian();
  const { data: existing } = await supabase.from("learning_paths").select("slug, title").eq("id", pathId).maybeSingle();
  const { error } = await supabase.from("learning_paths").delete().eq("id", pathId);
  if (error) return { error: error.message };

  await logAdminAction(user.id, "delete", "learning_paths", pathId, { slug: existing?.slug, title: existing?.title });
  revalidateLearningPath(existing?.slug ?? null);
  revalidatePath("/admin/paths");
  return { success: true };
}

/** Lightweight resource search for the admin step picker (books/theses/catalog/publications). */
export async function searchStepResources(
  type: Exclude<StepResourceType, "external">,
  query: string,
): Promise<{ id: string; title: string; coverUrl: string | null; published: boolean }[]> {
  await requireLibrarian();
  const db = createServiceClient();
  const q = query.trim();
  if (!q) return [];

  const table =
    type === "book" ? "books" :
    type === "research" ? "research_reports" :
    type === "publication" ? "publications" :
    "catalog_books";

  // Physical catalog rows have no publish flag; the others do.
  const hasPublishedFlag = table !== "catalog_books";
  const { data, error } = await db
    .from(table)
    .select(hasPublishedFlag ? "id, title, cover_url, is_published" : "id, title, cover_url")
    .ilike("title", `%${q}%`)
    .limit(8);

  if (error) {
    console.error("[searchStepResources]", error.message);
    return [];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id,
    title: r.title,
    coverUrl: r.cover_url ?? null,
    published: hasPublishedFlag ? !!r.is_published : true,
  }));
}
