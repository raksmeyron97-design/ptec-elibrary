// lib/ai/citation-source.ts
// A finished reference for one record, built from the catalogue's own fields.
// Server-only.
//
// No model is involved and none should be: `lib/citations.ts` already holds
// the six formatters this library uses, and the three per-type adapters that
// normalise a book, a thesis and a publication into one `CitationWork`. The
// assistant's job here is to fetch the record and hand it to them — anything
// else would be a second, unverifiable citation implementation whose output
// nobody could check against the record page's own "Cite" panel.
//
// Missing fields stay missing. A book with no publisher gets a reference
// without one, because inventing "PTEC" as the publisher of a Routledge
// textbook is a fabricated bibliographic fact, not a formatting choice.

import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { getOrgIdentity } from "@/lib/system-settings/config";
import { BOOK_SELECT, mapRowToBook } from "@/lib/books";
import { mapRowToPublication } from "@/lib/publications";
import { bookToCitationWork, hasCitableMetadata } from "@/lib/books/citation";
import { thesisToCitationWork } from "@/lib/theses/citation";
import {
  apa,
  inTextReference,
  publicationToCitationWork,
  type CitationWork,
} from "@/lib/citations";
import type { EvidenceRecordType } from "./evidence";
import type { Source } from "./response";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface CitationSource {
  work: CitationWork;
  title: string;
  /** Full APA reference. Other formats are on the record page's cite panel. */
  reference: string;
  /** Application URL for the record — never a storage URL. */
  url: string;
}

/**
 * The reference for one published record, or null when the record cannot
 * support one. `hasCitableMetadata` is the gate: a title alone is not a
 * citation, and formatting one anyway produces something that looks
 * authoritative and says nothing.
 */
export async function getCitationSource(
  recordType: EvidenceRecordType,
  recordId: string,
): Promise<CitationSource | null> {
  const db = createServiceClient();

  if (recordType === "book") {
    const { data } = await db
      .from("books")
      .select(BOOK_SELECT)
      .eq("id", recordId)
      .eq("is_published", true)
      .maybeSingle();
    if (!data) return null;
    const book = mapRowToBook(data as any);
    const work = bookToCitationWork(book);
    if (!hasCitableMetadata(work)) return null;
    return { work, title: book.title, reference: apa(work), url: `/books/${book.slug}` };
  }

  if (recordType === "research") {
    const { data } = await db
      .from("research_reports")
      .select("*")
      .eq("id", recordId)
      .eq("is_published", true)
      .maybeSingle();
    if (!data) return null;
    const row = data as any;
    const ref = row.slug ?? row.id;
    const org = await getOrgIdentity();
    const work = thesisToCitationWork(row, ref, org.institutionName);
    if (!hasCitableMetadata(work)) return null;
    return { work, title: row.title, reference: apa(work), url: `/theses/${ref}` };
  }

  const { data } = await db
    .from("publications")
    .select("*")
    .eq("id", recordId)
    .eq("is_published", true)
    .maybeSingle();
  if (!data) return null;
  const publication = mapRowToPublication(data as any);
  const work = publicationToCitationWork(publication);
  if (!hasCitableMetadata(work)) return null;
  return { work, title: publication.title, reference: apa(work), url: `/publications/${publication.slug}` };
}

/**
 * References for the records an answer cited, keyed `recordType:recordId`.
 * One query per type, not one per source — an answer citing four pages of one
 * book must not cost four lookups.
 */
export async function getCitationSources(
  records: readonly { recordType: EvidenceRecordType; recordId: string }[],
): Promise<Map<string, CitationSource>> {
  const unique = new Map<string, { recordType: EvidenceRecordType; recordId: string }>();
  for (const r of records) unique.set(`${r.recordType}:${r.recordId}`, r);

  const out = new Map<string, CitationSource>();
  await Promise.all(
    [...unique.entries()].map(async ([key, r]) => {
      try {
        const source = await getCitationSource(r.recordType, r.recordId);
        if (source) out.set(key, source);
      } catch (err) {
        // A citation that cannot be built is omitted; the source still renders
        // with its title, page and link. Never fail the answer over it.
        console.error("[ai/citation-source]", err instanceof Error ? err.message : err);
      }
    }),
  );
  return out;
}

/** "(Dawson, 2019, p. 42)" for a cited page. */
export function pageReference(work: CitationWork, page: number): string {
  return inTextReference(work, page);
}

/**
 * Fill in the copyable reference on the sources an answer actually cited.
 *
 * Runs AFTER grounding, so a hallucinated citation never triggers a lookup,
 * and only for the records that survived — an answer citing four pages of one
 * book costs one query. A source whose record cannot produce a citation keeps
 * its title, page and link; the copy affordance is simply absent, which is
 * honest about a record that has no year and no author.
 */
export async function attachReferences(sources: readonly Source[]): Promise<Source[]> {
  const citable = sources.filter(
    (s): s is Source & { recordType: EvidenceRecordType; recordId: string } =>
      Boolean(s.recordId) && (s.recordType === "book" || s.recordType === "research" || s.recordType === "publication"),
  );
  if (citable.length === 0) return [...sources];

  const map = await getCitationSources(citable);
  return sources.map((s) => {
    const found = s.recordId && s.recordType ? map.get(`${s.recordType}:${s.recordId}`) : undefined;
    if (!found) return s;
    return {
      ...s,
      reference: found.reference,
      citation: s.page === undefined ? undefined : inTextReference(found.work, s.page),
    };
  });
}
