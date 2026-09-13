// lib/learning-paths/membership-index.ts
//
// The server half of the book→curriculum edge: fetch the three tiny tables
// once, hand them to the pure builder, and cache the result for every book
// page in the library.
//
// ── Why one index for the whole library ──────────────────────────────────────
//
// Production holds 9 published paths, 27 modules and 82 steps. That is smaller
// than one book's page rows, so a per-book query would be three round trips to
// discover — for 90% of books — that the answer is "none". One cached index
// answers every detail page for free, the same trade getSubjectIndex() makes
// for /subjects (lib/resources/connections.ts).
//
// ── Invalidation is inherited, not added ─────────────────────────────────────
//
// The cache is tagged `TAGS.paths`, which `revalidateLearningPath()` already
// fires on every path save, status change and archive. So editing a curriculum
// clears this index — and the book pages that rendered from it — with no new
// revalidation call to keep in sync. A second mechanism here is how the book
// page would keep showing a step that was removed an hour ago.

import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { TAGS } from "@/lib/cache/revalidate";
import {
  buildMembershipIndex,
  pathsForBook,
  type MembershipIndex,
  type ModuleRow,
  type PathRef,
  type PathRow,
  type StepRow,
} from "@/lib/learning-paths/membership";

async function loadMembership(): Promise<Record<string, PathRef[]>> {
  const supabase = createServiceClient();

  const [paths, modules, steps] = await Promise.all([
    supabase.from("learning_paths").select("id, slug, title, title_km, status, position"),
    supabase.from("learning_path_modules").select("id, path_id"),
    supabase.from("learning_path_steps").select("module_id, resource_type, resource_id"),
  ]);

  // A FAILED read is not "this book is in no curriculum". Throwing keeps the
  // bad answer out of the cache and lets the caller fall back to rendering
  // nothing for this request only, rather than pinning an empty index for an
  // hour — the lesson from lib/resources/contributor-view.ts, where a timed-out
  // read that returned [] silently deleted a relationship.
  if (paths.error) throw new Error(`learning_paths: ${paths.error.message}`);
  if (modules.error) throw new Error(`learning_path_modules: ${modules.error.message}`);
  if (steps.error) throw new Error(`learning_path_steps: ${steps.error.message}`);

  const index = buildMembershipIndex({
    paths: (paths.data ?? []) as PathRow[],
    modules: (modules.data ?? []) as ModuleRow[],
    steps: (steps.data ?? []) as StepRow[],
  });

  // unstable_cache serialises its value, and a Map does not survive that.
  return Object.fromEntries([...index].map(([k, v]) => [k, [...v]]));
}

const cachedMembership = unstable_cache(loadMembership, ["path-membership-v1"], {
  revalidate: 3600,
  tags: [TAGS.paths, TAGS.books],
});

/** The whole book→paths index, React-cached per request. */
export const getPathMembership = cache(async (): Promise<MembershipIndex> => {
  try {
    return new Map(Object.entries(await cachedMembership()));
  } catch {
    // Degrade to "no curriculum links on this page", never to a wrong claim.
    return new Map();
  }
});

/** The published paths that teach `bookId` — `[]` when none, or on failure. */
export async function learningPathsForBook(
  bookId: string | null | undefined,
): Promise<readonly PathRef[]> {
  return pathsForBook(await getPathMembership(), bookId);
}
