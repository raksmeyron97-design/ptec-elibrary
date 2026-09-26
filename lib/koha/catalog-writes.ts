/**
 * The admin's door to Koha record writes (Phase 5). Server-only: it holds the
 * configured client. The rules live in biblio-write.ts (pure, tested); this
 * file only binds them to the running server's Koha, and answers the questions
 * the catalog actions and pages ask.
 */
import "server-only";
import { getKohaClient, getKohaConfig } from "./index";
import { kohaCanRead, kohaCanWrite, kohaStaffLinks } from "./config";
import { createBiblio, readBiblioFields, updateBiblio } from "./biblio-write";
import type { WritableBookFields } from "./marc-write";

/** Records are written to Koha first: KOHA_INTEGRATION=write, fully configured. */
export const kohaWritesRecords = () => kohaCanWrite(getKohaConfig());

/**
 * Koha owns a LINKED record's copies and the fields derived from them (call
 * number, department) whenever the integration is on — read or write — since
 * the sync overwrites them from Koha either way.
 */
export const kohaOwnsLinkedRecords = () => kohaCanRead(getKohaConfig());

/** Links into Koha's staff interface (KOHA_STAFF_URL), or null. */
export const kohaStaffLinksFor = (biblioId: number) => kohaStaffLinks(getKohaConfig().staffUrl, biblioId);

export const createInKoha = (fields: WritableBookFields & { ddc?: string | null }, opts: { confirmNotDuplicate?: boolean; recheckExisting?: boolean }) =>
  createBiblio(getKohaClient(), fields, opts);

export const updateInKoha = (biblioId: number, base: WritableBookFields, next: WritableBookFields) =>
  updateBiblio(getKohaClient(), biblioId, base, next);

export const readKohaRecord = (biblioId: number) => readBiblioFields(getKohaClient(), biblioId);
