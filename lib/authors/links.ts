// lib/authors/links.ts
//
// Validation and normalisation for an author's external scholarly profiles.
// Pure — used by the public page, the admin form's live preview, and the tests.
//
// The rule this enforces: an external profile link is published ONLY when it
// is a well-formed http(s) URL. A librarian who types "orcid" or "see my
// website" into the field gets nothing rendered rather than a link to
// https://library.ptec.edu.kh/orcid — a broken link on an academic's profile
// is worse than an absent one, and a `javascript:` URL pasted into an admin
// field would otherwise become a stored XSS vector on a public page.

import { normalizeOrcid, orcidUrl } from "@/lib/seo/identifiers";

export type AuthorLinkKind = "orcid" | "website" | "scholar" | "researchgate";

export interface AuthorLink {
  kind: AuthorLinkKind;
  /** Absolute, validated href. */
  href: string;
  /** What to display — the ORCID iD itself, or the bare host for the others. */
  label: string;
}

/**
 * C0/C1 control characters. Their presence disqualifies a URL outright: a
 * newline inside "java\nscript:alert(1)" is how such a payload gets past a
 * naive scheme prefix test, and no legitimate profile URL contains one.
 */
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

/**
 * Accept only absolute http(s) URLs. Rejects `javascript:`, `data:`, bare
 * words, and protocol-relative `//evil.example` (which a browser resolves
 * against the current scheme and would happily follow — `new URL()` rejects it
 * when no base is supplied, which is exactly why none is).
 */
export function safeExternalUrl(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  if (CONTROL_CHARS.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!url.hostname) return null;
  return url.toString();
}

/** The host, without a leading "www.", for display in place of a raw URL. */
export function displayHost(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return href;
  }
}

export interface AuthorLinkSource {
  orcid?: string | null;
  websiteUrl?: string | null;
  googleScholarUrl?: string | null;
  researchGateUrl?: string | null;
}

/**
 * The links this author actually has, in a stable order. An author with none
 * gets an empty array, and the page renders no link row at all rather than an
 * empty one.
 *
 * ORCID goes through normalizeOrcid/orcidUrl (which validate the iD's shape)
 * rather than safeExternalUrl, because the field stores the identifier, not a
 * URL — and an iD that fails validation must not be published as one.
 */
export function authorLinks(source: AuthorLinkSource): AuthorLink[] {
  const links: AuthorLink[] = [];

  const orcid = normalizeOrcid(source.orcid);
  const orcidHref = orcidUrl(source.orcid);
  if (orcid && orcidHref) {
    links.push({ kind: "orcid", href: orcidHref, label: orcid });
  }

  const website = safeExternalUrl(source.websiteUrl);
  if (website) links.push({ kind: "website", href: website, label: displayHost(website) });

  const scholar = safeExternalUrl(source.googleScholarUrl);
  if (scholar) links.push({ kind: "scholar", href: scholar, label: "Google Scholar" });

  const rg = safeExternalUrl(source.researchGateUrl);
  if (rg) links.push({ kind: "researchgate", href: rg, label: "ResearchGate" });

  return links;
}
