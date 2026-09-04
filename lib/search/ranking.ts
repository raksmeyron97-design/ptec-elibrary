// The search relevance model — ONE documented place that decides how a result
// scores and how a result list is ordered. `/api/search/native` builds
// candidates and calls into here; nothing else may score a search result.
//
// The model, strongest signal first (docs/search-ranking.md):
//
//   exact title > exact ISBN > title prefix > title contains
//   > exact author > author contains > exact subject > subject contains
//   > keywords > abstract/body > PDF page text > per-term partial matches
//   > popularity (views, downloads, rating) > recency
//
// Two rules are structural, not tuning:
//
//  1. RELEVANCE DOMINATES POPULARITY. The popularity and recency boosts are
//     capped at POPULARITY_CAP_RATIO of the relevance score they ride on, so
//     a heavily-viewed record with a weak match can reorder only within a
//     narrow band of equally-weak matches and can never overtake a stronger
//     field match. A record that matched nothing gets no boost at all.
//  2. EVERY SORT IS A TOTAL ORDER. `compareBySort` ends in the record id, so
//     two requests for the same page return the same page — pagination and
//     the benchmark both depend on that.
//
// Pure and browser-safe on purpose: no DB, no `server-only`, so the tests and
// scripts/search-benchmark.ts exercise the real function.

import {
  boundedEditDistance,
  isbnEquals,
  normalizeSearchText,
  queryIsbn,
  tokenizeSearchQuery,
  typoTolerance,
} from "./normalize";

export type SearchResultType = "book" | "research" | "publication" | "catalog" | "learning_path" | "post";
export type ActiveSearchType = "all" | SearchResultType;
export type SearchSort = "relevance" | "newest" | "oldest" | "title" | "views" | "downloads" | "rating";

/** Fields the scorer reports as "why this result" (`matchedFields`). */
export type MatchedField =
  | "title"
  | "isbn"
  | "author"
  | "subject"
  | "keywords"
  | "abstract"
  | "pdf"
  | "text"
  | "curated";

export type SearchResult = {
  id: string;
  ref: string;
  type: SearchResultType;
  title: string;
  author: string;
  coverUrl: string | null;
  url: string;
  year?: number | null;
  department?: string | null;
  language?: string | null;
  category?: string | null;
  subject?: string | null;
  isbn?: string | null;
  publisher?: string | null;
  rating?: number | null;
  views?: number;
  downloadCount?: number;
  excerpt?: string | null;
  keywords?: string[];
  format?: string | null;
  /** One of AVAILABILITY_VALUES (lib/search/availability.ts). */
  availability?: string | null;
  /** Physical catalog only, from the record's own copy counters. */
  copiesAvailable?: number | null;
  copiesTotal?: number | null;
  shelfLocation?: string | null;
  score?: number;
  matchedFields?: string[];
  /** Learning-path variant only: total steps, module count, and estimated minutes. */
  pathSteps?: number;
  pathModules?: number;
  pathDurationMin?: number | null;
  actions?: {
    view?: string;
    read?: string;
    download?: string;
    cite?: string;
    save?: string;
  };
};

/** A result plus the text the scorer reads. The route strips these before
 *  the response leaves the server. */
export type Candidate = SearchResult & {
  searchableText: string;
  titleText: string;
  authorText: string;
  subjectText: string;
  keywordText: string;
  bodyText: string;
  dateValue: number;
  popularityValue: number;
};

export const RANKING_WEIGHTS = {
  titleExact: 260,
  isbnExact: 250,
  titlePrefix: 190,
  titleContains: 145,
  authorExact: 125,
  authorContains: 96,
  subjectExact: 100,
  subjectContains: 74,
  keywords: 60,
  abstract: 30,
  termTitle: 22,
  termAuthor: 18,
  termSubject: 14,
  termKeywords: 10,
  termAbstract: 6,
  /** A query term one typo away from a title word ("practicl" ~ "practical"). */
  termTitleFuzzy: 16,
  pdfPage: 42,
  anyText: 8,
  /** Ceiling of the three popularity components together (8 + 10 + 7.5). */
  popularityMax: 25.5,
  recencyMax: 5,
} as const;

/** Popularity + recency may add at most this fraction of the relevance score. */
export const POPULARITY_CAP_RATIO = 0.25;

/** The query, prepared once per request rather than once per candidate. */
export type PreparedQuery = {
  raw: string;
  normalized: string;
  /** Normalized terms other than the whole query, for partial credit. */
  terms: string[];
  /** Canonical ISBN when the whole query is one, else null. */
  isbn: string | null;
};

export function prepareQuery(raw: string): PreparedQuery {
  const normalized = normalizeSearchText(raw);
  const terms = tokenizeSearchQuery(raw)
    .map(normalizeSearchText)
    .filter((t) => t && t !== normalized);
  return { raw, normalized, terms: Array.from(new Set(terms)), isbn: queryIsbn(raw) };
}

export function pageHitKey(type: string, id: string): string {
  return `${type}:${id}`;
}

/**
 * Relevance of one candidate for one query. Returns the candidate as a
 * `SearchResult` with `score` and `matchedFields` set and the scorer-only
 * text fields removed.
 */
export function searchScore(row: Candidate, query: PreparedQuery, pageHitIds: ReadonlySet<string>): SearchResult {
  const q = query.normalized;
  const matched = new Set<MatchedField>();
  let relevance = 0;

  const title = normalizeSearchText(row.titleText);
  const author = normalizeSearchText(row.authorText);
  const subject = normalizeSearchText(row.subjectText);
  const keywords = normalizeSearchText(row.keywordText);
  const body = normalizeSearchText(row.bodyText);

  const bump = (amount: number, field: MatchedField) => {
    relevance += amount;
    matched.add(field);
  };

  if (q) {
    if (title === q) bump(RANKING_WEIGHTS.titleExact, "title");
    else if (title.startsWith(q)) bump(RANKING_WEIGHTS.titlePrefix, "title");
    else if (title.includes(q)) bump(RANKING_WEIGHTS.titleContains, "title");

    if (query.isbn && isbnEquals(row.isbn, query.isbn)) bump(RANKING_WEIGHTS.isbnExact, "isbn");

    if (author === q) bump(RANKING_WEIGHTS.authorExact, "author");
    else if (author.includes(q)) bump(RANKING_WEIGHTS.authorContains, "author");

    if (subject === q) bump(RANKING_WEIGHTS.subjectExact, "subject");
    else if (subject.includes(q)) bump(RANKING_WEIGHTS.subjectContains, "subject");

    if (keywords.includes(q)) bump(RANKING_WEIGHTS.keywords, "keywords");
    if (body.includes(q)) bump(RANKING_WEIGHTS.abstract, "abstract");
  }

  let titleWords: string[] | null = null;
  for (const term of query.terms) {
    let hit = false;
    if (title.includes(term)) { bump(RANKING_WEIGHTS.termTitle, "title"); hit = true; }
    if (author.includes(term)) { bump(RANKING_WEIGHTS.termAuthor, "author"); hit = true; }
    if (subject.includes(term)) { bump(RANKING_WEIGHTS.termSubject, "subject"); hit = true; }
    if (keywords.includes(term)) { bump(RANKING_WEIGHTS.termKeywords, "keywords"); hit = true; }
    if (body.includes(term)) { bump(RANKING_WEIGHTS.termAbstract, "abstract"); hit = true; }
    if (hit) continue;

    // Typo tolerance, title words only, bounded: a term that matched nothing
    // anywhere may still be one edit from a word in the title.
    const tolerance = typoTolerance(term);
    if (tolerance === 0) continue;
    titleWords ??= title.split(" ").filter((w) => w.length >= 4);
    if (titleWords.some((w) => boundedEditDistance(term, w, tolerance) <= tolerance)) {
      bump(RANKING_WEIGHTS.termTitleFuzzy, "title");
    }
  }

  if (pageHitIds.has(pageHitKey(row.type, row.id))) bump(RANKING_WEIGHTS.pdfPage, "pdf");
  if (relevance === 0 && q && normalizeSearchText(row.searchableText).includes(q)) bump(RANKING_WEIGHTS.anyText, "text");

  const popularity =
    (Math.min(row.views ?? 0, 1200) / 1200) * 8 +
    (Math.min(row.downloadCount ?? 0, 800) / 800) * 10 +
    Math.min(Number(row.rating ?? 0), 5) * 1.5;
  const age = row.year ? Math.max(0, new Date().getFullYear() - row.year) : null;
  const recency = age === null ? 0 : Math.max(0, RANKING_WEIGHTS.recencyMax - age * 0.35);
  const boost = Math.min(popularity + recency, relevance * POPULARITY_CAP_RATIO);

  const score = Math.round((relevance + boost) * 100) / 100;

  return {
    ...row,
    score,
    matchedFields: Array.from(matched),
    searchableText: undefined,
    titleText: undefined,
    authorText: undefined,
    subjectText: undefined,
    keywordText: undefined,
    bodyText: undefined,
    dateValue: undefined,
    popularityValue: undefined,
  } as SearchResult;
}

const byScore = (a: SearchResult, b: SearchResult) => (b.score ?? 0) - (a.score ?? 0);
const byId = (a: SearchResult, b: SearchResult) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Total order for every sort mode. Each mode's own key first, then relevance,
 * then the record id — never a tie left to the input order.
 */
export function compareBySort(a: SearchResult, b: SearchResult, sort: SearchSort): number {
  switch (sort) {
    case "newest":
      return (b.year ?? 0) - (a.year ?? 0) || byScore(a, b) || byId(a, b);
    case "oldest":
      return (a.year ?? 9999) - (b.year ?? 9999) || byScore(a, b) || byId(a, b);
    case "title":
      return a.title.localeCompare(b.title, undefined, { sensitivity: "base" }) || byScore(a, b) || byId(a, b);
    case "views":
      return (b.views ?? 0) - (a.views ?? 0) || byScore(a, b) || byId(a, b);
    case "downloads":
      return (b.downloadCount ?? 0) - (a.downloadCount ?? 0) || byScore(a, b) || byId(a, b);
    case "rating":
      return (b.rating ?? 0) - (a.rating ?? 0) || byScore(a, b) || byId(a, b);
    case "relevance":
    default:
      return byScore(a, b) || (b.views ?? 0) - (a.views ?? 0) || byId(a, b);
  }
}

export function parseSort(value: string | null): SearchSort {
  if (value === "newest" || value === "oldest" || value === "title" || value === "views" || value === "downloads" || value === "rating") {
    return value;
  }
  if (value === "most_viewed") return "views";
  if (value === "most_downloaded") return "downloads";
  if (value === "top_rated") return "rating";
  return "relevance";
}
