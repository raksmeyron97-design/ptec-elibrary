/**
 * Covers from Koha: a cover a librarian uploads in Koha (Tools › Upload local
 * cover image) shows on the e-Library too, so nobody uploads it twice.
 * Pure — no network, no database, no environment (the env is passed in).
 *
 * How Koha 26.05.03 keeps and serves them (measured on PTEC's Koha, 2026-10-03;
 * ptec-koha-deployment docs/10, 2.8):
 *   • Table `cover_images`: one row per image (imagenumber, biblionumber,
 *     the PNG Koha re-encodes the upload to, and a thumbnail). A replacement is
 *     a NEW imagenumber, so an image number's bytes never change.
 *   • The REST API has no cover route. The OPAC serves them anonymously:
 *     `/cgi-bin/koha/opac-image.pl?imagenumber=N` (and `&thumbnail=1`). For a
 *     record with no cover, `?biblionumber=N` answers 200 with a 43-byte 1×1
 *     GIF — "no cover" is NOT an error status. An unknown image number is a
 *     302 to the 404 page. Every answer is `Expires: now`: nothing caches it.
 *   • Which records have one: a PUBLIC saved report (PTEC's report 2) the OPAC
 *     serves as JSON, `/cgi-bin/koha/svc/report?id=2&annotated=1`, one row per
 *     record with its first image and `total`, the number of covered records —
 *     so a list Koha cut short (SvcMaxReportRows) is recognisable.
 *
 * Ownership. `catalog_books.cover_url` is the e-Library's (docs/KOHA-SYNC.md);
 * a librarian's own cover there always wins. The sync writes only covers it
 * owns: `cover_url` empty, or a path under KOHA_COVER_PATH_PREFIX. It sets
 * one, changes one when Koha's image changes, clears one Koha no longer has,
 * and never touches any other value.
 */

/** The e-Library route that serves a Koha cover (app/api/catalog-covers/[imageId]). */
export const KOHA_COVER_PATH_PREFIX = "/api/catalog-covers/";
const KOHA_COVER_PATH = /^\/api\/catalog-covers\/([1-9]\d{0,8})$/;

export const kohaCoverPath = (imageId: number) => `${KOHA_COVER_PATH_PREFIX}${imageId}`;

/** A cover_url the sync owns (it pointed it at a Koha cover). */
export const isKohaCoverPath = (url: string | null | undefined): boolean => KOHA_COVER_PATH.test((url ?? "").trim());

/** A positive integer image number, from a route segment; else null. */
export function parseCoverImageId(raw: string | null | undefined): number | null {
  const s = (raw ?? "").trim();
  if (!/^[1-9]\d{0,8}$/.test(s)) return null;
  return Number(s);
}

// ── Configuration ────────────────────────────────────────────────────────────

export interface KohaCoverConfig {
  enabled: boolean;
  /** The OPAC as this server reaches it (KOHA_OPAC_INTERNAL_URL), no trailing slash. */
  opacUrl: string;
  /** Koha's public saved report listing the covers (KOHA_COVER_REPORT_ID). */
  reportId: number | null;
  problems: string[];
}

/** next.config.ts's own default for the OPAC proxy (KOHA_OPAC_INTERNAL_URL). */
export const DEFAULT_KOHA_OPAC_INTERNAL_URL = "http://10.1.1.146:8480";

/**
 * KOHA_COVERS=on turns it on; it then needs KOHA_COVER_REPORT_ID. Off, the
 * sync writes no cover and the route serves none — deploying changes nothing.
 */
export function kohaCoverConfig(env: Record<string, string | undefined>): KohaCoverConfig {
  const on = (env.KOHA_COVERS ?? "").trim().toLowerCase() === "on";
  const rawUrl = (env.KOHA_OPAC_INTERNAL_URL ?? "").trim() || DEFAULT_KOHA_OPAC_INTERNAL_URL;
  const problems: string[] = [];
  let opacUrl = DEFAULT_KOHA_OPAC_INTERNAL_URL;
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") problems.push("KOHA_OPAC_INTERNAL_URL must use http or https.");
    else if (u.username || u.password || u.search || u.hash) problems.push("KOHA_OPAC_INTERNAL_URL must be a plain origin.");
    else opacUrl = rawUrl.replace(/\/+$/, "");
  } catch {
    problems.push("KOHA_OPAC_INTERNAL_URL is not a valid URL.");
  }
  const reportId = parseCoverImageId(env.KOHA_COVER_REPORT_ID);
  if (on && reportId === null) problems.push("KOHA_COVER_REPORT_ID is not set (Koha's public report of local covers).");
  return { enabled: on && problems.length === 0, opacUrl, reportId, problems };
}

export const kohaCoverReportUrl = (cfg: Pick<KohaCoverConfig, "opacUrl" | "reportId">) =>
  `${cfg.opacUrl}/cgi-bin/koha/svc/report?id=${cfg.reportId}&annotated=1`;

export const kohaCoverImageUrl = (opacUrl: string, imageId: number) =>
  `${opacUrl}/cgi-bin/koha/opac-image.pl?imagenumber=${imageId}`;

// ── The report ───────────────────────────────────────────────────────────────

export interface KohaCoverList {
  /** Koha record id → its first cover's image number. */
  covers: Map<number, number>;
  /** Every covered record is in the list (rows = `total`). Only a complete list may CLEAR a cover. */
  complete: boolean;
}

const posInt = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * Koha's annotated report answer → the list, or null when it is not what the
 * report returns (then the sync changes nothing: a misread must never clear
 * covers). An empty array is a real answer: no record has a cover.
 */
export function parseKohaCoverReport(json: unknown): KohaCoverList | null {
  if (!Array.isArray(json)) return null;
  const covers = new Map<number, number>();
  let total: number | null = json.length === 0 ? 0 : null;
  for (const row of json) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    const r = row as Record<string, unknown>;
    const biblio = posInt(r.biblionumber);
    const image = posInt(r.imagenumber);
    const t = r.total === undefined ? null : posInt(r.total);
    if (biblio === null || image === null) return null;
    if (t !== null) total = total === null ? t : Math.max(total, t);
    const prev = covers.get(biblio);
    covers.set(biblio, prev === undefined ? image : Math.min(prev, image));
  }
  return { covers, complete: total !== null && covers.size >= total };
}

// ── The plan ─────────────────────────────────────────────────────────────────

export interface CoverRow { id: string; koha_biblio_id: number | null; cover_url: string | null }
export interface CoverChange { id: string; from: string | null; to: string | null }

export interface CoverPlan {
  changes: CoverChange[];
  /** Records with a cover in Koha whose e-Library cover is a librarian's own: left alone. */
  ownCoverKept: number;
  /** Covers that would have been cleared but the list was incomplete. */
  clearsSkipped: number;
}

export function planKohaCovers(rows: readonly CoverRow[], list: KohaCoverList): CoverPlan {
  const plan: CoverPlan = { changes: [], ownCoverKept: 0, clearsSkipped: 0 };
  for (const row of rows) {
    if (!Number.isInteger(row.koha_biblio_id)) continue;
    const current = (row.cover_url ?? "").trim() || null;
    const image = list.covers.get(row.koha_biblio_id as number);
    if (current && !isKohaCoverPath(current)) {
      if (image !== undefined) plan.ownCoverKept++;
      continue;
    }
    const want = image !== undefined ? kohaCoverPath(image) : null;
    if (want === current) continue;
    if (want === null && !list.complete) { plan.clearsSkipped++; continue; }
    // `from` is the value as stored ("" stays ""): the write is a compare-and-set on it.
    plan.changes.push({ id: row.id, from: row.cover_url ?? null, to: want });
  }
  return plan;
}

// ── The image route ──────────────────────────────────────────────────────────

/** Koha's "no cover" answer: a 1×1 GIF of 43 bytes. Anything that small is not a cover. */
export const KOHA_NO_COVER_MAX_BYTES = 64;
/** Larger than any cover Koha keeps (it re-encodes uploads); a guard, not a limit librarians meet. */
export const KOHA_COVER_MAX_BYTES = 5 * 1024 * 1024;
const COVER_TYPES = /^image\/(png|jpeg|gif|webp)\b/i;

export type CoverAnswer =
  | { kind: "image"; contentType: string }
  /** Koha has no such cover (deleted or never): 404, cached briefly. */
  | { kind: "missing" }
  /** Koha did not answer properly: 502, not cached. */
  | { kind: "upstream_error" };

export function decideCoverAnswer(upstream: { status: number; contentType: string | null; bytes: number }): CoverAnswer {
  const { status, bytes } = upstream;
  const type = (upstream.contentType ?? "").split(";")[0].trim().toLowerCase();
  if (status === 301 || status === 302 || status === 303 || status === 404) return { kind: "missing" };
  if (status !== 200) return { kind: "upstream_error" };
  if (!COVER_TYPES.test(type)) return { kind: "upstream_error" };
  if (bytes <= KOHA_NO_COVER_MAX_BYTES) return { kind: "missing" };
  if (bytes > KOHA_COVER_MAX_BYTES) return { kind: "upstream_error" };
  return { kind: "image", contentType: type };
}

/** An image number's bytes never change (a replacement is a new number). */
export const COVER_CACHE_IMAGE = "public, max-age=604800, immutable";
export const COVER_CACHE_MISSING = "public, max-age=300";
export const COVER_CACHE_ERROR = "no-store";
