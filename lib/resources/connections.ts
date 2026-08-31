// lib/resources/connections.ts
//
// The edges of the internal link graph: given the plain strings a resource
// record carries (a category name, a byline), resolve the hub URLs that
// describe those entities.
//
// ── Why this is not a query ──────────────────────────────────────────────────
//
// Both lookups read caches that already exist for other reasons —
// getSubjectIndex() backs /subjects and the sitemap, getAuthorDirectory()
// backs /authors — so a resource detail page gains subject and author links
// for ZERO additional database round trips. Brief §31/§32: one normalized
// entity per request, not a second query per consumer.
//
// ── Why a link can be refused ────────────────────────────────────────────────
//
// A link is returned ONLY when the target has public resources attached. A
// subject with nothing in it, or an author with no public works, renders an
// empty page — linking to one would push crawl budget at a soft-404 and hand
// the reader a dead end. Unresolvable names simply render as plain text, the
// way they did before this module existed.

import "server-only";
import { getSubjectIndex } from "@/lib/subjects";
import { subjectKey } from "@/lib/subjects/matching";
import { getAuthorDirectory } from "@/lib/authors/directory";

export type HubLink = {
  /** The label to render — the name as the resource record spells it. */
  name: string;
  /** Locale-agnostic path, e.g. "/subjects/pedagogy". */
  href: string;
};

/** Case-folded comparison key, shared by both resolvers. */
function key(value: string | null | undefined): string {
  return subjectKey(value);
}

/**
 * Subject hub entries for the subject names a record carries, in the order
 * given, skipping any that do not match a subject with resources.
 *
 * Plural because the three resource types disagree: a book has ONE category, a
 * thesis has one `subject` column, and a publication carries a `subjects`
 * text[]. One resolver for all three beats a per-type variant.
 */
export async function resolveSubjectLinks(
  names: readonly (string | null | undefined)[],
): Promise<HubLink[]> {
  const index = await getSubjectIndex();
  const seen = new Set<string>();
  const out: HubLink[] = [];
  for (const name of names) {
    const k = key(name);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    const match = index.find((s) => key(s.name) === k && s.counts.total > 0);
    if (match) out.push({ name: match.name, href: `/subjects/${match.slug}` });
  }
  return out;
}

/**
 * Author hub entries for a byline, preserving the order the names were given.
 *
 * Exact-name matching only. A byline is free text and a partial match across
 * the roster would attribute one person's work to another — the failure mode
 * here is a wrong claim about a real named individual, so the resolver stays
 * strict and silently drops what it cannot identify.
 */
export async function resolveAuthorLinks(
  names: readonly (string | null | undefined)[],
): Promise<HubLink[]> {
  const wanted = names.map(key).filter(Boolean);
  if (wanted.length === 0) return [];

  const directory = await getAuthorDirectory();
  const byKey = new Map(
    directory.filter((a) => a.workCount > 0).map((a) => [key(a.name), a] as const),
  );

  const seen = new Set<string>();
  const out: HubLink[] = [];
  for (const k of wanted) {
    if (seen.has(k)) continue;
    seen.add(k);
    const match = byKey.get(k);
    if (match) out.push({ name: match.name, href: `/authors/${match.slug}` });
  }
  return out;
}
