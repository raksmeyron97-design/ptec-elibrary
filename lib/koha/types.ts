/**
 * The Koha REST API shapes this integration reads, and a guard for each.
 *
 * Taken from the 26.05.x OpenAPI definitions (api/v1/swagger/definitions/*.yaml)
 * — only the fields we use, because a field we do not read is a field whose
 * absence must not reject a response. A guard answers one question: is this
 * body safe to hand to code that assumes the shape? A body that fails it is a
 * `bad_response`, never a silently partial record.
 *
 * Phase 1 needs only what the connection check reads. Biblios, items, patrons
 * and checkouts arrive with the read-only integration (Phase 2).
 */

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isStrOrNull = (v: unknown): v is string | null => v === null || typeof v === "string";

/** GET /status/version (26.05+), definitions/koha_version.yaml. */
export type KohaVersion = {
  version: string;
  major: string;
  minor: string;
  release: string;
  maintenance: string;
  development: string | null;
};

export function isKohaVersion(v: unknown): v is KohaVersion {
  return (
    isObject(v) &&
    isStr(v.version) && isStr(v.major) && isStr(v.minor) &&
    isStr(v.release) && isStr(v.maintenance) &&
    (v.development === undefined || isStrOrNull(v.development))
  );
}

/** GET /libraries, definitions/library.yaml (subset). */
export type KohaLibrary = {
  library_id: string;
  name: string;
};

export function isKohaLibrary(v: unknown): v is KohaLibrary {
  return isObject(v) && isStr(v.library_id) && v.library_id.length > 0 && isStr(v.name);
}

export function isKohaLibraryList(v: unknown): v is KohaLibrary[] {
  return Array.isArray(v) && v.every(isKohaLibrary);
}

/**
 * GET /biblios (JSON), definitions/biblio.yaml — the biblio and biblioitems
 * columns merged. `isbn` holds EVERY 020$a joined with " | " (C4/Biblio.pm
 * TransformMarcToKoha), which is why lookups match it with `-like`.
 */
export type KohaBiblioSummary = {
  biblio_id: number;
  title: string | null;
  author: string | null;
  isbn: string | null;
};

export function isKohaBiblioSummary(v: unknown): v is KohaBiblioSummary {
  return (
    isObject(v) && typeof v.biblio_id === "number" &&
    isStrOrNull(v.title ?? null) && isStrOrNull(v.author ?? null) && isStrOrNull(v.isbn ?? null)
  );
}

export function isKohaBiblioList(v: unknown): v is KohaBiblioSummary[] {
  return Array.isArray(v) && v.every(isKohaBiblioSummary);
}
