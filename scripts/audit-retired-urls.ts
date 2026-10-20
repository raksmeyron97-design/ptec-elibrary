// Audit of the retired-URL queue's ORIGINAL population (migration 0171's 43
// seeded URLs) against production. Read-only, by construction: every database
// read and every site request goes through `get()` below, which issues GET and
// nothing else, one at a time, with a delay.
//
//   AUDIT_SUPABASE_URL=… AUDIT_ANON_KEY=… [AUDIT_SERVICE_ROLE_KEY=…] \
//     npx tsx scripts/audit-retired-urls.ts [--base https://library.ptec.edu.kh]
//       [--delay 1500] [--out reports/seo/retired-urls-audit-YYYY-MM-DD]
//       [--confirmations docs/seo/retired-url-confirmations.json]
//
// What it reports, per seeded URL and separately (lib/url-redirects/audit.ts):
// the SOURCE's own answer in both locales, hop by hop; where it lands; whether
// the destination answers; what the queue and url_redirects record; whether a
// person decided; and whether the destination is SHOWN to be the same work.
// A target's 200 is never read as the source being resolved.
//
// Keys: the anon key reads exactly what the edge reads (url_redirects'
// decision columns, published books). The service-role key is OPTIONAL and is
// used only to READ the private queue, who-decided (as a boolean + role, never
// an id), and version history; without it those fields say "unavailable"
// rather than guessing. scripts/verify-redirects.ts stays the post-deploy check
// of url_redirects rows; this is the population audit it never covered.

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import {
  analyseChain,
  ALLOWED_REDIRECT_HOPS,
  CLASSIFICATIONS,
  classifyRecord,
  describeOutcome,
  FOLLOW_LIMIT,
  parseSeedRows,
  reconcile,
  RESOLVED,
  type AuditedRecord,
  type ChainProbe,
  type Confirmation,
  type Hop,
  type QueueState,
  type RecordEvidence,
  type RedirectRow,
} from "../lib/url-redirects/audit";
import { suggestSuccessors, type Candidate } from "../lib/url-redirects/queue";
import { fetchWithRetry, classifyError } from "../lib/verify/http";

const argv = process.argv.slice(2);
const flag = (name: string, fallback?: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};

const BASE = (flag("base", "https://library.ptec.edu.kh") as string).replace(/\/$/, "");
const DELAY_MS = Number(flag("delay", "1500"));
const TODAY = new Date().toISOString().slice(0, 10);
const OUT = flag("out", `reports/seo/retired-urls-audit-${TODAY}`) as string;
const CONFIRMATIONS = flag("confirmations", "docs/seo/retired-url-confirmations.json") as string;
const SUPABASE_URL = (flag("supabase-url", process.env.AUDIT_SUPABASE_URL) ?? "").replace(/\/$/, "");
const ANON_KEY = process.env.AUDIT_ANON_KEY ?? "";
const SERVICE_KEY = process.env.AUDIT_SERVICE_ROLE_KEY ?? "";
const SEED_FILE = "supabase/migrations/0171_seed_retired_urls.sql";

/** 0171's own note per path — the seed author's reading, shown to the reviewer. */
const SEED_NOTES = new Map<string, string>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const encodePath = (p: string) => p.split("/").map((s) => encodeURIComponent(s)).join("/");

// ── Read-only database access ───────────────────────────────────────────────

class ReadFailed extends Error {}

/** The only database call in this file. GET, bounded, never a body. */
async function get<T>(query: string, key: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
      method: "GET",
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    throw new ReadFailed(`no answer: ${(err as Error).message}`);
  }
  if (!res.ok) throw new ReadFailed(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

/** Every row, 1000 at a time — PostgREST clips each response at db-max-rows. */
async function getAll<T>(query: string, key: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const page = await get<T[]>(`${query}&offset=${from}&limit=1000`, key);
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

/** `.in()` lists in small chunks: a Khmer letter is nine characters encoded. */
async function getIn<T>(table: string, select: string, column: string, values: string[], key: string, extra = ""): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < values.length; i += 8) {
    const list = values
      .slice(i, i + 8)
      .map((v) => `"${v.replace(/"/g, '\\"')}"`)
      .join(",");
    out.push(...(await get<T[]>(`${table}?select=${select}&${column}=in.(${encodeURIComponent(list)})${extra}`, key)));
  }
  return out;
}

async function attempt<T>(label: string, fn: () => Promise<T>, limitations: string[]): Promise<T | "unavailable"> {
  try {
    return await fn();
  } catch (err) {
    limitations.push(`${label}: ${(err as Error).message}`);
    return "unavailable";
  }
}

// ── Read-only site access ───────────────────────────────────────────────────

const ANSWERED = Array.from({ length: 300 }, (_, i) => 200 + i).filter((s) => s !== 429);
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
let requestCount = 0;

function canonicalOf(html: string): string | null {
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/\brel=["']?canonical\b/i.test(tag)) continue;
    const href = /\bhref=["']([^"']+)["']/i.exec(tag);
    if (href) return href[1];
  }
  return null;
}

/** Ask the source WITHOUT following, then follow by hand, recording every hop. */
async function probeChain(start: string): Promise<ChainProbe> {
  const origin = new URL(BASE).origin;
  const hops: Hop[] = [];
  const seen = new Set<string>();
  let current = start;
  for (;;) {
    if (seen.has(current)) return { kind: "answered", hops, stop: "loop", canonical: null };
    if (hops.length > FOLLOW_LIMIT) return { kind: "answered", hops, stop: "follow_limit", canonical: null };
    seen.add(current);
    let res: Response;
    try {
      requestCount++;
      res = await fetchWithRetry(current, { redirect: "manual", allowStatuses: ANSWERED, timeoutMs: 20_000 });
    } catch (err) {
      await sleep(DELAY_MS);
      return { kind: "no_answer", hops, detail: classifyError(err).detail };
    }
    const location = res.headers.get("location");
    hops.push({ url: current, status: res.status, location, robots: res.headers.get("x-robots-tag") });
    if (REDIRECTS.has(res.status) && location) {
      await res.body?.cancel();
      await sleep(DELAY_MS);
      const next = new URL(location, current);
      if (next.origin !== origin) return { kind: "answered", hops, stop: "off_site", canonical: null };
      current = next.toString();
      continue;
    }
    let canonical: string | null = null;
    if (res.status === 200 && /text\/html/i.test(res.headers.get("content-type") ?? "")) {
      try {
        canonical = canonicalOf(await res.text());
      } catch {
        canonical = null;
      }
    } else {
      await res.body?.cancel();
    }
    await sleep(DELAY_MS);
    return { kind: "answered", hops, stop: "final", canonical };
  }
}

// ── Collect ─────────────────────────────────────────────────────────────────

type TargetMeta = {
  path: string;
  title: string | null;
  published: boolean;
  verifiedByStaff: boolean | null;
  createdAt: string | null;
  slugHistory: string[] | "unavailable" | null;
};

async function run() {
  if (!SUPABASE_URL || !ANON_KEY) {
    console.error("Set AUDIT_SUPABASE_URL and AUDIT_ANON_KEY (AUDIT_SERVICE_ROLE_KEY optional, read-only use).");
    process.exit(2);
  }
  // A production site audited against a local database writes a confident,
  // wrong report (the 2026-09 backfill incident). Refuse the pairing.
  const dbHost = new URL(SUPABASE_URL).hostname;
  const siteHost = new URL(BASE).hostname;
  const localDb = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(dbHost);
  if (localDb && !/^(localhost|127\.)/.test(siteHost) && !argv.includes("--allow-mismatch")) {
    console.error(`Refusing: site ${siteHost} audited against local database ${dbHost} (--allow-mismatch to override).`);
    process.exit(2);
  }

  const limitations: string[] = [];
  const generatedAt = new Date().toISOString();
  const commit = execSync("git rev-parse HEAD").toString().trim();
  const dirty = execSync("git status --porcelain --untracked-files=no").toString().trim().length > 0;
  console.log(`\naudit-retired-urls  site=${BASE}  database=${dbHost}  service-role=${SERVICE_KEY ? "yes (GET only)" : "no"}  delay=${DELAY_MS}ms\n`);

  // The original population: 0171 as committed.
  const seed = parseSeedRows(readFileSync(SEED_FILE, "utf8"));
  const originals = [...new Map(seed.map((r, i) => [r.path, { ...r, id: `0171#${String(i + 1).padStart(2, "0")}` }])).values()];
  const paths = originals.map((r) => r.path);
  for (const r of originals) SEED_NOTES.set(r.path, r.note);

  let confirmations: Confirmation[] = [];
  try {
    confirmations = (JSON.parse(readFileSync(CONFIRMATIONS, "utf8")) as { confirmations: Confirmation[] }).confirmations ?? [];
  } catch (err) {
    limitations.push(`confirmations file ${CONFIRMATIONS} not read: ${(err as Error).message}`);
  }

  // Queue (private table): service role only.
  type QueueDbRow = {
    path: string;
    cause: string;
    suggested_path: string | null;
    resolution: QueueState["resolution"];
    resolved_by: string | null;
    resolved_at: string | null;
  };
  const queueRows: QueueDbRow[] | "unavailable" = SERVICE_KEY
    ? await attempt(
        "retired_url_queue",
        () => getAll<QueueDbRow>("retired_url_queue?select=path,cause,suggested_path,resolution,resolved_by,resolved_at&order=path", SERVICE_KEY),
        limitations,
      )
    : "unavailable";
  if (!SERVICE_KEY) limitations.push("retired_url_queue is service-role only and no service-role key was given: queue fields unavailable");

  // Who decided, as a ROLE. The ids are dropped here.
  const deciderIds = queueRows === "unavailable" ? [] : [...new Set(queueRows.map((r) => r.resolved_by).filter((x): x is string => !!x))];
  const roles = new Map<string, string>();
  if (deciderIds.length && SERVICE_KEY) {
    const got = await attempt("profiles.role", () => getIn<{ id: string; role: string }>("profiles", "id,role", "id", deciderIds, SERVICE_KEY), limitations);
    if (got !== "unavailable") for (const p of got) roles.set(p.id, p.role);
  }

  // url_redirects: the decision columns through the anon grant (what the edge
  // reads); created_by — as a boolean — only with the service role. Never `reason`.
  const redirectRows = await attempt(
    "url_redirects",
    () => getAll<{ old_path: string; target_path: string | null; status: number }>("url_redirects?select=old_path,target_path,status&order=old_path", ANON_KEY),
    limitations,
  );
  const createdBy = SERVICE_KEY
    ? await attempt(
        "url_redirects.created_by",
        () => getAll<{ old_path: string; created_by: string | null }>("url_redirects?select=old_path,created_by&order=old_path", SERVICE_KEY),
        limitations,
      )
    : "unavailable";

  // book_slug_redirects aliases whose book is published.
  const slugs = paths.map((p) => p.slice("/books/".length));
  const aliases = await attempt(
    "book_slug_redirects",
    () =>
      getIn<{ old_slug: string; books: { slug: string; is_published: boolean } }>(
        "book_slug_redirects",
        "old_slug,books!inner(slug,is_published)",
        "old_slug",
        slugs,
        SERVICE_KEY || ANON_KEY,
      ),
    limitations,
  );

  // ── Probe the site ───────────────────────────────────────────────────────
  const probes = new Map<string, { en: ChainProbe; km: ChainProbe }>();
  for (const [i, r] of originals.entries()) {
    const en = await probeChain(`${BASE}${encodePath(r.path)}`);
    const km = await probeChain(`${BASE}/km${encodePath(r.path)}`);
    probes.set(r.path, { en, km });
    console.log(`  ${String(i + 1).padStart(2)}/${originals.length}  en ${describeOutcome(analyseChain(en, ""))}  km ${describeOutcome(analyseChain(km, "/km"))}  ${r.path}`);
  }

  const queueByPath = new Map(queueRows === "unavailable" ? [] : queueRows.map((q) => [q.path, q]));
  const suggestionOf = (r: (typeof originals)[number]) => {
    const q = queueByPath.get(r.path);
    return queueRows === "unavailable" ? r.suggested : q?.suggested_path ?? null;
  };
  const targetPaths = [...new Set(originals.map(suggestionOf).filter((x): x is string => !!x))];
  const targetProbes = new Map<string, ChainProbe>();
  for (const t of targetPaths) {
    targetProbes.set(t, await probeChain(`${BASE}${encodePath(t)}`));
    console.log(`  target  ${describeOutcome(analyseChain(targetProbes.get(t) ?? null, ""))}  ${t}`);
  }

  // ── Assemble evidence and classify ────────────────────────────────────────
  const records: AuditedRecord[] = originals.map((r) => {
    let queue: RecordEvidence["queue"] = "unavailable";
    if (queueRows !== "unavailable") {
      const q = queueByPath.get(r.path);
      queue = q
        ? {
            resolution: q.resolution,
            suggestedPath: q.suggested_path,
            cause: q.cause,
            decidedByPerson: q.resolved_by !== null,
            deciderRole: q.resolved_by ? roles.get(q.resolved_by) ?? null : null,
            resolvedAt: q.resolved_at,
          }
        : "missing";
    }
    let redirectRow: RecordEvidence["redirectRow"] = "unavailable";
    if (redirectRows !== "unavailable") {
      const row = redirectRows.find((x) => x.old_path === r.path);
      const by = createdBy === "unavailable" ? undefined : createdBy.find((x) => x.old_path === r.path);
      redirectRow = row
        ? ({ targetPath: row.target_path, status: row.status, decidedByPerson: by ? by.created_by !== null : null } satisfies RedirectRow)
        : null;
    }
    let alias: RecordEvidence["alias"] = "unavailable";
    if (aliases !== "unavailable") {
      const a = aliases.find((x) => `/books/${x.old_slug}` === r.path && x.books?.is_published);
      alias = a ? { targetPath: `/books/${a.books.slug}` } : null;
    }
    const suggestion = suggestionOf(r);
    const evidence: RecordEvidence = {
      path: r.path,
      seededSuggestion: r.suggested,
      queue,
      redirectRow,
      alias,
      probes: probes.get(r.path) ?? { en: null, km: null },
      target: suggestion ? { path: suggestion, probe: targetProbes.get(suggestion) ?? null } : null,
      confirmation: confirmations.find((c) => c.path === r.path) ?? null,
    };
    return { id: r.id, path: r.path, evidence, verdict: classifyRecord(evidence) };
  });

  // ── Context a reviewer needs: destination metadata and candidates ────────
  const destinations = [...new Set(records.flatMap((r) => [r.verdict.observedTarget, r.verdict.recordedTarget, r.verdict.suggestion]).filter((x): x is string => !!x))];
  const meta = new Map<string, TargetMeta>();
  const bookSlugs = destinations.filter((d) => d.startsWith("/books/")).map((d) => d.slice(7));
  const thesisSlugs = destinations.filter((d) => d.startsWith("/theses/")).map((d) => d.slice(8));
  const key = SERVICE_KEY || ANON_KEY;
  const bookMeta = await attempt(
    "destination books",
    () => getIn<{ id: string; slug: string; title: string; is_published: boolean; verified_at: string | null; created_at: string }>("books", "id,slug,title,is_published,verified_at,created_at", "slug", bookSlugs, key),
    limitations,
  );
  const thesisMeta = await attempt(
    "destination theses",
    () => getIn<{ slug: string; title: string; is_published: boolean; verified_at: string | null; created_at: string }>("research_reports", "slug,title,is_published,verified_at,created_at", "slug", thesisSlugs, key),
    limitations,
  );
  if (bookMeta !== "unavailable") {
    for (const b of bookMeta) {
      let slugHistory: TargetMeta["slugHistory"] = null;
      // Only for a destination a source actually redirects to: was it ever at the old path?
      if (SERVICE_KEY && records.some((r) => r.verdict.observedTarget === `/books/${b.slug}`)) {
        const h = await attempt(
          `content_versions for ${b.slug}`,
          () => getAll<{ s: string | null }>(`content_versions?select=s:snapshot->>slug&table_name=eq.books&record_id=eq.${b.id}&order=changed_at`, SERVICE_KEY),
          limitations,
        );
        slugHistory = h === "unavailable" ? "unavailable" : [...new Set(h.map((x) => x.s).filter((x): x is string => !!x))];
      }
      meta.set(`/books/${b.slug}`, { path: `/books/${b.slug}`, title: b.title, published: b.is_published, verifiedByStaff: SERVICE_KEY ? b.verified_at !== null : null, createdAt: b.created_at, slugHistory });
    }
  }
  if (thesisMeta !== "unavailable") {
    for (const t of thesisMeta) {
      meta.set(`/theses/${t.slug}`, { path: `/theses/${t.slug}`, title: t.title, published: t.is_published, verifiedByStaff: SERVICE_KEY ? t.verified_at !== null : null, createdAt: t.created_at, slugHistory: null });
    }
  }

  // Does any version snapshot still hold the OLD record (its title/ISBN would settle equivalence)?
  const oldSnapshots = new Map<string, number | "unavailable">();
  if (SERVICE_KEY) {
    for (const r of records.filter((x) => x.verdict.observedTarget || x.verdict.recordedTarget)) {
      const slug = r.path.slice(7);
      const got = await attempt(
        `content_versions snapshot of ${r.path}`,
        () => get<unknown[]>(`content_versions?select=record_id&table_name=eq.books&snapshot->>slug=eq.${encodeURIComponent(slug)}&limit=5`, SERVICE_KEY),
        limitations,
      );
      oldSnapshots.set(r.path, got === "unavailable" ? "unavailable" : got.length);
    }
  }

  // The candidates /admin/books/retired-urls itself would show — candidates, never answers.
  const candidates = await attempt(
    "published books/theses for candidates",
    async () => {
      const b = await getAll<{ slug: string | null; title: string | null }>("books?select=slug,title&is_published=eq.true&order=id", ANON_KEY);
      const t = await getAll<{ slug: string | null; title: string | null }>("research_reports?select=slug,title&is_published=eq.true&order=id", ANON_KEY);
      return [
        ...b.filter((x) => x.slug && x.title).map((x) => ({ path: `/books/${x.slug}`, title: x.title as string })),
        ...t.filter((x) => x.slug && x.title).map((x) => ({ path: `/theses/${x.slug}`, title: x.title as string })),
      ] satisfies Candidate[];
    },
    limitations,
  );
  const pageCandidates = new Map<string, string[]>();
  if (candidates !== "unavailable") {
    for (const r of records) {
      pageCandidates.set(r.path, suggestSuccessors({ path: r.path, title: null }, candidates).map((s) => `${s.path} (${s.basis} ${s.score})`));
    }
  }

  const recon = reconcile(seed, records, queueRows !== "unavailable");
  const outsidePopulation = queueRows === "unavailable" ? null : queueRows.filter((q) => !paths.includes(q.path)).map((q) => `${q.path} (${q.cause}, ${q.resolution})`);

  // ── Write ─────────────────────────────────────────────────────────────────
  const command = `npx tsx scripts/audit-retired-urls.ts ${argv.join(" ")}`.trim();
  const header = {
    generatedAt,
    base: BASE,
    database: dbHost,
    commit,
    workingTreeDirty: dirty,
    command,
    delayMs: DELAY_MS,
    keysUsed: SERVICE_KEY ? ["anon", "service_role (GET only)"] : ["anon"],
    seedFile: SEED_FILE,
    policy: { allowedRedirectHops: ALLOWED_REDIRECT_HOPS, followLimit: FOLLOW_LIMIT, permanentStatuses: [301, 308] },
    siteRequests: requestCount,
  };
  const json = {
    ...header,
    reconciliation: recon,
    queueRowsOutsideOriginalPopulation: outsidePopulation,
    limitations,
    records: records.map((r) => ({
      id: r.id,
      path: r.path,
      seededSuggestion: r.evidence.seededSuggestion,
      queue: r.evidence.queue,
      redirectRow: r.evidence.redirectRow,
      alias: r.evidence.alias,
      probes: r.evidence.probes,
      target: r.evidence.target,
      confirmation: r.evidence.confirmation,
      verdict: r.verdict,
      destination: r.verdict.observedTarget ? meta.get(r.verdict.observedTarget) ?? null : null,
      suggestionMeta: r.verdict.suggestion ? meta.get(r.verdict.suggestion) ?? null : null,
      oldRecordSnapshots: oldSnapshots.get(r.path) ?? null,
      pageCandidates: pageCandidates.get(r.path) ?? null,
    })),
  };
  writeFileSync(`${OUT}.json`, `${JSON.stringify(json, null, 2)}\n`);
  writeFileSync(`${OUT}.csv`, toCsv(records, meta));
  writeFileSync(`${OUT}.md`, toMarkdown(header, recon, records, meta, oldSnapshots, pageCandidates, outsidePopulation, limitations));
  console.log(`\n${CLASSIFICATIONS.filter((c) => recon.byClassification[c]).map((c) => `${c} ${recon.byClassification[c]}`).join(" · ")}`);
  console.log(`fully resolved ${recon.fullyResolved}/${records.length} · accounted for: ${recon.accountedFor}`);
  if (limitations.length) console.log(`LIMITATIONS:\n  ${limitations.join("\n  ")}`);
  console.log(`Wrote ${OUT}.{md,json,csv}`);
  // Exit 0 for an audit that ran; 1 only when the population cannot be accounted for.
  process.exit(recon.accountedFor ? 0 : 1);
}

// ── Rendering ───────────────────────────────────────────────────────────────

function chainText(probe: ChainProbe | null): string {
  if (!probe) return "not requested";
  const hops = probe.hops.map((h) => `${h.status}${h.location ? ` → ${safeDecode(h.location)}` : ""}`).join(" ⇒ ");
  if (probe.kind === "no_answer") return `${hops ? `${hops} ⇒ ` : ""}NO ANSWER (${probe.detail})`;
  return probe.stop === "final" ? hops : `${hops} [${probe.stop}]`;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function queueText(q: RecordEvidence["queue"]): string {
  if (typeof q === "string") return q;
  return `${q.resolution}${q.decidedByPerson ? ` by ${q.deciderRole ?? "a person"} ${q.resolvedAt?.slice(0, 10) ?? ""}` : ""}`.trim();
}

function rowText(r: RecordEvidence["redirectRow"]): string {
  if (r === "unavailable") return "unavailable";
  if (!r) return "none";
  const who = r.decidedByPerson === null ? "decider unknown" : r.decidedByPerson ? "person" : "trigger";
  return `${r.status}${r.targetPath ? ` → ${r.targetPath}` : ""} (${who})`;
}

const cell = (s: string | null | undefined) => (s ?? "—").replace(/\|/g, "\\|").replace(/\n/g, " ");

function toMarkdown(
  header: Record<string, unknown>,
  recon: ReturnType<typeof reconcile>,
  records: AuditedRecord[],
  meta: Map<string, TargetMeta>,
  oldSnapshots: Map<string, number | "unavailable">,
  pageCandidates: Map<string, string[]>,
  outside: string[] | null,
  limitations: string[],
): string {
  const L: string[] = [];
  L.push(`# Retired-URL queue audit — ${String(header.generatedAt).slice(0, 10)}`, "");
  L.push("Generated by `scripts/audit-retired-urls.ts` (classification rules: `lib/url-redirects/audit.ts`). Read-only: GET requests only, one at a time.", "");
  L.push("| | |", "|---|---|");
  for (const [k, v] of Object.entries(header)) L.push(`| ${k} | ${cell(typeof v === "string" ? v : JSON.stringify(v))} |`);
  L.push("");
  L.push("**A suggested target answering 200 never resolves the source.** A record is resolved only as `RESOLVED_REDIRECT` (source 301/308, one hop, both locales, destination 200, destination shown to be the same work) or `RESOLVED_RETIRED` (410 + noindex in both locales, decided by a person through the queue).", "");

  L.push("## Reconciliation", "");
  L.push("| Count | Value |", "|---|---|");
  const rows: [string, unknown][] = [
    ["Seed entries in 0171", recon.seedEntries],
    ["Duplicate seed entries", recon.duplicateSeedEntries.length ? recon.duplicateSeedEntries.join(", ") : 0],
    ["Original records (distinct paths)", recon.originalRecords],
    ["Found in retired_url_queue", recon.foundInQueue ?? "unavailable"],
    ["Missing from retired_url_queue", recon.missingFromQueue.length ? recon.missingFromQueue.join(", ") : 0],
    ["Queue rows outside the original population", outside === null ? "unavailable" : outside.length ? outside.join(", ") : 0],
    ["Records with a suggested target", recon.withSuggestion],
    ["Records without a suggested target", recon.withoutSuggestion],
    ["Source URL checks (records × 2 locales)", recon.sourceChecks],
    ["Source URL checks that got an answer", recon.sourceChecksAnswered],
    ["Redirect responses observed (all hops)", recon.redirectHopsObserved],
    ["Target checks", recon.targetChecks],
    ["Sources answering 404 in both locales", recon.observed404],
    ["…of which the queue still has pending", recon.observed404AwaitingDecision],
    ...CLASSIFICATIONS.map((c) => [`\`${c}\``, recon.byClassification[c]] as [string, unknown]),
    ["**Fully resolved**", recon.fullyResolved],
    ["**Not resolved**", recon.unresolved],
    ["Every original record accounted for exactly once", recon.accountedFor ? "yes" : "**NO**"],
  ];
  for (const [k, v] of rows) L.push(`| ${k} | ${cell(String(v))} |`);
  L.push("");

  L.push("## Per-record audit", "");
  L.push("| ID | Source path | en chain | km chain | Lands on | Canonical | Queue | url_redirects | Suggestion | Target | Semantic | Classification |");
  L.push("|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of records) {
    const v = r.verdict;
    const en = r.evidence.probes.en;
    const canonical = en?.kind === "answered" && en.hops.length > 1 ? en.canonical : null;
    const target =
      v.suggestion === null ? "—" : v.suggestionUnsafe ? "refused" : v.targetAvailable === null ? "unchecked" : v.targetAvailable ? "200" : "not 200";
    L.push(
      `| ${r.id} | \`${cell(r.path)}\` | ${cell(chainText(en))} | ${cell(chainText(r.evidence.probes.km))} | ${cell(v.observedTarget)} | ${cell(canonical ? safeDecode(canonical) : null)} | ${cell(queueText(r.evidence.queue))} | ${cell(rowText(r.evidence.redirectRow))} | ${cell(v.suggestion)}${v.suggestionSource === "seed" ? " (seed)" : ""} | ${target} | ${v.semantic} | \`${v.classification}\` |`,
    );
  }
  L.push("");

  const redirected = records.filter((r) => r.verdict.observedTarget || r.verdict.recordedTarget);
  if (redirected.length) {
    L.push("## Redirect evidence", "");
    for (const r of redirected) {
      const v = r.verdict;
      const m = v.observedTarget ? meta.get(v.observedTarget) : undefined;
      L.push(`### ${r.id} \`${r.path}\``, "");
      L.push(`- Source, en: ${chainText(r.evidence.probes.en)}`);
      L.push(`- Source, km: ${chainText(r.evidence.probes.km)}`);
      L.push(`- Recorded: url_redirects ${rowText(r.evidence.redirectRow)}; queue ${queueText(r.evidence.queue)}; seed suggestion ${r.evidence.seededSuggestion ?? "none"}`);
      if (m) {
        L.push(`- Destination record: "${m.title}", published ${m.published}, verified by library staff ${m.verifiedByStaff ?? "unknown"}, created ${m.createdAt?.slice(0, 10) ?? "?"}`);
        L.push(`- Destination slug history: ${m.slugHistory === null ? "not read" : m.slugHistory === "unavailable" ? "unavailable" : m.slugHistory.join(", ") || "none"} — ${Array.isArray(m.slugHistory) && m.slugHistory.includes(r.path.slice(7)) ? "it WAS once at the old path (same record)" : "never at the old path (a different record)"}`);
      }
      const snaps = oldSnapshots.get(r.path);
      L.push(`- Version snapshots of the old record: ${snaps === undefined ? "not read" : snaps}${snaps === 0 ? " — its edition/ISBN cannot be recovered from version history" : ""}`);
      L.push(`- Approval: ${v.approval}. Semantic: **${v.semantic}** (${v.semanticBasis})`);
      L.push(`- Classification: \`${v.classification}\`${v.reasons.length ? ` — ${v.reasons.join("; ")}` : ""}`);
      if (v.discrepancies.length) L.push(`- Discrepancies: ${v.discrepancies.join("; ")}`);
      L.push("");
    }
  }

  L.push("## Unresolved records and next action", "");
  L.push("| ID | Source path | Classification | Reviewer | Next action | Evidence notes | Queue page candidates (not answers) |");
  L.push("|---|---|---|---|---|---|---|");
  for (const r of records.filter((x) => !RESOLVED.has(x.verdict.classification))) {
    const v = r.verdict;
    const notes = [...v.reasons, ...v.discrepancies];
    const sm = v.suggestion ? meta.get(v.suggestion) : undefined;
    if (sm) notes.push(`suggestion "${sm.title}" verified by staff: ${sm.verifiedByStaff ?? "unknown"}`);
    const seedNote = SEED_NOTES.get(r.path);
    if (seedNote) notes.push(`0171 note: ${seedNote}`);
    L.push(
      `| ${r.id} | \`${cell(r.path)}\` | \`${v.classification}\` | ${v.reviewer} | ${cell(v.action)} | ${cell(notes.join("; ") || null)} | ${cell((pageCandidates.get(r.path) ?? []).join("; ") || null)} |`,
    );
  }
  L.push("");

  L.push("## Limitations", "");
  L.push(limitations.length ? limitations.map((l) => `- ${l}`).join("\n") : "- None recorded by the collector.");
  L.push("- `approval` says THAT a person decided (and their role), never who; a queue decision records no bibliographic basis, so it is not semantic support.");
  L.push("- Production redirects are served from a 120 s edge snapshot; a decision made in the last two minutes may not be visible yet.");
  L.push("");
  return `${L.join("\n")}\n`;
}

function toCsv(records: AuditedRecord[], meta: Map<string, TargetMeta>): string {
  const cols = [
    "id", "source_path", "locale_checks", "en_status", "en_location", "en_chain", "km_status", "km_location", "km_chain",
    "final_destination", "final_status", "canonical", "queue_resolution", "queue_decided_by_person", "redirect_row",
    "suggestion", "suggestion_source", "target_available", "destination_verified_by_staff", "approval", "semantic",
    "classification", "reviewer", "recommended_action",
  ];
  const q = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(",")];
  for (const r of records) {
    const { en, km } = r.evidence.probes;
    const v = r.verdict;
    const last = en?.hops[en.hops.length - 1];
    const queue = r.evidence.queue;
    lines.push(
      [
        r.id, r.path, 2,
        en?.hops[0]?.status ?? "no_answer", en?.hops[0]?.location ? safeDecode(en.hops[0].location) : "", chainText(en),
        km?.hops[0]?.status ?? "no_answer", km?.hops[0]?.location ? safeDecode(km.hops[0].location) : "", chainText(km),
        v.observedTarget ?? "", en?.kind === "answered" && en.hops.length > 1 ? last?.status ?? "" : "",
        en?.kind === "answered" && en.hops.length > 1 && en.canonical ? safeDecode(en.canonical) : "",
        typeof queue === "string" ? queue : queue.resolution, typeof queue === "string" ? "" : queue.decidedByPerson,
        rowText(r.evidence.redirectRow), v.suggestion ?? "", v.suggestionSource ?? "", v.targetAvailable ?? "",
        v.observedTarget ? meta.get(v.observedTarget)?.verifiedByStaff ?? "" : "",
        v.approval, v.semantic, v.classification, v.reviewer, v.action,
      ]
        .map(q)
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

run().catch((err) => {
  console.error(`\naudit could not run — ${(err as Error).message}\n`);
  process.exit(1);
});

export {};
