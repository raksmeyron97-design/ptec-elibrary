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

/** Paths the mock serves that declare the integer request-id header in 26.05. */
const REQUEST_ID_PATHS = new Set(["/api/v1/libraries", "/api/v1/biblios"]);

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

export interface MockKoha {
  baseUrl: string;
  fetch: FetchLike;
  /** Every call the mock received, for assertions. */
  calls: { method: string; path: string; headers: Record<string, string> }[];
}

export function createMockKoha(
  opts: { libraries?: KohaLibrary[]; version?: KohaVersion | null; biblios?: KohaBiblioSummary[] } = {},
): MockKoha {
  const libraries = opts.libraries ?? MOCK_KOHA_LIBRARIES;
  const biblios = opts.biblios ?? MOCK_KOHA_BIBLIOS;
  const version = opts.version === undefined ? MOCK_KOHA_VERSION : opts.version;
  const calls: MockKoha["calls"] = [];
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
        const q = JSON.parse(url.searchParams.get("q") ?? "{}") as { "-or"?: { isbn?: { "-like"?: string } }[] };
        wanted = (q["-or"] ?? []).map((c) => c.isbn?.["-like"]?.replace(/%/g, "") ?? "").filter(Boolean);
      } catch {
        return json(400, { error: "Malformed query string" });
      }
      return json(200, biblios.filter((b) => wanted.some((w) => b.isbn?.includes(w))));
    }
    return json(404, { error: "Not found." });
  };

  return { baseUrl: MOCK_KOHA_BASE_URL, fetch, calls };
}
