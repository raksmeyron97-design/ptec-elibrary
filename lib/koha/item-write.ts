/**
 * Phase 6: creating and editing Koha ITEMS (the e-Library's copies) from the
 * admin. Pure — the Koha client is injected; no database, no environment.
 *
 * Koha 26.05.03 (Koha/REST/V1/Biblios.pm add_item / update_item):
 *   • POST /biblios/{biblio_id}/items → 201 and the item. A barcode Koha
 *     already holds is refused with 409 "Duplicate barcode." — which makes a
 *     create SAFE TO REPEAT: a retry of a create that did happen meets its own
 *     barcode, finds the item on the same record, and takes it.
 *   • PUT /biblios/{biblio_id}/items/{item_id} → set_from_api: only the fields
 *     sent are changed, so an edit sends only what the librarian changed.
 *   • Koha::Item->store applies Koha's own rules to status changes: marking a
 *     lost copy found runs the "found" trigger (lost-item charges may be
 *     reversed), withdrawing a copy on loan may be refused. The e-Library
 *     applies them by writing through the same store, exactly as Koha's item
 *     editor does.
 *
 * The shelf is Koha's `location` (952$c), a code from Koha's own shelving-
 * location list (authorised values LOC, PTEC decision 2026-09-27). Koha has no
 * free-text shelf field — 952$j `shelving_control_number` is a NUMBER in the
 * 26.05 API — and a free-text `location` would be blanked by Koha's own item
 * editor. So only codes on that list are written, read live from Koha.
 *
 * The e-Library shows ONE status per copy; Koha keeps four independent flags.
 * statusPatch() changes only the flags that must change for the projection
 * (copyStatusOf) to read the new status back, so a flag that does not decide
 * it — a staff-collection code, say — survives.
 */
import { type CopyStatus, isKohaSettableStatus, type KohaSettableCopyStatus } from "@/lib/catalog";
import type { KohaClient } from "./client";
import { kohaPath } from "./client";
import { KohaError } from "./errors";
import { copyStatusOf, isKohaItem, isKohaItemList, projectItem, type KohaItem } from "./projection";
import { isAmbiguous } from "./biblio-write";

/** Koha item type for new copies — the one the PMB import gave every item (`--itemtype BK`). */
export const KOHA_DEFAULT_ITEM_TYPE = "BK";

/** One entry of Koha's shelving-location list. */
export interface KohaLocation { code: string; label: string }

const isLocationList = (v: unknown): v is { value: string; description: string; opac_description?: string | null }[] =>
  Array.isArray(v) && v.every((x) => !!x && typeof x === "object" && typeof (x as { value: unknown }).value === "string");

/** Koha's shelving locations (LOC). Needs only `catalogue`. */
export async function readLocations(koha: KohaClient): Promise<KohaLocation[]> {
  const r = await koha.get(kohaPath("/authorised_value_categories/{c}/authorised_values", { c: "LOC" }), isLocationList, {
    query: { _per_page: 500, _order_by: "+description" },
  });
  return r.data.map((a) => ({ code: a.value, label: (a.description || a.value).trim() }));
}

/**
 * A shelf value → its Koha code: a code on the list, or a list entry's LABEL
 * (what the e-Library's rows hold — the projection shows labels). Anything else
 * is not a Koha location, and null.
 */
export function locationCode(v: string | null | undefined, locations: KohaLocation[]): string | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  return locations.find((l) => l.code === t)?.code ?? locations.find((l) => l.label === t)?.code ?? null;
}

/** The copy fields the e-Library may change in Koha. */
export interface WritableCopyFields {
  barcode: string;
  callNumber: string | null;
  /** A Koha shelving-location code (or its label). Only codes on Koha's list are written. */
  shelfLocation: string | null;
  accessionNumber: string | null;
  status: CopyStatus;
}
export const WRITABLE_COPY_FIELDS = ["barcode", "callNumber", "shelfLocation", "accessionNumber", "status"] as const;
export type WritableCopyField = (typeof WRITABLE_COPY_FIELDS)[number];

type StatusFlags = Pick<KohaItem, "withdrawn" | "lost_status" | "damaged_status" | "not_for_loan_status" | "restricted_status">;

/**
 * The Koha flags to SEND so the item reads back as `target`, changing nothing
 * that does not decide it. Mirrors copyStatusOf's order: withdrawn → lost /
 * missing → damaged → not-for-loan (<0 processing, >0 reference) → available.
 */
export function statusPatch(current: StatusFlags, target: KohaSettableCopyStatus): Partial<StatusFlags> {
  const cur = {
    withdrawn: current.withdrawn ?? 0,
    lost_status: current.lost_status ?? 0,
    damaged_status: current.damaged_status ?? 0,
    not_for_loan_status: current.not_for_loan_status ?? 0,
    restricted_status: current.restricted_status ?? 0,
  };
  const want: Partial<StatusFlags> = {};
  const set = <K extends keyof typeof cur>(k: K, v: number) => { if (cur[k] !== v) want[k] = v; };
  const notWithdrawn = () => set("withdrawn", 0);
  const notLost = () => set("lost_status", 0);
  const notDamaged = () => set("damaged_status", 0);

  switch (target) {
    case "withdrawn":
      set("withdrawn", 1);
      break;
    case "lost":
      notWithdrawn();
      // Keep a more specific lost value (2 long overdue, 3 lost and paid) — but not a "missing" one.
      if (cur.lost_status === 0 || cur.lost_status === 4 || cur.lost_status === 5) set("lost_status", 1);
      break;
    case "missing":
      notWithdrawn();
      if (cur.lost_status !== 4 && cur.lost_status !== 5) set("lost_status", 4);
      break;
    case "damaged":
      notWithdrawn(); notLost();
      if (cur.damaged_status === 0) set("damaged_status", 1);
      break;
    case "processing":
      notWithdrawn(); notLost(); notDamaged();
      if (cur.not_for_loan_status >= 0) set("not_for_loan_status", -1);
      break;
    case "reference_only":
      notWithdrawn(); notLost(); notDamaged();
      // Keep a positive code (2 = staff collection) — any positive value reads as
      // reference — and a use restriction on a loanable copy. A negative code
      // (on order / processing) outranks both, so it is always replaced.
      if (cur.not_for_loan_status < 0 || (cur.not_for_loan_status === 0 && cur.restricted_status === 0)) set("not_for_loan_status", 1);
      break;
    case "available":
      notWithdrawn(); notLost(); notDamaged();
      set("not_for_loan_status", 0);
      set("restricted_status", 0);
      break;
  }
  return want;
}

/** The e-Library's view of a Koha item, in the writable fields. */
export function heldCopy(item: KohaItem): WritableCopyFields & { holdingLibrary: string | null; onLoan: boolean; locationCode: string | null } {
  const p = projectItem(item);
  return {
    barcode: p.barcode ?? "",
    callNumber: p.callNumber,
    shelfLocation: p.shelfLocation,
    locationCode: tidy(item.location),
    accessionNumber: p.accessionNumber,
    status: p.status,
    holdingLibrary: p.holdingLibrary,
    onLoan: !!item.checked_out_date,
  };
}

const tidy = (v: unknown) => (v === null || v === undefined ? null : String(v).replace(/[\s﻿]+/g, " ").trim() || null);
export const sameCopyField = (a: unknown, b: unknown) => tidy(a) === tidy(b);

/** The one Koha item with exactly this barcode (`_match=exact`: the default is a substring match — 0803 finds 30803). */
export async function findItemByBarcode(koha: KohaClient, barcode: string): Promise<KohaItem | null> {
  const r = await koha.get("/items", isKohaItemList, {
    query: { external_id: barcode, _match: "exact", _per_page: 2 },
    embed: ["+strings"],
  });
  return r.data.find((i) => tidy(i.external_id) === tidy(barcode)) ?? null;
}

// ── Create ───────────────────────────────────────────────────────────────────

export type CreateItemOutcome =
  /** `existed`: Koha already had this barcode on this record — a repeated create, taken rather than doubled. */
  | { kind: "created"; item: KohaItem; existed: boolean }
  | { kind: "barcode_taken"; barcode: string; biblioId: number | null }
  | { kind: "gone" }
  | { kind: "failed"; error: KohaError; ambiguous: boolean };

export async function createItem(
  koha: KohaClient,
  biblioId: number,
  fields: WritableCopyFields,
  opts: { libraryId: string | null; locations: KohaLocation[]; itemType?: string },
): Promise<CreateItemOutcome> {
  if (!tidy(fields.barcode)) {
    return { kind: "failed", ambiguous: false, error: new KohaError("invalid_request", "A copy in Koha needs a barcode.") };
  }
  if (!isKohaSettableStatus(fields.status)) {
    return { kind: "failed", ambiguous: false, error: new KohaError("invalid_request", `A new copy cannot start as "${fields.status}".`) };
  }
  const location = locationCode(fields.shelfLocation, opts.locations);
  if (tidy(fields.shelfLocation) && !location) {
    return { kind: "failed", ambiguous: false, error: new KohaError("invalid_request", `"${fields.shelfLocation}" is not one of Koha's shelving locations.`) };
  }
  const body: Record<string, unknown> = {
    external_id: tidy(fields.barcode),
    callnumber: tidy(fields.callNumber),
    location,
    inventory_number: tidy(fields.accessionNumber),
    item_type_id: opts.itemType ?? KOHA_DEFAULT_ITEM_TYPE,
    ...statusPatch({ withdrawn: 0, lost_status: 0, damaged_status: 0, not_for_loan_status: 0, restricted_status: 0 }, fields.status),
  };
  if (opts.libraryId) {
    body.home_library_id = opts.libraryId;
    body.holding_library_id = opts.libraryId;
  }
  for (const k of Object.keys(body)) if (body[k] === null) delete body[k];

  const path = kohaPath("/biblios/{id}/items", { id: biblioId });
  const takeExisting = async (): Promise<CreateItemOutcome | null> => {
    const existing = await findItemByBarcode(koha, fields.barcode);
    if (!existing) return null;
    return existing.biblio_id === biblioId
      ? { kind: "created", item: existing, existed: true }
      : { kind: "barcode_taken", barcode: fields.barcode, biblioId: existing.biblio_id };
  };
  try {
    const r = await koha.write("POST", path, body, isKohaItem);
    return { kind: "created", item: r.data, existed: false };
  } catch (e) {
    const error = e instanceof KohaError ? e : new KohaError("unreachable", `Koha call failed (POST ${path}).`);
    if (error.status === 409) {
      try {
        return (await takeExisting()) ?? { kind: "barcode_taken", barcode: fields.barcode, biblioId: null };
      } catch {
        return { kind: "barcode_taken", barcode: fields.barcode, biblioId: null };
      }
    }
    if (error.kind === "not_found") return { kind: "gone" };
    if (isAmbiguous(error)) {
      // Did it happen? The barcode says, at once — Koha stores the item before it answers.
      try {
        const taken = await takeExisting();
        if (taken) return taken;
        return { kind: "failed", error, ambiguous: false }; // not created: saving again is safe
      } catch {
        return { kind: "failed", error, ambiguous: true };
      }
    }
    return { kind: "failed", error, ambiguous: false };
  }
}

// ── Edit ─────────────────────────────────────────────────────────────────────

export type UpdateItemOutcome =
  | { kind: "unchanged"; item: KohaItem }
  | { kind: "updated"; item: KohaItem; changed: WritableCopyField[] }
  | { kind: "conflict"; conflicts: { field: WritableCopyField; koha: unknown; mine: unknown }[] }
  /** Its status is decided by Koha's circulation (on loan): not changed here. */
  | { kind: "on_loan" }
  | { kind: "barcode_taken"; barcode: string }
  /** The item is gone from Koha, or now belongs to another record. */
  | { kind: "gone" }
  | { kind: "failed"; error: KohaError; ambiguous: boolean };

/**
 * `base` is the copy as the e-Library last synced it (its own row), `next`
 * what the librarian submitted. Only fields where they differ are written; a
 * field Koha ALSO changed since the sync is a conflict, and nothing is written.
 */
export async function updateItem(
  koha: KohaClient,
  biblioId: number,
  itemId: number,
  base: WritableCopyFields,
  next: WritableCopyFields,
  locations: KohaLocation[],
): Promise<UpdateItemOutcome> {
  let item: KohaItem;
  try {
    item = (await koha.get(kohaPath("/items/{id}", { id: itemId }), isKohaItem, { embed: ["+strings"] })).data;
  } catch (e) {
    const error = e instanceof KohaError ? e : new KohaError("unreachable", "Koha call failed (GET /items).");
    return error.kind === "not_found" ? { kind: "gone" } : { kind: "failed", error, ambiguous: false };
  }
  if (item.biblio_id !== biblioId) return { kind: "gone" };
  const held = heldCopy(item);

  // Shelf compares as Koha CODES. A base the list cannot map (a legacy free-text
  // mark, a code since removed from the list) says nothing about Koha, so it
  // counts as what Koha holds — it cannot manufacture a conflict.
  if (tidy(next.shelfLocation) && !locationCode(next.shelfLocation, locations)) {
    return { kind: "failed", ambiguous: false, error: new KohaError("invalid_request", `"${next.shelfLocation}" is not one of Koha's shelving locations.`) };
  }
  const baseShelf = tidy(base.shelfLocation) ? locationCode(base.shelfLocation, locations) ?? held.locationCode : null;
  base = { ...base, shelfLocation: baseShelf };
  next = { ...next, shelfLocation: locationCode(next.shelfLocation, locations) };
  const heldCodes = { ...held, shelfLocation: held.locationCode };

  const changed = WRITABLE_COPY_FIELDS.filter((f) => !sameCopyField(next[f], base[f]));
  const conflicts = changed
    .filter((f) => !sameCopyField(heldCodes[f], base[f]) && !sameCopyField(heldCodes[f], next[f]))
    .map((f) => ({ field: f, koha: f === "shelfLocation" ? held.shelfLocation : held[f], mine: next[f] }));
  if (conflicts.length) return { kind: "conflict", conflicts };
  const toWrite = changed.filter((f) => !sameCopyField(heldCodes[f], next[f]));
  if (!toWrite.length) return { kind: "unchanged", item };

  const body: Record<string, unknown> = {};
  for (const f of toWrite) {
    if (f === "barcode") {
      if (!tidy(next.barcode)) return { kind: "failed", ambiguous: false, error: new KohaError("invalid_request", "A copy in Koha needs a barcode.") };
      body.external_id = tidy(next.barcode);
    } else if (f === "callNumber") body.callnumber = tidy(next.callNumber);
    else if (f === "shelfLocation") body.location = next.shelfLocation;
    else if (f === "accessionNumber") body.inventory_number = tidy(next.accessionNumber);
    else if (f === "status") {
      if (held.onLoan) return { kind: "on_loan" };
      if (!isKohaSettableStatus(next.status)) {
        return { kind: "failed", ambiguous: false, error: new KohaError("invalid_request", `"${next.status}" is set by Koha's circulation, not here.`) };
      }
      Object.assign(body, statusPatch(item, next.status));
    }
  }

  const path = kohaPath("/biblios/{b}/items/{i}", { b: biblioId, i: itemId });
  try {
    const r = await koha.write("PUT", path, body, isKohaItem);
    return { kind: "updated", item: r.data, changed: toWrite };
  } catch (e) {
    const error = e instanceof KohaError ? e : new KohaError("unreachable", `Koha call failed (PUT ${path}).`);
    if (error.status === 409 && /barcode/i.test(error.kohaReason ?? "")) return { kind: "barcode_taken", barcode: next.barcode };
    if (error.kind === "not_found") return { kind: "gone" };
    return { kind: "failed", error, ambiguous: isAmbiguous(error) };
  }
}

/** For tests and the action: the status an item's flags read as. */
export const statusOf = (flags: StatusFlags & Pick<KohaItem, "checked_out_date">) =>
  copyStatusOf({ ...flags, checked_out_date: flags.checked_out_date ?? null });
