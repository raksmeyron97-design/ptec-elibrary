// lib/ask/resource-context.ts
// Which resource page the reader is on, for the assistant's retrieval scope.
//
// Pure and browser-safe, and separate from <AskWidget> so it can be tested
// without mounting the widget. It used to be a regex private to that widget,
// matching /books, /theses and /publications — and when journal articles moved
// to /journals/articles/<slug> (migration 0148, PR #203) nothing noticed that
// "Ask about this article" had silently fallen back to searching the whole
// library. The article prefix now comes from lib/journals/urls, the one module
// that knows the shape of an article URL.

import { ARTICLES_BASE_PATH } from "@/lib/journals/urls";

export type AskResourceContext = { slug: string; slugType: "book" | "research" | "publication" };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// `(?:\/km)?` because usePathname() from next/navigation keeps the locale.
// Articles are matched before the generic segments so a journal page
// (/journals/<journal>) — a collection, not a record — never scopes.
const PATTERN = new RegExp(
  `^(?:/km)?(?:${escape(ARTICLES_BASE_PATH)}|/(books|theses))/([^/?#]+)`,
);

export function resourceContext(pathname: string): AskResourceContext | null {
  const match = PATTERN.exec(pathname);
  if (!match) return null;
  let slug: string;
  try {
    slug = decodeURIComponent(match[2]);
  } catch {
    return null; // a malformed escape is not a slug worth scoping to
  }
  // /books/<slug>/read is still the book; "read" alone is not a slug.
  if (!slug || slug === "read") return null;
  const slugType = match[1] === "books" ? "book" : match[1] === "theses" ? "research" : "publication";
  return { slug, slugType };
}
