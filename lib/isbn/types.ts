/**
 * Shared shapes for "Add by ISBN" (docs/KOHA-ISBN-WORKFLOW.md).
 *
 * A candidate is what ONE provider says about ONE edition. It is a draft for a
 * librarian to review — never written anywhere without a person pressing save
 * on the ordinary Add form.
 */

export const ISBN_PROVIDERS = ["open_library", "google_books"] as const;
export type IsbnProvider = (typeof ISBN_PROVIDERS)[number];

export type IsbnCandidate = {
  provider: IsbnProvider;
  /** The provider's own id for the edition (Open Library edition key, Google volume id). */
  providerRecordId: string;
  title: string;
  subtitle: string | null;
  /** Personal or corporate names, in the provider's order. */
  authors: string[];
  publisher: string | null;
  year: number | null;
  /** ISO 639-1-ish as the provider stated it ("en", "eng"), or null when it did not say. */
  language: string | null;
  pageCount: number | null;
  edition: string | null;
  /** Subject headings / categories — suggestions for keywords, never the PTEC category. */
  subjects: string[];
  description: string | null;
  // No cover field, on purpose: neither provider's image host can be shown
  // under the site's CSP (docs/KOHA-ISBN-WORKFLOW.md). Covers return when a
  // chosen image is copied into PTEC storage instead of hotlinked.
  isbn13: string;
  isbn10: string | null;
};

/** What happened when a provider was asked — shown to the librarian, one line each. */
export type ProviderOutcome =
  | { provider: IsbnProvider; status: "found"; count: number; cached: boolean }
  | { provider: IsbnProvider; status: "not_found"; cached: boolean }
  | { provider: IsbnProvider; status: "error"; kind: ProviderErrorKind; message: string }
  | { provider: IsbnProvider; status: "skipped"; message: string };

export type ProviderErrorKind = "quota" | "timeout" | "unreachable" | "http" | "bad_response";

/** One provider's answer for one ISBN. Errors are never cached; the other two are. */
export type ProviderResult =
  | { status: "found"; candidates: IsbnCandidate[] }
  | { status: "not_found" }
  | { status: "error"; kind: ProviderErrorKind; message: string };

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
