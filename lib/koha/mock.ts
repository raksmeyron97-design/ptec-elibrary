/**
 * An in-process fake Koha, for KOHA_INTEGRATION=mock and for tests.
 *
 * It is a `fetch`, not a stub of our client: the real client code — URL
 * building, token handling, headers, status mapping, validation — runs
 * unchanged against it, so mock mode proves the same path a real instance
 * will take. It answers the way the 26.05 API does (paths, bodies, the
 * `X-Total-Count` header, `{ error }` bodies, 401 without a bearer token) for
 * the endpoints the integration uses so far, and 404s everything else — a
 * route the mock does not know is one the integration must not rely on yet.
 *
 * No network, no persistence, no real data. Fixtures are fictional.
 */
import type { FetchLike } from "./auth";
import type { KohaBiblioSummary, KohaLibrary, KohaVersion } from "./types";
import type { KohaItem, MarcDataField, MarcInJson } from "./projection";

export const MOCK_KOHA_BASE_URL = "http://koha.mock";
export const MOCK_KOHA_VERSION: KohaVersion = {
  version: "26.05.03.000",
  major: "26",
  minor: "05",
  release: "26.05",
  maintenance: "26.05.03",
  development: null,
};
export const MOCK_KOHA_LIBRARIES: KohaLibrary[] = [{ library_id: "PTEC", name: "PTEC Library" }];
/** A fictional record whose ISBN (valid check digit) exists only in the mock. */
export const MOCK_KOHA_BIBLIOS: KohaBiblioSummary[] = [
  { biblio_id: 1, title: "Mock Koha record", author: "PTEC Test", isbn: "9780000000002 | 0000000000" },
];

/** Koha's sample shelving locations (installer "auth_val"), as [code, label]. */
export const MOCK_KOHA_LOCATIONS: [string, string][] = [["GEN", "General stacks"], ["REF", "Reference"], ["CART", "Book cart"], ["STAFF", "Staff office"]];

/** Paths the mock serves that declare the integer request-id header in 26.05. */
const REQUEST_ID_PATHS = new Set(["/api/v1/libraries", "/api/v1/biblios"]);

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

export interface MockKoha {
  baseUrl: string;
  fetch: FetchLike;
  /** Every call the mock received, for assertions. */
  calls: { method: string; path: string; headers: Record<string, string> }[];
  /**
   * Records written through POST/PUT /biblios (Phase 5), by biblio id, as
   * Koha stores them. Tests may edit one to play "a cataloguer changed it in
   * Koha meanwhile".
   */
  records: Map<number, MarcInJson>;
  /** Items written through POST/PUT /biblios/{id}/items (Phase 6), by item id. Tests may edit one. */
  items: Map<number, KohaItem>;
}

type Sf = Record<string, string>;
const sub = (rec: MarcInJson, tag: string, code: string): string | null => {
  for (const f of rec.fields) {
    const v = f[tag];
    if (v && typeof v !== "string") for (const sf of (v as MarcDataField).subfields) if (typeof sf[code] === "string") return sf[code];
  }
  return null;
};
/** What Koha stores: its own ids in 999 $c/$d, and no item fields (ModBiblio strips 952). */
function stored(rec: MarcInJson, id: number): MarcInJson {
  const fields = rec.fields.filter((f) => !("999" in f) && !("952" in f));
  fields.push({ "999": { ind1: " ", ind2: " ", subfields: [{ c: String(id) } as Sf, { d: String(id) } as Sf] } });
  return { leader: rec.leader, fields };
}

export function createMockKoha(
  opts: {
    libraries?: KohaLibrary[];
    version?: KohaVersion | null;
    biblios?: KohaBiblioSummary[];
    /** false = the API user has `catalogue` only, as in Phase 2 (writes answer 403). */
    canWrite?: boolean;
    /** Record ids Koha reports as locked (403 on update). */
    locked?: number[];
    /** false = the API user lacks edit_items (Phase 6 writes answer 403). */
    canWriteItems?: boolean;
    /** false = the API user lacks the read-only borrowers permissions (Phase 7/8 reads answer 403). */
    canReadPatrons?: boolean;
    /**
     * The PTEC Reader Services plugin (Phase 10). Absent = not installed, so its
     * routes are Koha's plain 404; "forbidden" = installed, but the API user
     * lacks its permission (403 with no error_code). Checkouts may carry the
     * mock-only fields `max_renewals` (default 2) and `on_reserve`.
     */
    readerServices?: "on" | "forbidden";
    /**
     * A renewal answered 502 — "applied" after Koha renewed it (the answer was
     * lost), "not_applied" before. What a timeout looks like from outside.
     */
    renewalFault?: "applied" | "not_applied";
    /** Patrons, their loans and holds, as Koha's API returns them (Phase 7/8). */
    patrons?: Record<string, unknown>[];
    checkouts?: Record<string, unknown>[];
    holds?: Record<string, unknown>[];
  } = {},
): MockKoha {
  const libraries = opts.libraries ?? MOCK_KOHA_LIBRARIES;
  const biblios = opts.biblios ?? MOCK_KOHA_BIBLIOS;
  const version = opts.version === undefined ? MOCK_KOHA_VERSION : opts.version;
  const calls: MockKoha["calls"] = [];
  const records = new Map<number, MarcInJson>();
  const items = new Map<number, KohaItem>();
  let nextBiblio = 1000;
  let nextItem = 5000;
  /** The API's item fields the e-Library may send (item.yaml: additionalProperties false). */
  const ITEM_WRITABLE = new Set(["external_id", "callnumber", "location", "inventory_number", "item_type_id",
    "home_library_id", "holding_library_id", "withdrawn", "lost_status", "damaged_status", "not_for_loan_status", "restricted_status"]);
  let issued = 0;
  const live = new Set<string>();

  const fetch: FetchLike = async (input, init) => {
    const url = new URL(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    calls.push({ method, path: url.pathname + url.search, headers });

    if (url.origin !== MOCK_KOHA_BASE_URL) throw new TypeError(`mock Koha: refused ${url.origin}`);

    if (url.pathname === "/api/v1/oauth/token" && method === "POST") {
      if (!headers.authorization?.startsWith("Basic ")) return json(400, { error: "Missing client credentials" });
      if (!String(init?.body ?? "").includes("grant_type=client_credentials")) return json(400, { error: "Unimplemented grant type" });
      const token = `mock-token-${++issued}`;
      live.add(token);
      return json(200, { access_token: token, token_type: "Bearer", expires_in: 3600 });
    }

    const bearer = headers.authorization?.replace(/^Bearer /, "");
    if (!bearer || !live.has(bearer)) return json(401, { error: "Authentication failure." });

    // Koha 26.05 declares x-koha-request-id as `type: integer` on these paths
    // (swagger.yaml request_id_header) and rejects anything else — verbatim
    // body below, captured from a live 26.05.03. Not on /status/version, which
    // is why a UUID once passed the version check and failed everything else.
    const requestId = headers["x-koha-request-id"];
    if (REQUEST_ID_PATHS.has(url.pathname) && requestId !== undefined && !/^-?\d+$/.test(requestId)) {
      return json(400, { errors: [{ message: "Expected integer - got string.", path: "/x-koha-request-id" }], status: 400 });
    }

    // ── Phase 7/8: patron reads (list_borrowers, view_checkout_history, view_holds_history) ──
    const patronRead = /^\/api\/v1\/patrons(?:\/(\d+)\/(checkouts|holds))?$/.exec(url.pathname);
    if (method === "GET" && patronRead) {
      if (opts.canReadPatrons === false) {
        const need = patronRead[2] === "checkouts" ? "view_checkout_history" : patronRead[2] === "holds" ? "view_holds_history" : "list_borrowers";
        return json(403, { error: "Authorization failure. Missing required permission(s).", required_permissions: { borrowers: need } });
      }
      const all = opts.patrons ?? [];
      if (!patronRead[1]) {
        const card = url.searchParams.get("cardnumber");
        const exact = url.searchParams.get("_match") === "exact";
        const hits = all.filter((p) => card === null || (exact ? p.cardnumber === card : String(p.cardnumber ?? "").includes(card)));
        return json(200, hits, { "X-Total-Count": String(hits.length) });
      }
      const pid = Number(patronRead[1]);
      if (!all.some((p) => p.patron_id === pid)) return json(404, { error: "Patron not found", error_code: "not_found" });
      if (patronRead[2] === "checkouts") {
        const embedItem = (headers["x-koha-embed"] ?? "").split(",").includes("item");
        const mine = (opts.checkouts ?? []).filter((c) => c.patron_id === pid)
          .map((c) => (embedItem ? { ...c, item: items.get(c.item_id as number) ?? c.item ?? null } : c));
        return json(200, mine);
      }
      return json(200, (opts.holds ?? []).filter((h) => h.patron_id === pid));
    }

    // ── Phase 10: the PTEC Reader Services plugin, as its Controller.pm answers ──
    const reader = /^\/api\/v1\/contrib\/ptec\/patrons\/(\d+)\/checkouts\/(\d+)\/(renewability|renewal)$/.exec(url.pathname);
    if (reader && ((reader[3] === "renewability" && method === "GET") || (reader[3] === "renewal" && method === "POST"))) {
      if (!opts.readerServices) return json(404, { error: "Not found." });
      if (opts.readerServices === "forbidden") {
        return json(403, { error: "Authorization failure. Missing required permission(s).", required_permissions: { circulate: "override_renewals" } });
      }
      const pid = Number(reader[1]);
      const cid = Number(reader[2]);
      if (!(opts.patrons ?? []).some((p) => p.patron_id === pid)) return json(404, { error: "Refused: patron_not_found", error_code: "patron_not_found" });
      const co = (opts.checkouts ?? []).find((c) => c.checkout_id === cid && c.patron_id === pid);
      if (!co) return json(404, { error: "Refused: checkout_not_found", error_code: "checkout_not_found" });
      const max = Number.isInteger(co.max_renewals) ? (co.max_renewals as number) : 2;
      const count = Number.isInteger(co.renewals_count) ? (co.renewals_count as number) : 0;
      const code = co.on_reserve === true ? "on_reserve" : count >= max ? "too_many" : null;
      if (reader[3] === "renewability") {
        return json(200, { checkout_id: cid, allows_renewal: code === null, error_code: code, renewals_count: count, max_renewals: max, soonest_renew_date: null, due_date: co.due_date ?? null });
      }
      if (opts.renewalFault === "not_applied") return json(502, { error: "Bad gateway" });
      if (code) return json(403, { error: `Refused: ${code}`, error_code: code });
      const due = new Date(Date.parse(String(co.due_date ?? new Date().toISOString())) + 14 * 86_400_000).toISOString();
      co.renewals_count = count + 1;
      co.due_date = due;
      if (opts.renewalFault === "applied") return json(502, { error: "Bad gateway" });
      return json(201, { checkout_id: cid, due_date: due, renewals_count: count + 1 });
    }

    // ── Phase 6: item writes, as Koha 26.05.03's Biblios#add_item / #update_item answer ──
    const itemsOf = /^\/api\/v1\/biblios\/(\d+)\/items(?:\/(\d+))?$/.exec(url.pathname);
    if (itemsOf && (method === "POST" || method === "PUT")) {
      const need = opts.canWriteItems === false || opts.canWrite === false;
      if (need) return json(403, { error: "Authorization failure. Missing required permission(s).", required_permissions: { editcatalogue: "edit_items" } });
      const bid = Number(itemsOf[1]);
      if (!records.has(bid) && !biblios.some((b) => b.biblio_id === bid)) return json(404, { error: "Bibliographic record not found", error_code: "not_found" });
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(String(init?.body ?? ""));
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("not an object");
      } catch {
        return json(400, { errors: [{ message: "Expected object - got null.", path: "/body" }], status: 400 });
      }
      const extra = Object.keys(body).find((k) => !ITEM_WRITABLE.has(k));
      if (extra) return json(400, { errors: [{ message: `Properties not allowed: ${extra}.`, path: "/body" }], status: 400 });
      const barcode = typeof body.external_id === "string" ? body.external_id : null;
      const iid = itemsOf[2] ? Number(itemsOf[2]) : null;
      if (barcode && [...items.values()].some((it) => it.external_id === barcode && it.item_id !== iid)) {
        return json(409, { error: "Duplicate barcode." });
      }
      if (iid === null) {
        const id = nextItem++;
        const item: KohaItem = {
          item_id: id, biblio_id: bid, external_id: barcode, callnumber: null, home_library_id: null, holding_library_id: null,
          location: null, collection_code: null, checked_out_date: null, not_for_loan_status: 0,
          lost_status: 0, damaged_status: 0, withdrawn: 0, restricted_status: 0, inventory_number: null, timestamp: new Date().toISOString(),
          ...(body as Partial<KohaItem>),
        };
        items.set(id, item);
        return json(201, item, { Location: `/api/v1/items/${id}` });
      }
      const cur = items.get(iid);
      if (!cur || cur.biblio_id !== bid) return json(404, { error: "Item not found", error_code: "not_found" });
      // set_from_api: only the fields sent change.
      const updated = { ...cur, ...(body as Partial<KohaItem>), timestamp: new Date().toISOString() };
      items.set(iid, updated);
      return json(200, updated);
    }
    if (method === "GET" && url.pathname === "/api/v1/authorised_value_categories/LOC/authorised_values") {
      return json(200, MOCK_KOHA_LOCATIONS.map(([value, description]) => ({ category_name: "LOC", value, description, opac_description: null })));
    }
    const oneItem = /^\/api\/v1\/items\/(\d+)$/.exec(url.pathname);
    if (method === "GET" && oneItem) {
      const it = items.get(Number(oneItem[1]));
      return it ? json(200, it) : json(404, { error: "Item not found", error_code: "not_found" });
    }
    if (method === "GET" && url.pathname === "/api/v1/items") {
      const want = url.searchParams.get("external_id");
      const exact = url.searchParams.get("_match") === "exact";
      const hits = [...items.values()].filter((it) => want === null || (exact ? it.external_id === want : (it.external_id ?? "").includes(want)));
      return json(200, hits, { "X-Total-Count": String(hits.length) });
    }

    // ── Phase 5: record writes, as Koha 26.05.03's Biblios#add / #update answer ──
    const one = /^\/api\/v1\/biblios\/(\d+)$/.exec(url.pathname);
    if ((method === "POST" && url.pathname === "/api/v1/biblios") || (method === "PUT" && one)) {
      // Authorization runs before the controller reads the body.
      if (opts.canWrite === false) {
        return json(403, { error: "Authorization failure. Missing required permission(s).", required_permissions: { editcatalogue: "edit_catalogue" } });
      }
      const id = one ? Number(one[1]) : null;
      if (id !== null && !records.has(id)) return json(404, { error: "Bibliographic record not found", error_code: "not_found" });
      if (id !== null && opts.locked?.includes(id)) return json(403, { error: "You do not have permission to edit a locked record" });
      if (!/application\/marc-in-json/.test(headers["content-type"] ?? "")) {
        return json(406, ["application/marcxml+xml", "application/marc-in-json", "application/marc"]);
      }
      let rec: MarcInJson;
      try {
        rec = JSON.parse(String(init?.body ?? "")) as MarcInJson;
        if (!Array.isArray(rec.fields)) throw new Error("no fields");
      } catch {
        return json(500, { error: "Something went wrong, check Koha logs for details.", error_code: "internal_server_error" });
      }
      if (id === null) {
        // FindDuplicate: the same ISBN, else the same title and author.
        if (!headers["x-confirm-not-duplicate"]) {
          const isbn = sub(rec, "020", "a");
          const title = sub(rec, "245", "a");
          const author = sub(rec, "100", "a");
          for (const [bid, r] of records) {
            if ((isbn && sub(r, "020", "a") === isbn) || (!isbn && title && sub(r, "245", "a") === title && sub(r, "100", "a") === author)) {
              return json(400, { error: `Duplicate biblio ${bid}` });
            }
          }
        }
        const bid = nextBiblio++;
        records.set(bid, stored(rec, bid));
        return json(200, { id: bid }, { Location: `${url.pathname}/${bid}` });
      }
      records.set(id, stored(rec, id));
      return json(200, { id });
    }
    if (method === "GET" && one && records.has(Number(one[1]))) {
      const rec = records.get(Number(one[1]))!;
      if (/marc-in-json/.test(headers.accept ?? "")) return json(200, rec);
      return json(200, { biblio_id: Number(one[1]), title: sub(rec, "245", "a"), author: sub(rec, "100", "a") });
    }

    if (method === "GET" && url.pathname === "/api/v1/status/version") {
      return version ? json(200, version) : json(404, { error: "Not found." });
    }
    if (method === "GET" && url.pathname === "/api/v1/libraries") {
      return json(200, libraries, { "X-Total-Count": String(libraries.length) });
    }
    if (method === "GET" && url.pathname === "/api/v1/biblios") {
      // Honours exactly the query shape findKohaBiblioIdsByIsbn sends:
      // {"-or":[{"isbn":{"-like":"%<digits>%"}}, …]}. Like the real endpoint,
      // it sends no pagination headers.
      let wanted: string[] = [];
      try {
        const title = (JSON.parse(url.searchParams.get("q") ?? "{}") as { "me.title"?: string })["me.title"];
        if (typeof title === "string") {
          // An exact title, against the database (the records written here) — no index involved.
          const hits = [...records].filter(([, r]) => sub(r, "245", "a") === title)
            .map(([id, r]) => ({ biblio_id: id, title: sub(r, "245", "a"), author: sub(r, "100", "a"), isbn: sub(r, "020", "a") }));
          return json(200, hits);
        }
        const q = JSON.parse(url.searchParams.get("q") ?? "{}") as { "-or"?: { isbn?: { "-like"?: string } }[] };
        wanted = (q["-or"] ?? []).map((c) => c.isbn?.["-like"]?.replace(/%/g, "") ?? "").filter(Boolean);
      } catch {
        return json(400, { error: "Malformed query string" });
      }
      return json(200, biblios.filter((b) => wanted.some((w) => b.isbn?.includes(w))));
    }
    return json(404, { error: "Not found." });
  };

  return { baseUrl: MOCK_KOHA_BASE_URL, fetch, calls, records, items };
}
