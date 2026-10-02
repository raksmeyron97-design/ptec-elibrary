// What the public journal page will show for a record, and what is missing —
// the admin form's Readiness panel and the list's completeness column read
// this one function, so the two cannot disagree. Pure.
//
// Every journal field is optional by design (nothing is invented), and the
// public page hides a block whose fact is unknown. Without this the editor
// could not see the consequence of an empty field: the block simply never
// appeared and nobody was told.

import { normalizeIssn } from "@/lib/seo/identifiers";
import type { Journal } from "@/lib/journals/types";

export type ReadinessCheckId =
  | "identity"
  | "issn"
  | "publisher"
  | "about"
  | "access"
  | "peerReview"
  | "indexing"
  | "facts"
  | "khmerTitleSource"
  | "website"
  | "cover";

export type ReadinessCheck = {
  id: ReadinessCheckId;
  ok: boolean;
  /** What a reader loses while this is missing. Weighted into the score. */
  weight: number;
};

export type JournalReadiness = {
  checks: ReadinessCheck[];
  /** 0–100, weighted. */
  score: number;
  /** An invalid ISSN is stored but never published — a warning, not a gap. */
  invalidIssns: string[];
  /** Why the page is or is not indexed by search engines. */
  indexing: "indexed" | "unpublished" | "optedOut" | "noArticles";
};

type ReadinessInput = Pick<
  Journal,
  | "title"
  | "title_km"
  | "title_km_source"
  | "issn"
  | "e_issn"
  | "print_issn"
  | "publisher_name"
  | "description"
  | "access_model"
  | "peer_review"
  | "indexed_in"
  | "language"
  | "country"
  | "frequency"
  | "website_url"
  | "cover_url"
  | "is_published"
  | "is_indexable"
> & { articleCount: number };

export function journalReadiness(j: ReadinessInput): JournalReadiness {
  const rawIssns = [j.issn, j.print_issn, j.e_issn].filter((v): v is string => !!v?.trim());
  const validIssns = rawIssns.filter((v) => normalizeIssn(v));
  const checks: ReadinessCheck[] = [
    { id: "identity", ok: !!j.title?.trim(), weight: 3 },
    { id: "issn", ok: validIssns.length > 0, weight: 3 },
    { id: "publisher", ok: !!j.publisher_name?.trim(), weight: 2 },
    { id: "about", ok: !!j.description?.trim(), weight: 2 },
    { id: "access", ok: !!j.access_model, weight: 2 },
    { id: "peerReview", ok: !!j.peer_review, weight: 1 },
    { id: "indexing", ok: j.indexed_in.length > 0, weight: 1 },
    { id: "facts", ok: !!(j.language && j.country && j.frequency), weight: 1 },
    // A Khmer title without a stated source is shown as a translation — the
    // safe reading — but the librarian should say which it is.
    { id: "khmerTitleSource", ok: !j.title_km || !!j.title_km_source, weight: 1 },
    { id: "website", ok: !!j.website_url, weight: 1 },
    { id: "cover", ok: !!j.cover_url, weight: 1 },
  ];
  const total = checks.reduce((s, c) => s + c.weight, 0);
  const got = checks.reduce((s, c) => s + (c.ok ? c.weight : 0), 0);
  return {
    checks,
    score: Math.round((got / total) * 100),
    invalidIssns: rawIssns.filter((v) => !normalizeIssn(v)),
    // Same rule as buildJournalMetadata (lib/seo/journal-seo.ts).
    indexing: !j.is_published ? "unpublished" : !j.is_indexable ? "optedOut" : j.articleCount === 0 ? "noArticles" : "indexed",
  };
}
