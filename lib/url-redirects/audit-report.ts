// Output side of the retired-URL audit (scripts/audit-retired-urls.ts):
// the one PostgREST list builder it uses, where its reports may be written,
// and how untrusted evidence is rendered into each format.
//
// The report RECORDS what the network said — titles, Location headers,
// canonical links — so that text is untrusted by construction. Each format
// gets the treatment that format needs, and the raw evidence is changed in
// none of them except where the format itself demands it:
//
//   JSON      JSON.stringify — a complete serializer; the canonical evidence.
//   Markdown  mdText(): every character that can open markup or end a cell
//             is backslash-escaped in ONE pass (so `\` and `|` cannot be
//             escaped in the wrong order — CodeQL js/incomplete-sanitization,
//             the defect #155–#157 fixed in scripts/seo-check.ts), and line
//             breaks become spaces so a value cannot start a new row. GFM's
//             bare-URL autolinking is not suppressed: it links the text it
//             shows, and the JSON is the record anyway.
//   CSV       lib/export/csv.ts toCsv(): RFC 4180 quoting, the OWASP
//             leading-quote guard against spreadsheet formulas (a librarian
//             opens this in Excel), BOM + CRLF so Khmer survives Excel.
//
// Headings and columns are fixed here, never derived from the data.
//
// js/http-to-file-access on the writes cannot be closed by any code shape —
// the CodeQL pack ships no sanitizer for it (docs/CODEQL-TRIAGE.md, #149). What
// this file guarantees instead is WHERE the bytes go: resolveReportBase()
// confines every report to <repo>/reports/, refuses traversal and symlinked
// directories, and writeReportFile() opens with O_NOFOLLOW.

import { closeSync, constants, lstatSync, mkdirSync, openSync, realpathSync, writeSync } from "node:fs";
import path from "node:path";
import { toCsv } from "@/lib/export/csv";
import type { ExportColumn } from "@/lib/export/core";
import {
  CLASSIFICATIONS,
  RESOLVED,
  type AuditedRecord,
  type CanonicalCheck,
  type ChainProbe,
  type Reconciliation,
  type RecordEvidence,
} from "./audit";

// ── PostgREST `in.()` lists ─────────────────────────────────────────────────

/** Longer than any slug or uuid this audit asks about. */
const MAX_FILTER_VALUE = 1024;

/**
 * One value of a PostgREST `in.()` list, always double-quoted. Inside quotes
 * PostgREST takes `\` as an escape for the next character — verified against
 * production (v14) on 2026-10-21: `"… \(5th Edition\)"` matched the title
 * `… (5th Edition)`. So `\` and `"` are each escaped, in one pass, and the
 * reserved `,` `.` `:` `(` `)` need nothing more once quoted. Control
 * characters are refused rather than encoded: no slug or id carries one.
 */
export function postgrestQuoted(value: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_FILTER_VALUE) {
    throw new Error("postgrest filter value must be a non-empty string under 1024 characters");
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) throw new Error("postgrest filter value contains a control character");
  return `"${value.replace(/[\\"]/g, "\\$&")}"`;
}

/** `in.(…)` for a query string: the list percent-encoded, Khmer included. */
export function postgrestInFilter(values: readonly string[]): string {
  if (values.length === 0) throw new Error("postgrest in-list needs at least one value");
  return `in.(${encodeURIComponent(values.map(postgrestQuoted).join(","))})`;
}

// ── Where a report may be written ───────────────────────────────────────────

export const REPORTS_DIR = "reports";
const REPORT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;

class UnsafeReportPath extends Error {}

function isRealDirectory(p: string): boolean {
  const st = lstatSync(p, { throwIfNoEntry: false });
  if (!st) return false;
  if (st.isSymbolicLink() || !st.isDirectory()) throw new UnsafeReportPath(`${p} is not a plain directory`);
  return true;
}

/**
 * The absolute base path (no extension) for `out`, which is read relative to
 * the repository root and must land strictly inside `<root>/reports/`. Every
 * directory on the way is created if missing and refused if it is a symlink
 * or not a directory, so a pre-placed link cannot carry the write elsewhere.
 */
export function resolveReportBase(out: string, repoRoot: string): string {
  if (typeof out !== "string" || out.length === 0 || out.includes("\0")) throw new UnsafeReportPath("empty or invalid --out");
  const root = realpathSync(repoRoot);
  const allowed = path.join(root, REPORTS_DIR);
  const abs = path.resolve(root, out);
  const rel = path.relative(allowed, abs);
  if (rel === "" || rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new UnsafeReportPath(`--out must be inside ${REPORTS_DIR}/ (got ${out})`);
  }
  const parts = rel.split(path.sep);
  const name = parts.pop() as string;
  if (!REPORT_NAME.test(name)) throw new UnsafeReportPath(`report name ${JSON.stringify(name)} is not a plain file name`);
  let dir = allowed;
  for (const segment of ["", ...parts]) {
    if (segment && !REPORT_NAME.test(segment)) throw new UnsafeReportPath(`directory ${JSON.stringify(segment)} is not a plain name`);
    dir = segment ? path.join(dir, segment) : dir;
    if (!isRealDirectory(dir)) mkdirSync(dir);
  }
  return path.join(dir, name);
}

/** Write without following a symlink at the final component (O_NOFOLLOW). */
export function writeReportFile(file: string, content: string): void {
  const fd = openSync(file, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o644);
  try {
    writeSync(fd, content);
  } finally {
    closeSync(fd);
  }
}

// ── Rendering ───────────────────────────────────────────────────────────────

/**
 * Untrusted text for a Markdown table cell, heading or list item. One pass
 * escapes `\` together with every character that can end a cell (`|`) or open
 * markup (code, emphasis, strike, links/images, HTML); line breaks become
 * spaces so a value cannot add a row.
 */
export function mdText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value)
    .replace(/\r\n|\r|\n/g, " ")
    .replace(/[\\`*_~[\]<>|]/g, "\\$&");
}

export type TargetMeta = {
  path: string;
  title: string | null;
  published: boolean;
  verifiedByStaff: boolean | null;
  createdAt: string | null;
  slugHistory: string[] | "unavailable" | null;
};

export type ReportContext = {
  header: Record<string, unknown>;
  recon: Reconciliation;
  records: AuditedRecord[];
  meta: Map<string, TargetMeta>;
  oldSnapshots: Map<string, number | "unavailable">;
  pageCandidates: Map<string, string[]>;
  seedNotes: Map<string, string>;
  outside: string[] | null;
  limitations: string[];
};

export function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export function chainText(probe: ChainProbe | null): string {
  if (!probe) return "not requested";
  const hops = probe.hops.map((h) => `${h.status}${h.location ? ` → ${safeDecode(h.location)}` : ""}`).join(" ⇒ ");
  if (probe.kind === "no_answer") return `${hops ? `${hops} ⇒ ` : ""}NO ANSWER (${probe.detail})`;
  return probe.stop === "final" ? hops : `${hops} [${probe.stop}]`;
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

function canonicalText(c: CanonicalCheck): string {
  return c.status === "match" || c.status === "not_applicable" ? c.status : `${c.status}${c.canonical ? `: ${safeDecode(c.canonical)}` : ""}`;
}

/** A fixed-column Markdown table; every cell is passed through mdText unless marked trusted. */
function table(headers: readonly string[], rows: readonly (readonly string[])[]): string[] {
  return [`| ${headers.join(" | ")} |`, `|${headers.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)];
}

/** A value from the closed enums in audit.ts — rendered as code, never escaped text. */
const code = (s: string) => `\`${s}\``;

export function renderMarkdown(ctx: ReportContext): string {
  const { header, recon, records, meta, oldSnapshots, pageCandidates, seedNotes, outside, limitations } = ctx;
  const L: string[] = [];
  L.push(`# Retired-URL queue audit — ${mdText(String(header.generatedAt).slice(0, 10))}`, "");
  L.push("Generated by `scripts/audit-retired-urls.ts` (rules: `lib/url-redirects/audit.ts`, output: `lib/url-redirects/audit-report.ts`). Read-only: GET requests only, one at a time.", "");
  L.push(...table(["Field", "Value"], Object.entries(header).map(([k, v]) => [mdText(k), mdText(typeof v === "string" ? v : JSON.stringify(v))])), "");
  L.push(
    "**Four questions, kept apart.** *Technical*: does the old URL answer a permanent one-hop redirect (or an approved 410) in both locales? *Semantic*: is the destination shown to be the same work? *Confidence*: how strong is that evidence (`structural` = the same record)? *Review*: is a person still owed a look? A suggested target answering 200 never resolves a source, and a medium-confidence mapping is a reasoned decision, not a verified bibliographic equivalence.",
    "",
  );

  L.push("## Reconciliation", "");
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
    ...CLASSIFICATIONS.map((c) => [code(c), recon.byClassification[c]] as [string, unknown]),
    ["**Resolved (technical + supported successor)**", recon.fullyResolved],
    ...Object.entries(recon.resolvedByConfidence).map(([k, v]) => [`…resolved redirects at ${code(k)} confidence`, v] as [string, unknown]),
    ...Object.entries(recon.byReviewStatus).map(([k, v]) => [`Review status ${code(k)}`, v] as [string, unknown]),
    ...Object.entries(recon.canonicalByStatus).map(([k, v]) => [`Canonical check ${code(k)} (locale checks)`, v] as [string, unknown]),
    ["**Not resolved**", recon.unresolved],
    ["Every original record accounted for exactly once", recon.accountedFor ? "yes" : "**NO**"],
  ];
  // Labels are fixed text written here; values may come from the data.
  L.push(...table(["Count", "Value"], rows.map(([k, v]) => [k, mdText(String(v))])), "");

  L.push("## Per-record audit", "");
  L.push(
    ...table(
      ["ID", "Source path", "en chain", "km chain", "Lands on", "Canonical en / km", "Queue", "url_redirects", "Suggestion", "Target", "Semantic", "Confidence", "Review", "Classification"],
      records.map((r) => {
        const v = r.verdict;
        const target = v.suggestion === null ? "—" : v.suggestionUnsafe ? "refused" : v.targetAvailable === null ? "unchecked" : v.targetAvailable ? "200" : "not 200";
        return [
          mdText(r.id),
          mdText(r.path),
          mdText(chainText(r.evidence.probes.en)),
          mdText(chainText(r.evidence.probes.km)),
          mdText(v.observedTarget),
          mdText(`${canonicalText(v.canonical.en)} / ${canonicalText(v.canonical.km)}`),
          mdText(queueText(r.evidence.queue)),
          mdText(rowText(r.evidence.redirectRow)),
          mdText(v.suggestion ? `${v.suggestion}${v.suggestionSource === "seed" ? " (seed)" : ""}` : null),
          target,
          code(v.semantic),
          v.semanticConfidence ? code(v.semanticConfidence) : "—",
          code(v.reviewStatus),
          code(v.classification),
        ];
      }),
    ),
    "",
  );

  const pending = records.filter((r) => r.verdict.reviewStatus === "librarian_review_pending");
  L.push("## Needs librarian review", "");
  L.push(
    pending.length
      ? "Technically resolved, semantically supported, but on evidence below high confidence. Nothing here records a librarian's approval."
      : "No resolved redirect rests on evidence below high confidence.",
    "",
  );
  if (pending.length) {
    L.push(
      ...table(
        ["ID", "Source path", "Destination", "Confidence", "Recorded basis"],
        pending.map((r) => [mdText(r.id), mdText(r.path), mdText(r.verdict.observedTarget), code(r.verdict.semanticConfidence ?? "unrecorded"), mdText(r.verdict.semanticBasis)]),
      ),
      "",
    );
  }

  const ignored = records.filter((r) => r.verdict.reviewStatus === "intentional_404");
  if (ignored.length) {
    L.push("## Intentional 404s — unresolved for URL recovery", "");
    L.push("A recorded decision to leave the URL at 404. Not a redirect and not a retirement; the recorded note says who decided and how.", "");
    L.push(...table(["ID", "Source path", "Queue", "Recorded decision"], ignored.map((r) => [mdText(r.id), mdText(r.path), mdText(queueText(r.evidence.queue)), mdText(r.verdict.ignoreNote ?? "no decision recorded in the confirmations file")])), "");
  }

  const canonicalIssues = records.filter((r) => [r.verdict.canonical.en, r.verdict.canonical.km].some((c) => c.status !== "match" && c.status !== "not_applicable"));
  L.push("## Canonical diagnostics", "");
  L.push(
    canonicalIssues.length
      ? "Destinations whose canonical link is missing, invalid, off-site, or names a different URL. Diagnostic only: nothing here changes a redirect."
      : "Every destination reached names itself as canonical, in both locales.",
    "",
  );
  if (canonicalIssues.length) {
    L.push(...table(["ID", "Destination", "en", "km"], canonicalIssues.map((r) => [mdText(r.id), mdText(r.verdict.observedTarget), mdText(canonicalText(r.verdict.canonical.en)), mdText(canonicalText(r.verdict.canonical.km))])), "");
  }

  const redirected = records.filter((r) => r.verdict.observedTarget || r.verdict.recordedTarget);
  if (redirected.length) {
    L.push("## Redirect evidence", "");
    for (const r of redirected) {
      const v = r.verdict;
      const m = v.observedTarget ? meta.get(v.observedTarget) : undefined;
      L.push(`### ${mdText(r.id)} ${mdText(r.path)}`, "");
      L.push(`- Source, en: ${mdText(chainText(r.evidence.probes.en))}`);
      L.push(`- Source, km: ${mdText(chainText(r.evidence.probes.km))}`);
      L.push(`- Recorded: url_redirects ${mdText(rowText(r.evidence.redirectRow))}; queue ${mdText(queueText(r.evidence.queue))}; seed suggestion ${mdText(r.evidence.seededSuggestion ?? "none")}`);
      if (m) {
        L.push(`- Destination record: ${mdText(m.title)}, published ${m.published}, verified by library staff ${m.verifiedByStaff ?? "unknown"}, created ${mdText(m.createdAt?.slice(0, 10) ?? "?")}`);
        const history = m.slugHistory === null ? "not read" : m.slugHistory === "unavailable" ? "unavailable" : m.slugHistory.join(", ") || "none";
        const same = Array.isArray(m.slugHistory) && m.slugHistory.includes(r.path.slice("/books/".length));
        L.push(`- Destination slug history: ${mdText(history)} — ${same ? "it WAS once at the old path (same record)" : "never at the old path (a different record)"}`);
      }
      const snaps = oldSnapshots.get(r.path);
      L.push(`- Version snapshots of the old record: ${snaps === undefined ? "not read" : snaps}${snaps === 0 ? " — its edition/ISBN cannot be recovered from version history" : ""}`);
      L.push(`- Canonical: en ${mdText(canonicalText(v.canonical.en))}; km ${mdText(canonicalText(v.canonical.km))}`);
      L.push(`- Approval: ${code(v.approval)}. Semantic: **${code(v.semantic)}**, confidence ${v.semanticConfidence ? code(v.semanticConfidence) : "—"} (${mdText(v.semanticBasis)}). Review: ${code(v.reviewStatus)}`);
      L.push(`- Classification: ${code(v.classification)}${v.reasons.length ? ` — ${mdText(v.reasons.join("; "))}` : ""}`);
      if (v.discrepancies.length) L.push(`- Discrepancies: ${mdText(v.discrepancies.join("; "))}`);
      L.push("");
    }
  }

  L.push("## Unresolved records and next action", "");
  L.push(
    ...table(
      ["ID", "Source path", "Classification", "Review", "Reviewer", "Next action", "Evidence notes", "Queue page candidates (not answers)"],
      records
        .filter((x) => !RESOLVED.has(x.verdict.classification))
        .map((r) => {
          const v = r.verdict;
          const notes = [...v.reasons, ...v.discrepancies];
          const sm = v.suggestion ? meta.get(v.suggestion) : undefined;
          if (sm) notes.push(`suggestion "${sm.title}" verified by staff: ${sm.verifiedByStaff ?? "unknown"}`);
          if (v.ignoreNote) notes.push(`recorded decision: ${v.ignoreNote}`);
          const seedNote = seedNotes.get(r.path);
          if (seedNote) notes.push(`0171 note: ${seedNote}`);
          return [
            mdText(r.id),
            mdText(r.path),
            code(v.classification),
            code(v.reviewStatus),
            code(v.reviewer),
            mdText(v.action),
            mdText(notes.join("; ") || null),
            mdText((pageCandidates.get(r.path) ?? []).join("; ") || null),
          ];
        }),
    ),
    "",
  );

  L.push("## Limitations", "");
  L.push(limitations.length ? limitations.map((l) => `- ${mdText(l)}`).join("\n") : "- None recorded by the collector.");
  L.push("- `approval` says THAT a person decided (and their role), never who; a queue decision records no bibliographic basis, so it is not semantic support.");
  L.push("- `confidence` is copied from docs/seo/retired-url-confirmations.json as recorded; an absent value reads as `unrecorded`, never as high.");
  L.push("- Production redirects are served from a 120 s edge snapshot; a decision made in the last two minutes may not be visible yet.");
  L.push("");
  return `${L.join("\n")}\n`;
}

type CsvRow = { r: AuditedRecord; meta: Map<string, TargetMeta> };

/** Fixed columns. Untrusted text is quoted and formula-guarded by lib/export/csv. */
const CSV_COLUMNS: ExportColumn<CsvRow>[] = [
  { key: "id", header: "id", value: ({ r }) => r.id },
  { key: "source_path", header: "source_path", value: ({ r }) => r.path },
  { key: "locale_checks", header: "locale_checks", value: () => 2 },
  { key: "en_status", header: "en_status", value: ({ r }) => r.evidence.probes.en?.hops[0]?.status ?? "no_answer" },
  { key: "en_location", header: "en_location", value: ({ r }) => safeDecode(r.evidence.probes.en?.hops[0]?.location ?? "") },
  { key: "en_chain", header: "en_chain", value: ({ r }) => chainText(r.evidence.probes.en) },
  { key: "km_status", header: "km_status", value: ({ r }) => r.evidence.probes.km?.hops[0]?.status ?? "no_answer" },
  { key: "km_location", header: "km_location", value: ({ r }) => safeDecode(r.evidence.probes.km?.hops[0]?.location ?? "") },
  { key: "km_chain", header: "km_chain", value: ({ r }) => chainText(r.evidence.probes.km) },
  { key: "final_destination", header: "final_destination", value: ({ r }) => r.verdict.observedTarget },
  { key: "canonical_en", header: "canonical_en", value: ({ r }) => r.verdict.canonical.en.status },
  { key: "canonical_en_url", header: "canonical_en_url", value: ({ r }) => safeDecode(r.verdict.canonical.en.canonical ?? "") },
  { key: "canonical_km", header: "canonical_km", value: ({ r }) => r.verdict.canonical.km.status },
  { key: "canonical_km_url", header: "canonical_km_url", value: ({ r }) => safeDecode(r.verdict.canonical.km.canonical ?? "") },
  { key: "queue_resolution", header: "queue_resolution", value: ({ r }) => (typeof r.evidence.queue === "string" ? r.evidence.queue : r.evidence.queue.resolution) },
  { key: "queue_decided_by_person", header: "queue_decided_by_person", value: ({ r }) => (typeof r.evidence.queue === "string" ? "" : String(r.evidence.queue.decidedByPerson)) },
  { key: "redirect_row", header: "redirect_row", value: ({ r }) => rowText(r.evidence.redirectRow) },
  { key: "suggestion", header: "suggestion", value: ({ r }) => r.verdict.suggestion },
  { key: "suggestion_source", header: "suggestion_source", value: ({ r }) => r.verdict.suggestionSource },
  { key: "target_available", header: "target_available", value: ({ r }) => (r.verdict.targetAvailable === null ? "" : String(r.verdict.targetAvailable)) },
  { key: "destination_verified_by_staff", header: "destination_verified_by_staff", value: ({ r, meta }) => { const v = r.verdict.observedTarget ? meta.get(r.verdict.observedTarget)?.verifiedByStaff : null; return v === null || v === undefined ? "" : String(v); } },
  { key: "approval", header: "approval", value: ({ r }) => r.verdict.approval },
  { key: "semantic", header: "semantic", value: ({ r }) => r.verdict.semantic },
  { key: "semantic_confidence", header: "semantic_confidence", value: ({ r }) => r.verdict.semanticConfidence },
  { key: "review_status", header: "review_status", value: ({ r }) => r.verdict.reviewStatus },
  { key: "classification", header: "classification", value: ({ r }) => r.verdict.classification },
  { key: "reviewer", header: "reviewer", value: ({ r }) => r.verdict.reviewer },
  { key: "recommended_action", header: "recommended_action", value: ({ r }) => r.verdict.action },
  { key: "ignore_note", header: "ignore_note", value: ({ r }) => r.verdict.ignoreNote },
];

export function renderCsv(records: readonly AuditedRecord[], meta: Map<string, TargetMeta>): string {
  return toCsv(records.map((r) => ({ r, meta })), CSV_COLUMNS);
}
