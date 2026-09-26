/**
 * Phase 5: creating and editing Koha bibliographic records from the e-Library.
 * Pure — the Koha client is injected; no database, no environment.
 *
 * Koha is the system of record, so every write goes to Koha FIRST and the
 * e-Library saves its own copy only from what Koha accepted (the admin
 * actions do that). The rules here:
 *
 *   • Create: POST /biblios. Koha runs its own duplicate check (FindDuplicate,
 *     Koha/REST/V1/Biblios.pm) and answers 400 "Duplicate biblio N"; that is
 *     returned as a `duplicate` outcome for a librarian to decide, and only an
 *     explicit override sends x-confirm-not-duplicate.
 *   • Edit: GET the record, change only the fields the librarian changed
 *     (marc-write.ts), PUT it back. PUT replaces the whole record and Koha
 *     offers no version check, so this module does its own three-way check:
 *     a field the librarian changed that Koha ALSO changed since the e-Library
 *     last synced (Koha's value ≠ the e-Library's) is a conflict, and nothing
 *     is written. Fields the librarian did not touch go back as Koha has them.
 *   • A write that timed out, dropped, or met a 5xx may have happened. It is
 *     reported as `ambiguous` and never repeated here.
 */
import { normalizeIsbn, validateIsbn } from "@/lib/catalog";
import type { KohaClient } from "./client";
import { kohaPath } from "./client";
import { KohaError } from "./errors";
import { editBiblioMarc, newBiblioMarc, WRITABLE_BOOK_FIELDS, type WritableBookFields, type WritableField } from "./marc-write";
import { isMarcInJson, projectBiblio, type MarcInJson } from "./projection";
import { isKohaBiblioList, isKohaBiblioSummary } from "./types";

/** The item type new records carry in 942$c — the one the PMB import used (`--itemtype BK`). */
export const KOHA_DEFAULT_ITEM_TYPE = "BK";

const isIdBody = (v: unknown): v is { id: number } =>
  !!v && typeof v === "object" && Number.isInteger((v as { id: unknown }).id) && (v as { id: number }).id > 0;

/** The projection's own ISBN rule, so writer and reader agree on which 020 is "the ISBN". */
export const isValidIsbn = (raw: string) => {
  const v = validateIsbn(normalizeIsbn(raw));
  return v.ok && !!v.normalized;
};

/** A timeout, a dropped connection or a 5xx: Koha may or may not have applied the write. */
export const isAmbiguous = (e: KohaError) => e.kind === "timeout" || e.kind === "unreachable" || e.kind === "server";

const norm = (f: WritableField, v: unknown): string | number | null => {
  if (v === null || v === undefined) return null;
  if (f === "year") return typeof v === "number" ? v : Number(v) || null;
  const s = String(v).replace(/[\s﻿]+/g, " ").trim();
  if (!s) return null;
  if (f === "isbn") return normalizeIsbn(s) || null;
  return s;
};
export const sameField = (f: WritableField, a: unknown, b: unknown) => norm(f, a) === norm(f, b);

export function pickWritable(src: Partial<Record<WritableField, unknown>>): WritableBookFields {
  return {
    title: String(src.title ?? ""),
    author: (src.author as string | null) ?? null,
    isbn: (src.isbn as string | null) ?? null,
    publisher: (src.publisher as string | null) ?? null,
    year: (src.year as number | null) ?? null,
    language: (src.language as WritableBookFields["language"]) ?? "other",
    category: (src.category as string | null) ?? null,
  };
}

/** What the projection makes of a record — the fields as Koha now holds them. */
function heldBy(rec: MarcInJson, biblioId: number): WritableBookFields | null {
  const withId: MarcInJson = rec.fields.some((f) => "999" in f)
    ? rec
    : { ...rec, fields: [...rec.fields, { "999": { ind1: " ", ind2: " ", subfields: [{ c: String(biblioId) }] } }] };
  const p = projectBiblio(withId);
  return p ? pickWritable(p) : null;
}

// ── Create ───────────────────────────────────────────────────────────────────

export type CreateOutcome =
  | { kind: "created"; biblioId: number; fields: WritableBookFields }
  /**
   * `possiblyOurs`: found by the exact-title recheck after an ambiguous create —
   * most likely the record that create made before its answer was lost.
   */
  | { kind: "duplicate"; biblioId: number | null; title: string | null; author: string | null; possiblyOurs?: boolean }
  | { kind: "failed"; error: KohaError; ambiguous: boolean };

/**
 * Koha records with exactly this title (and author, when given), read from
 * Koha's DATABASE through the REST API. Koha's own FindDuplicate cannot stand
 * in for this after a lost answer: it queries the search index, which does not
 * hold a record until the indexer has run, and it strips ( ) " \ from the title
 * it searches for while the index keeps them — so a title with parentheses
 * never matches itself (C4::Search::FindDuplicate, 26.05.03).
 */
export async function findExactTitle(koha: KohaClient, title: string, author: string | null): Promise<{ biblioId: number; title: string | null; author: string | null }[]> {
  const r = await koha.get("/biblios", isKohaBiblioList, {
    query: { q: JSON.stringify({ "me.title": title.replace(/[\s﻿]+/g, " ").trim() }), _per_page: 20, _order_by: "+biblio_id" },
  });
  const want = norm("author", author);
  return r.data
    .filter((b) => want === null || norm("author", b.author) === want)
    .map((b) => ({ biblioId: b.biblio_id, title: b.title, author: b.author }));
}

export async function createBiblio(
  koha: KohaClient,
  fields: WritableBookFields & { ddc?: string | null },
  opts: {
    confirmNotDuplicate?: boolean;
    /** The previous attempt's outcome was unknown: first look for the record it may have made. */
    recheckExisting?: boolean;
    entered?: Date;
    itemType?: string;
  } = {},
): Promise<CreateOutcome> {
  if (opts.recheckExisting && !opts.confirmNotDuplicate) {
    try {
      const found = await findExactTitle(koha, fields.title, fields.author);
      if (found.length) return { kind: "duplicate", ...found[found.length - 1], possiblyOurs: true };
    } catch (e) {
      // Cannot tell whether it exists: do NOT create blind.
      const error = e instanceof KohaError ? e : new KohaError("unreachable", "Koha call failed (GET /biblios).");
      return { kind: "failed", error, ambiguous: true };
    }
  }
  const record = newBiblioMarc(fields, { itemType: opts.itemType ?? KOHA_DEFAULT_ITEM_TYPE, entered: opts.entered ?? new Date() });
  try {
    const r = await koha.write("POST", "/biblios", record, isIdBody, { confirmNotDuplicate: opts.confirmNotDuplicate });
    const biblioId = r.data.id;
    return { kind: "created", biblioId, fields: heldBy(record, biblioId) ?? pickWritable(fields) };
  } catch (e) {
    const error = e instanceof KohaError ? e : new KohaError("unreachable", "Koha call failed (POST /biblios).");
    const dup = error.status === 400 ? /^Duplicate biblio (\d+)?/.exec(error.kohaReason ?? "") : null;
    if (dup) {
      const biblioId = dup[1] ? Number(dup[1]) : null;
      let title: string | null = null;
      let author: string | null = null;
      if (biblioId) {
        try {
          const s = await koha.get(kohaPath("/biblios/{id}", { id: biblioId }), isKohaBiblioSummary);
          title = s.data.title;
          author = s.data.author;
        } catch {
          // The match is still reported; only its label is missing.
        }
      }
      return { kind: "duplicate", biblioId, title, author };
    }
    return { kind: "failed", error, ambiguous: isAmbiguous(error) };
  }
}

// ── Read one ─────────────────────────────────────────────────────────────────

/**
 * The fields of one Koha record as the projection reads them — used to finish
 * a create whose Koha half succeeded but whose e-Library half did not: the
 * e-Library's row is then built from what Koha HOLDS, not from a resubmitted form.
 */
export async function readBiblioFields(
  koha: KohaClient,
  biblioId: number,
): Promise<{ kind: "found"; fields: WritableBookFields } | { kind: "gone" } | { kind: "failed"; error: KohaError }> {
  const path = kohaPath("/biblios/{id}", { id: biblioId });
  try {
    const rec = (await koha.get(path, isMarcInJson, { accept: "application/marc-in-json" })).data;
    const fields = heldBy(rec, biblioId);
    return fields ? { kind: "found", fields } : { kind: "failed", error: new KohaError("bad_response", `Koha's record ${biblioId} has no title this integration can read.`) };
  } catch (e) {
    const error = e instanceof KohaError ? e : new KohaError("unreachable", `Koha call failed (GET ${path}).`);
    return error.kind === "not_found" ? { kind: "gone" } : { kind: "failed", error };
  }
}

// ── Edit ─────────────────────────────────────────────────────────────────────

export interface FieldConflict { field: WritableField; koha: unknown; mine: unknown }

export type UpdateOutcome =
  | { kind: "unchanged"; fields: WritableBookFields }
  | { kind: "updated"; fields: WritableBookFields; changed: WritableField[] }
  | { kind: "conflict"; conflicts: FieldConflict[] }
  | { kind: "gone" }
  | { kind: "locked" }
  | { kind: "failed"; error: KohaError; ambiguous: boolean };

/**
 * `base` is the record as the e-Library last synced it (its own row), `next`
 * what the librarian submitted. Only fields where they differ are written.
 */
export async function updateBiblio(
  koha: KohaClient,
  biblioId: number,
  base: WritableBookFields,
  next: WritableBookFields,
): Promise<UpdateOutcome> {
  const path = kohaPath("/biblios/{id}", { id: biblioId });
  let current: MarcInJson;
  try {
    current = (await koha.get(path, isMarcInJson, { accept: "application/marc-in-json" })).data;
  } catch (e) {
    const error = e instanceof KohaError ? e : new KohaError("unreachable", `Koha call failed (GET ${path}).`);
    if (error.kind === "not_found") return { kind: "gone" };
    // A failed READ changed nothing: not ambiguous.
    return { kind: "failed", error, ambiguous: false };
  }
  const held = heldBy(current, biblioId);
  if (!held) return { kind: "failed", error: new KohaError("bad_response", `Koha's record ${biblioId} has no title this integration can read.`), ambiguous: false };

  const changed = WRITABLE_BOOK_FIELDS.filter((f) => !sameField(f, next[f], base[f]));
  if (!changed.length) return { kind: "unchanged", fields: held };

  const conflicts = changed
    .filter((f) => !sameField(f, held[f], base[f]) && !sameField(f, held[f], next[f]))
    .map((f) => ({ field: f, koha: held[f], mine: next[f] }));
  if (conflicts.length) return { kind: "conflict", conflicts };

  // A change Koha already holds (made there too, or by an earlier save whose
  // answer was lost) needs no write.
  const toWrite = changed.filter((f) => !sameField(f, held[f], next[f]));
  if (!toWrite.length) return { kind: "unchanged", fields: held };

  const changes: Partial<WritableBookFields> = {};
  for (const f of toWrite) (changes as Record<string, unknown>)[f] = next[f];
  const edited = editBiblioMarc(current, changes, { isValidIsbn });
  try {
    await koha.write("PUT", path, edited, isIdBody);
  } catch (e) {
    const error = e instanceof KohaError ? e : new KohaError("unreachable", `Koha call failed (PUT ${path}).`);
    if (error.kind === "not_found") return { kind: "gone" };
    if (error.kind === "forbidden" && /locked record/i.test(error.kohaReason ?? "")) return { kind: "locked" };
    return { kind: "failed", error, ambiguous: isAmbiguous(error) };
  }
  return { kind: "updated", fields: heldBy(edited, biblioId) ?? held, changed: toWrite };
}
