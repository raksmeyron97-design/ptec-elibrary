// lib/learning-paths/subject-links.ts
//
// Which published learning paths belong to a given subject, and which subject
// category a learning path links back to — the reciprocal subject ↔ path edge.
//
// ── Invariant: Paths do NOT count toward the §5 indexability depth gate ───────
//
// Learning paths are curated wrappers around books that are already counted.
// Letting wrappers count as primary resources would re-inflate thin hubs
// (e.g. ភាសា, which holds 4 books and must remain noindex, follow). The UI rail
// renders on the subject hub, but the depth gate measures primary resources
// only. 19/4/2 stays 19/4/2.

import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { TAGS } from "@/lib/cache/revalidate";
import { learningPathMatchesSubject } from "@/lib/subjects/matching";

export type PathSummaryRef = {
  id: string;
  slug: string;
  title: string;
  titleKm: string | null;
  description: string | null;
  descriptionKm: string | null;
  subject: string | null;
  coverUrl: string | null;
  difficulty: string | null;
  position: number;
};

export type SubjectRef = {
  name: string;
  slug: string;
};

type DbPathRow = {
  id: string;
  slug: string;
  title: string;
  title_km?: string | null;
  description?: string | null;
  description_km?: string | null;
  subject?: string | null;
  status?: string | null;
  cover_url?: string | null;
  difficulty?: string | null;
  position?: number | null;
};

type DbCategoryRow = {
  name: string;
  slug: string;
};

/**
 * Filter published paths matching a subject name. Pure and offline-testable.
 */
export function filterPathsForSubject(
  paths: readonly DbPathRow[],
  subjectName: string,
): PathSummaryRef[] {
  if (!subjectName.trim()) return [];

  return paths
    .filter((p) => p.status === "published" && p.slug && p.title && learningPathMatchesSubject(p, subjectName))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.title.localeCompare(b.title))
    .map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      titleKm: p.title_km ?? null,
      description: p.description ?? null,
      descriptionKm: p.description_km ?? null,
      subject: p.subject ?? null,
      coverUrl: p.cover_url ?? null,
      difficulty: p.difficulty ?? null,
      position: p.position ?? 0,
    }));
}

/**
 * Find the matching subject category for a learning path. Pure and offline-testable.
 */
export function matchSubjectForPath(
  pathSubject: string | null | undefined,
  categories: readonly DbCategoryRow[],
): SubjectRef | null {
  if (!pathSubject || !pathSubject.trim()) return null;
  const match = categories.find((c) => learningPathMatchesSubject({ subject: pathSubject }, c.name));
  if (!match) return null;
  return { name: match.name, slug: match.slug };
}

// ── Server-cached reads ───────────────────────────────────────────────────────

async function loadPublishedPaths(): Promise<DbPathRow[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("learning_paths")
    .select("id, slug, title, title_km, description, description_km, subject, status, cover_url, difficulty, position")
    .eq("status", "published")
    .order("position", { ascending: true });

  if (error) throw new Error(`learning_paths: ${error.message}`);
  return (data ?? []) as DbPathRow[];
}

const cachedPublishedPaths = unstable_cache(loadPublishedPaths, ["published-paths-summary-v1"], {
  revalidate: 3600,
  tags: [TAGS.paths],
});

async function loadCategories(): Promise<DbCategoryRow[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("categories")
    .select("name, slug");

  if (error) throw new Error(`categories: ${error.message}`);
  return (data ?? []) as DbCategoryRow[];
}

const cachedCategories = unstable_cache(loadCategories, ["categories-summary-v1"], {
  revalidate: 3600,
  tags: [TAGS.categories],
});

/**
 * Published learning paths teaching resources under this subject.
 * React-cached per request.
 */
export const getSubjectLearningPaths = cache(
  async (subjectName: string): Promise<readonly PathSummaryRef[]> => {
    try {
      const paths = await cachedPublishedPaths();
      return filterPathsForSubject(paths, subjectName);
    } catch {
      return [];
    }
  },
);

/**
 * The parent subject category for a learning path, if matched.
 * React-cached per request.
 */
export const getParentSubjectForPath = cache(
  async (pathSubject: string | null | undefined): Promise<SubjectRef | null> => {
    try {
      const categories = await cachedCategories();
      return matchSubjectForPath(pathSubject, categories);
    } catch {
      return null;
    }
  },
);
