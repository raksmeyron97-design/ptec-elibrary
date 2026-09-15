// lib/search/suggestion-href.ts
// Where a picked search suggestion goes. One definition for every surface that
// shows /api/books/suggestions results — the /books search box
// (components/ui/search/useBookSuggestions.ts) and the phone search overlay —
// so the same suggestion cannot open one page from one box and another page
// from the other.
//
// Locale-less on purpose: callers navigate through i18n/navigation, which adds
// the /km prefix.

import type { Suggestion } from "@/app/api/books/suggestions/route";
import { articlePath } from "@/lib/journals/urls";

/** The detail page a suggestion names, or null when it names none — an author
 *  or a subject, which the caller turns into a search for its label. */
export function suggestionDetailHref(s: Suggestion): string | null {
  switch (s.type) {
    case "book":
      return `/books/${s.slug}`;
    case "research":
      return `/theses/${s.slug ?? s.id}`;
    case "publication":
      return articlePath(s.slug);
    case "catalog":
      return `/catalogs/${s.slug}`;
    case "learning_path":
      return `/paths/${s.slug}`;
    case "post":
      return `/posts/${s.slug}`;
    case "author":
    case "category":
      return null;
  }
}
