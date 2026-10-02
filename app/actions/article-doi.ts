"use server";

// "Start from a DOI" for the article editor (decision 2026-10-02: the library
// INDEXES articles). Two steps, and the split is the consent:
//
//   lookupArticleDoi()       READ-ONLY. Fetches the article's Crossref record,
//                            checks the library does not hold the DOI already,
//                            and says which journal, authors and affiliations
//                            already exist here. Writes nothing.
//   prepareDoiAuthorships()  Runs only when the librarian presses "Use these
//                            details": creates the author and affiliation
//                            records the preview listed as new, and returns the
//                            authorship rows for the form. The article itself is
//                            still saved by the normal Save.
//
// Identity is exact, never fuzzy: an author is the record with the same ORCID,
// else the one record with exactly the same name (either name order —
// publishers swap given and family for East Asian names). Two records with one
// name is ambiguous and matches neither: the librarian picks in Authors.

import { requirePermission } from "@/lib/auth/requireAdmin";
import { rateLimit } from "@/lib/rate-limit";
import { SITE_URL } from "@/lib/seo/site";
import { normalizeDoi, isValidDoi } from "@/lib/publications/citations";
import { parseCrossrefArticle, type ArticleFromDoi, type DoiAuthor } from "@/lib/publications/doi-article";
import {
  AUTHOR_SELECT_FULL,
  AUTHOR_SELECT_LEGACY,
  isMissingColumnError,
  type PublicationAuthor,
} from "@/lib/publications";
import { upsertPublicationAffiliation, upsertPublicationAuthor } from "@/app/actions/publications";
import { logAdminAction } from "@/app/actions/audit";

export type DoiAuthorMatch = { id: string; fullName: string; by: "orcid" | "name" | "reversed-name" };

export type DoiAuthorPreview = DoiAuthor & {
  match: DoiAuthorMatch | null;
  /** More than one record carries this exact name: nothing is matched. */
  ambiguous: boolean;
  /** Each deposited affiliation, with the existing record of the same name (if any). */
  affiliationMatches: { name: string; id: string | null }[];
};

export type ArticleDoiLookup =
  | {
      status: "ok";
      article: ArticleFromDoi;
      /** The journal record whose ISSN (or exact title) the article names. */
      journal: { id: string; title: string; slug: string } | null;
      authors: DoiAuthorPreview[];
      /** A publication in the library already carries this DOI. */
      duplicate: { id: string; slug: string; title: string } | null;
    }
  | { status: "invalid" | "rate_limited" | "unavailable" | "forbidden" }
  | { status: "not_found"; doi: string };

/** `%`, `_` and `\` are pattern characters in ILIKE; an identifier must match literally. */
const likeLiteral = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function lookupArticleDoi(rawDoi: string): Promise<ArticleDoiLookup> {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("publications", "write");
  } catch {
    return { status: "forbidden" };
  }
  const doi = normalizeDoi(rawDoi);
  if (!doi || !isValidDoi(doi)) return { status: "invalid" };

  const [perUser, global] = await Promise.all([
    rateLimit(`doi-article:${admin.userId}`, 10, 60_000),
    rateLimit("doi-article:global", 40, 60_000),
  ]);
  if (!perUser.success || !global.success) return { status: "rate_limited" };

  let article: ArticleFromDoi | null;
  try {
    const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
      headers: { Accept: "application/json", "User-Agent": `PTEC-eLibrary/1.0 (${SITE_URL})` },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (response.status === 404) return { status: "not_found", doi };
    if (response.status === 429) return { status: "rate_limited" };
    if (!response.ok) return { status: "unavailable" };
    article = parseCrossrefArticle(await response.json());
  } catch {
    return { status: "unavailable" };
  }
  if (!article) return { status: "unavailable" };

  const { supabase } = admin;
  const names = [...new Set(article.authors.flatMap((a) => [a.fullName, a.reversedName].filter((n): n is string => !!n)))];
  const orcids = [...new Set(article.authors.map((a) => a.orcid).filter((o): o is string => !!o))];
  const affiliationNames = [...new Set(article.authors.flatMap((a) => a.affiliations))];
  const issnList = article.issns.join(",");

  const [dup, journalsByIssn, byName, byOrcid, affiliations] = await Promise.all([
    supabase.from("publications").select("id, slug, title").ilike("doi", likeLiteral(article.doi)).limit(1),
    article.issns.length > 0
      ? supabase
          .from("journals")
          .select("id, title, slug")
          .or(`issn.in.(${issnList}),print_issn.in.(${issnList}),e_issn.in.(${issnList})`)
          .limit(2)
      : Promise.resolve({ data: [], error: null }),
    names.length > 0
      ? supabase.from("publication_authors").select("id, full_name").in("full_name", names).limit(100)
      : Promise.resolve({ data: [], error: null }),
    orcids.length > 0
      ? supabase.from("publication_authors").select("id, full_name, orcid").in("orcid", orcids).limit(100)
      : Promise.resolve({ data: [], error: null }),
    affiliationNames.length > 0
      ? supabase.from("publication_affiliations").select("id, name").in("name", affiliationNames).limit(200)
      : Promise.resolve({ data: [], error: null }),
  ]);

  // Journal: by ISSN, or failing that an exact (case-insensitive) title.
  let journal = ((journalsByIssn.data ?? []) as { id: string; title: string; slug: string }[]).length === 1
    ? (journalsByIssn.data as { id: string; title: string; slug: string }[])[0]
    : null;
  if (!journal && article.journalTitle) {
    const { data } = await supabase
      .from("journals")
      .select("id, title, slug")
      .ilike("title", likeLiteral(article.journalTitle))
      .limit(2);
    if (data && data.length === 1) journal = data[0] as { id: string; title: string; slug: string };
  }

  const nameRows = (byName.data ?? []) as { id: string; full_name: string }[];
  const orcidRows = (byOrcid.data ?? []) as { id: string; full_name: string; orcid: string }[];
  const affRows = (affiliations.data ?? []) as { id: string; name: string }[];

  const authors: DoiAuthorPreview[] = article.authors.map((a) => {
    const affiliationMatches = a.affiliations.map((name) => ({
      name,
      id: affRows.find((r) => r.name === name)?.id ?? null,
    }));
    const byOrcidRow = a.orcid ? orcidRows.find((r) => r.orcid === a.orcid) : undefined;
    if (byOrcidRow) {
      return { ...a, match: { id: byOrcidRow.id, fullName: byOrcidRow.full_name, by: "orcid" }, ambiguous: false, affiliationMatches };
    }
    for (const [candidate, by] of [
      [a.fullName, "name"],
      [a.reversedName, "reversed-name"],
    ] as const) {
      if (!candidate) continue;
      const hits = nameRows.filter((r) => r.full_name === candidate);
      if (hits.length > 1) return { ...a, match: null, ambiguous: true, affiliationMatches };
      if (hits.length === 1) {
        return { ...a, match: { id: hits[0].id, fullName: hits[0].full_name, by }, ambiguous: false, affiliationMatches };
      }
    }
    return { ...a, match: null, ambiguous: false, affiliationMatches };
  });

  const duplicate = ((dup.data ?? []) as { id: string; slug: string; title: string }[])[0] ?? null;
  return { status: "ok", article, journal, authors, duplicate };
}

export type PrepareAuthorInput = {
  fullName: string;
  orcid: string | null;
  /** An existing record chosen in the preview; null creates one. */
  matchId: string | null;
  affiliations: { name: string; id: string | null }[];
};

export type PreparedAuthorship = {
  author: PublicationAuthor;
  is_corresponding: boolean;
  affiliation_ids: string[];
};

/**
 * Create the author and affiliation records the preview listed as new, in
 * order, and return authorship rows for the form. Nothing about the ARTICLE
 * is written here — that is the form's Save.
 */
export async function prepareDoiAuthorships(
  input: PrepareAuthorInput[],
): Promise<{ ok: true; rows: PreparedAuthorship[]; created: { authors: number; affiliations: number } } | { ok: false; error: string }> {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("publications", "write");
  } catch {
    return { ok: false, error: "You do not have permission to add authors." };
  }
  if (input.length > 100) return { ok: false, error: "Too many authors." };
  const { supabase, userId } = admin;

  // Affiliations first: an author row needs their ids. One record per name.
  const affiliationIds = new Map<string, string>();
  let createdAffiliations = 0;
  for (const a of input.flatMap((x) => x.affiliations)) {
    if (a.id) {
      affiliationIds.set(a.name, a.id);
      continue;
    }
    if (affiliationIds.has(a.name)) continue;
    const { data, error } = await upsertPublicationAffiliation({ name: a.name });
    if (error || !data) return { ok: false, error: error ?? `Could not create the affiliation "${a.name}".` };
    affiliationIds.set(a.name, data.id);
    createdAffiliations += 1;
  }

  const authorIds: string[] = [];
  let createdAuthors = 0;
  for (const a of input) {
    if (a.matchId) {
      authorIds.push(a.matchId);
      continue;
    }
    const { data, error } = await upsertPublicationAuthor({ full_name: a.fullName, orcid: a.orcid });
    if (error || !data) return { ok: false, error: error ?? `Could not create the author "${a.fullName}".` };
    authorIds.push(data.id);
    createdAuthors += 1;
  }

  const read = (select: string) => supabase.from("publication_authors").select(select).in("id", authorIds);
  let { data, error } = await read(AUTHOR_SELECT_FULL);
  if (isMissingColumnError(error)) ({ data, error } = await read(AUTHOR_SELECT_LEGACY));
  if (error) return { ok: false, error: error.message };
  const byId = new Map(((data ?? []) as unknown as PublicationAuthor[]).map((a) => [a.id, a]));

  const rows: PreparedAuthorship[] = [];
  input.forEach((a, i) => {
    const author = byId.get(authorIds[i]);
    if (!author) return;
    rows.push({
      author,
      // Crossref does not say who corresponds; the librarian sets it.
      is_corresponding: false,
      affiliation_ids: a.affiliations.map((x) => affiliationIds.get(x.name)).filter((v): v is string => !!v),
    });
  });

  if (createdAuthors + createdAffiliations > 0) {
    await logAdminAction(userId, "publication.doi_import_people", "publication_authors", undefined, {
      created_authors: createdAuthors,
      created_affiliations: createdAffiliations,
    });
  }
  return { ok: true, rows, created: { authors: createdAuthors, affiliations: createdAffiliations } };
}

/** The PTEC-staff flag (0162) of each author, for the Authors step's switches. Unknown ids are absent. */
export async function getPtecStaffFlags(ids: string[]): Promise<Record<string, boolean>> {
  const { supabase } = await requirePermission("publications", "read");
  const clean = [...new Set(ids)].slice(0, 100);
  if (clean.length === 0) return {};
  const { data, error } = await supabase.from("publication_authors").select("id, is_ptec_staff").in("id", clean);
  if (error) return {};
  return Object.fromEntries(((data ?? []) as { id: string; is_ptec_staff: boolean | null }[]).map((r) => [r.id, r.is_ptec_staff === true]));
}

/**
 * Flag an author as PTEC staff — what puts them in "PTEC authors in this
 * journal" on every journal page they publish in. A fact about the PERSON,
 * saved at once, not with the article.
 */
export async function setAuthorPtecStaff(id: string, value: boolean): Promise<{ ok: boolean; error?: string }> {
  const { supabase, userId } = await requirePermission("publications", "write");
  const { data, error } = await supabase
    .from("publication_authors")
    .update({ is_ptec_staff: value })
    .eq("id", id)
    .select("id, slug");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "That author no longer exists." };
  await logAdminAction(userId, "publication_author.ptec_staff", "publication_authors", id, { value });
  return { ok: true };
}
