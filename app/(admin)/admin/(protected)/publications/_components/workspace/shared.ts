// Shared types + tiny helpers for the publication authoring workspace.

import type { PublicationReference } from "@/lib/publications";
import { summarizeReference } from "@/lib/publications/reference-metadata";

export type EditorLocale = "en" | "km";
export type EditorMode = "write" | "split" | "preview";

export const LOCALE_LABEL: Record<EditorLocale, string> = {
  en: "English",
  km: "Khmer",
};

/** Anchor source ids — must stay in lockstep with the public renderer. */
export const SOURCE_ID: Record<EditorLocale, string> = {
  en: "abstract-en",
  km: "abstract-km",
};

export const EDITOR_MODE_STORAGE_KEY = "ptec.pubws.mode";

/** Where the next citation will land. */
export interface InsertTarget {
  locale: EditorLocale;
  /** False until the administrator has placed a real caret in that editor. */
  ready: boolean;
}

export interface ReferenceCardDisplay {
  /** e.g. "DiBerardinis et al. (2013)" or the first words of the text. */
  shortCitation: string;
  /** Wrappable title line (never a single truncated line). */
  title: string;
  hasStructured: boolean;
}

/** Compact display for a reference card, preferring structured metadata. */
export function referenceCardDisplay(reference: PublicationReference): ReferenceCardDisplay {
  if (reference.meta) {
    const summary = summarizeReference(reference.meta);
    return {
      shortCitation: summary.shortCitation,
      title: summary.title,
      hasStructured: true,
    };
  }
  const clean = reference.text.replace(/\s+/g, " ").trim();
  // A formatted reference usually starts "Author, A. (Year). Title…" — use
  // the leading chunk as the citation line and the remainder as the title.
  const match = clean.match(/^(.{0,60}?\(\d{4}[a-z]?\))\.?\s*(.*)$/);
  if (match && match[2]) {
    return { shortCitation: match[1], title: match[2], hasStructured: false };
  }
  return {
    shortCitation: clean.length > 56 ? `${clean.slice(0, 53)}…` : clean || "Untitled reference",
    title: clean,
    hasStructured: false,
  };
}

/** Search haystack for the citation panel filter. */
export function referenceSearchText(reference: PublicationReference): string {
  const meta = reference.meta;
  const authorText = (meta?.authors ?? [])
    .map((author) =>
      typeof author === "string"
        ? author
        : [author.family, author.given, author.literal].filter(Boolean).join(" "),
    )
    .join(" ");
  return [
    reference.text,
    reference.doi,
    reference.url,
    meta?.title,
    meta?.containerTitle,
    meta?.organization,
    meta?.publisher,
    meta?.year,
    authorText,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("en");
}
