"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireLibrarian } from "@/lib/auth/requireAdmin";
import { revalidateLocalizedPath as revalidatePath, revalidateLearningPath } from "@/lib/cache/revalidate";
import { slugify } from "@/lib/books";

// ── Types ─────────────────────────────────────────────────────────────────────

export type StepResourceType = "book" | "research" | "catalog" | "external";

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
  position: number;
  stepCount: number;
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
  position: number;
  /** Resolved at read-time from the source table; null if the resource was since deleted. */
  url: string | null;
  coverUrl: string | null;
}

export interface LearningPathModule {
  id: string;
  title: string;
  title_km: string | null;
  position: number;
  steps: LearningPathStep[];
}

export interface LearningPathDetail extends LearningPathSummary {
  modules: LearningPathModule[];
}

function stepUrl(type: StepResourceType, resourceId: string | null, externalUrl: string | null): string | null {
  if (type === "external") return externalUrl;
  if (!resourceId) return null;
  if (type === "book") return `/books/${resourceId}`; // resolved to slug below
  if (type === "research") return `/theses/${resourceId}`; // resolved to slug below
  if (type === "catalog") return `/catalogs/${resourceId}`; // resolved to slug below
  return null;
}

/** Resolve resource_id → live title/slug/cover across the 3 internal source tables. */
async function resolveStepResources(
  db: ReturnType<typeof createServiceClient>,
  steps: { id: string; resource_type: StepResourceType; resource_id: string | null }[],
) {
  const idsByType: Record<string, string[]> = { book: [], research: [], catalog: [] };
  for (const s of steps) {
    if (s.resource_type !== "external" && s.resource_id) idsByType[s.resource_type].push(s.resource_id);
  }

  const [books, research, catalog] = await Promise.all([
    idsByType.book.length
      ? db.from("books").select("id, slug, title, cover_url").in("id", idsByType.book)
      : Promise.resolve({ data: [] as { id: string; slug: string; title: string; cover_url: string | null }[] }),
    idsByType.research.length
      ? db.from("research_reports").select("id, slug, title, cover_url").in("id", idsByType.research)
      : Promise.resolve({ data: [] as { id: string; slug: string | null; title: string; cover_url: string | null }[] }),
    idsByType.catalog.length
      ? db.from("catalog_books").select("id, slug, title, cover_url").in("id", idsByType.catalog)
      : Promise.resolve({ data: [] as { id: string; slug: string; title: string; cover_url: string | null }[] }),
  ]);

  const bookMap = new Map((books.data ?? []).map((b) => [b.id, b]));
  const researchMap = new Map((research.data ?? []).map((r) => [r.id, r]));
  const catalogMap = new Map((catalog.data ?? []).map((c) => [c.id, c]));

  return { bookMap, researchMap, catalogMap };
}

// ── Public reads ───────────────────────────────────────────────────────────────

export async function getPublishedPaths(): Promise<LearningPathSummary[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("learning_paths")
    .select("id, slug, title, title_km, description, description_km, audience, cover_url, is_published, position, learning_path_modules(learning_path_steps(id))")
    .eq("is_published", true)
    .order("position", { ascending: true });

  if (error) {
    console.error("[getPublishedPaths]", error.message);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((p: any) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    title_km: p.title_km,
    description: p.description,
    description_km: p.description_km,
    audience: p.audience,
    cover_url: p.cover_url,
    is_published: p.is_published,
    position: p.position,
    stepCount: (p.learning_path_modules ?? []).reduce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sum: number, m: any) => sum + (m.learning_path_steps?.length ?? 0),
      0,
    ),
  }));
}

export async function getPathBySlug(slug: string): Promise<LearningPathDetail | null> {
  const db = createServiceClient();
  const { data: path, error } = await db
    .from("learning_paths")
    .select("id, slug, title, title_km, description, description_km, audience, cover_url, is_published, position")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (error || !path) return null;

  const { data: modules } = await db
    .from("learning_path_modules")
    .select("id, title, title_km, position, learning_path_steps(id, resource_type, resource_id, resource_title, external_url, instruction, instruction_km, est_minutes, position)")
    .eq("path_id", path.id)
    .order("position", { ascending: true });

  const allSteps = (modules ?? []).flatMap(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (m: any) => (m.learning_path_steps ?? []) as { id: string; resource_type: StepResourceType; resource_id: string | null }[],
  );
  const { bookMap, researchMap, catalogMap } = await resolveStepResources(db, allSteps);

  const resolvedModules: LearningPathModule[] = (modules ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((m: any) => ({
      id: m.id,
      title: m.title,
      title_km: m.title_km,
      position: m.position,
      steps: ((m.learning_path_steps ?? []) as LearningPathStep[])
        .sort((a, b) => a.position - b.position)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((s: any) => {
          let url = stepUrl(s.resource_type, s.resource_id, s.external_url);
          let coverUrl: string | null = null;
          let liveTitle = s.resource_title;

          if (s.resource_type === "book" && s.resource_id) {
            const b = bookMap.get(s.resource_id);
            if (b) { url = `/books/${b.slug}`; coverUrl = b.cover_url; liveTitle = b.title; }
          } else if (s.resource_type === "research" && s.resource_id) {
            const r = researchMap.get(s.resource_id);
            if (r) { url = `/theses/${r.slug ?? s.resource_id}`; coverUrl = r.cover_url; liveTitle = r.title; }
          } else if (s.resource_type === "catalog" && s.resource_id) {
            const c = catalogMap.get(s.resource_id);
            if (c) { url = `/catalogs/${c.slug}`; coverUrl = c.cover_url; liveTitle = c.title; }
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
            position: s.position,
            url,
            coverUrl,
          };
        }),
    }))
    .sort((a, b) => a.position - b.position);

  const stepCount = resolvedModules.reduce((sum, m) => sum + m.steps.length, 0);

  return { ...path, stepCount, modules: resolvedModules };
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
}

export interface PathModuleInput {
  title: string;
  title_km: string | null;
  steps: PathStepInput[];
}

export interface PathInput {
  title: string;
  title_km: string | null;
  description: string | null;
  description_km: string | null;
  audience: string | null;
  cover_url: string | null;
  is_published: boolean;
  modules: PathModuleInput[];
}

export async function adminGetPaths(): Promise<LearningPathSummary[]> {
  const { supabase } = await requireLibrarian();
  const { data, error } = await supabase
    .from("learning_paths")
    .select("id, slug, title, title_km, description, description_km, audience, cover_url, is_published, position, learning_path_modules(learning_path_steps(id))")
    .order("position", { ascending: true });

  if (error) throw new Error(error.message);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((p: any) => ({
    ...p,
    stepCount: (p.learning_path_modules ?? []).reduce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sum: number, m: any) => sum + (m.learning_path_steps?.length ?? 0),
      0,
    ),
  }));
}

export async function adminGetPathDetail(pathId: string): Promise<LearningPathDetail | null> {
  const { supabase } = await requireLibrarian();

  const { data: path } = await supabase.from("learning_paths").select("*").eq("id", pathId).maybeSingle();
  if (!path) return null;

  const { data: modules } = await supabase
    .from("learning_path_modules")
    .select("id, title, title_km, position, learning_path_steps(*)")
    .eq("path_id", pathId)
    .order("position", { ascending: true });

  const resolvedModules: LearningPathModule[] = (modules ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((m: any) => ({
      id: m.id,
      title: m.title,
      title_km: m.title_km,
      position: m.position,
      steps: ((m.learning_path_steps ?? []) as LearningPathStep[])
        .sort((a, b) => a.position - b.position)
        .map((s) => ({ ...s, url: null, coverUrl: null })),
    }))
    .sort((a, b) => a.position - b.position);

  const stepCount = resolvedModules.reduce((sum, m) => sum + m.steps.length, 0);
  return { ...path, stepCount, modules: resolvedModules };
}

/**
 * Whole-document save: upserts the path row, then replaces all of its
 * modules/steps in one pass (delete-all-then-insert). Simpler and safe for a
 * low-frequency, librarian-only, single-editor content type — no need for
 * granular per-module/step CRUD or optimistic concurrency here.
 */
export async function savePath(
  pathId: string | null,
  input: PathInput,
): Promise<{ success: true; id: string; slug: string } | { error: string }> {
  const { supabase, user } = await requireLibrarian();

  const title = input.title.trim();
  if (!title) return { error: "Title is required." };
  if (input.modules.length === 0) return { error: "Add at least one module." };

  let id = pathId;
  let slug: string;

  try {
    if (id) {
      const { data: existing, error: fetchErr } = await supabase
        .from("learning_paths").select("slug").eq("id", id).single();
      if (fetchErr || !existing) return { error: "Path not found." };
      slug = existing.slug;

      const { error: updateErr } = await supabase
        .from("learning_paths")
        .update({
          title,
          title_km: input.title_km?.trim() || null,
          description: input.description?.trim() || null,
          description_km: input.description_km?.trim() || null,
          audience: input.audience?.trim() || null,
          cover_url: input.cover_url || null,
          is_published: input.is_published,
        })
        .eq("id", id);
      if (updateErr) return { error: updateErr.message };

      // Cascade delete removes existing modules + their steps.
      await supabase.from("learning_path_modules").delete().eq("path_id", id);
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
        .insert({
          slug,
          title,
          title_km: input.title_km?.trim() || null,
          description: input.description?.trim() || null,
          description_km: input.description_km?.trim() || null,
          audience: input.audience?.trim() || null,
          cover_url: input.cover_url || null,
          is_published: input.is_published,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (insertErr || !created) return { error: insertErr?.message ?? "Failed to create path." };
      id = created.id;
    }

    for (let mi = 0; mi < input.modules.length; mi++) {
      const mod = input.modules[mi];
      const { data: createdModule, error: modErr } = await supabase
        .from("learning_path_modules")
        .insert({ path_id: id, title: mod.title.trim(), title_km: mod.title_km?.trim() || null, position: mi })
        .select("id")
        .single();
      if (modErr || !createdModule) return { error: modErr?.message ?? "Failed to save module." };

      if (mod.steps.length > 0) {
        const stepsPayload = mod.steps.map((s, si) => ({
          module_id: createdModule.id,
          resource_type: s.resource_type,
          resource_id: s.resource_type === "external" ? null : s.resource_id,
          resource_title: s.resource_title,
          external_url: s.resource_type === "external" ? s.external_url : null,
          instruction: s.instruction?.trim() || null,
          instruction_km: s.instruction_km?.trim() || null,
          est_minutes: s.est_minutes,
          position: si,
        }));
        const { error: stepErr } = await supabase.from("learning_path_steps").insert(stepsPayload);
        if (stepErr) return { error: stepErr.message };
      }
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save path." };
  }

  revalidateLearningPath(slug);
  revalidatePath("/admin/paths");
  return { success: true, id: id!, slug };
}

export async function deletePath(pathId: string): Promise<{ success: true } | { error: string }> {
  const { supabase } = await requireLibrarian();
  const { error } = await supabase.from("learning_paths").delete().eq("id", pathId);
  if (error) return { error: error.message };
  revalidateLearningPath();
  revalidatePath("/admin/paths");
  return { success: true };
}

/** Lightweight resource search for the admin step picker (books/theses/catalog only). */
export async function searchStepResources(
  type: Exclude<StepResourceType, "external">,
  query: string,
): Promise<{ id: string; title: string; coverUrl: string | null }[]> {
  await requireLibrarian();
  const db = createServiceClient();
  const q = query.trim();
  if (!q) return [];

  const table = type === "book" ? "books" : type === "research" ? "research_reports" : "catalog_books";
  const { data, error } = await db
    .from(table)
    .select("id, title, cover_url")
    .ilike("title", `%${q}%`)
    .limit(8);

  if (error) {
    console.error("[searchStepResources]", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({ id: r.id, title: r.title, coverUrl: r.cover_url ?? null }));
}
