// scripts/audit-contributor-graph.ts
//
//   npx tsx scripts/audit-contributor-graph.ts
//   npx tsx scripts/audit-contributor-graph.ts --out reports/seo
//   SUPABASE_URL=… SUPABASE_KEY=… npx tsx scripts/audit-contributor-graph.ts --label production
//
// READ-ONLY BY CONTRACT. It opens no write path; the client it builds is only
// ever `select`ed from, and every output goes to a file under --out.
//
// ── What it answers ─────────────────────────────────────────────────────────
//
// SEO 3.2 made the canonical contributor graph the preferred public read. That
// only helps where the graph is right, so three questions need standing,
// repeatable answers:
//
//   COVERAGE  — which resources have canonical credits, and which are still
//               answered by a legacy byline.
//   INTEGRITY — duplicate identities, duplicate edges, missing names, rows
//               whose stored type disagrees with what their name reads as.
//   CONFLICT  — resources where the canonical credits and the legacy byline
//               name DIFFERENT people. Never auto-resolved: a conflict is a
//               cataloguing decision, and silently preferring either side is
//               how one becomes permanent.
//
// It deliberately separates NORMALIZATION from DISAGREEMENT. "A, B (Editors)"
// versus canonical [A, B] is the system working — the role moved to its own
// column. "John Smith" versus canonical [Jane Doe] is a data defect. Counting
// them together produces a number nobody can act on.
//
// ── Which database ──────────────────────────────────────────────────────────
//
// Whatever the environment names, printed in the header so the output cannot
// be mistaken for production. `.env.local` on a developer machine routinely
// points at a local stack; SUPABASE_URL/SUPABASE_KEY override it explicitly
// for an audited production read.

import { config } from "dotenv";
config({ path: ".env.local" });

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

import {
  kindOfCanonicalRow,
  viewsFromCanonical,
  type CanonicalContributorRow,
} from "../lib/resources/contributor-view";
import { normalizeByline } from "../lib/resources/contributor-identity";
import { parseAuthorNames } from "../lib/resources/author-names";
import type { OrgIdentity } from "../lib/system-settings/org-identity";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── CLI ──────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (name: string, fallback?: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};

const OUT_DIR = flag("out", "reports/seo")!;
const LABEL = flag("label");

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("No Supabase credentials. Set SUPABASE_URL/SUPABASE_KEY or .env.local.");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

/**
 * The identity the institution check compares against.
 *
 * Read from published settings when the table is reachable, so the audit and
 * the running site agree on who "the institution" is. Never a literal here —
 * the name is editable in System Settings and a copy would go stale.
 */
async function orgIdentity(): Promise<OrgIdentity | undefined> {
  // Same shape lib/system-settings/config.ts reads: one row per section, with
  // the live document in `published`. Falling back to the code defaults would
  // be wrong here — this script reports on a SPECIFIC database, and an
  // identity borrowed from another source would silently mislabel who "the
  // institution" is in that database's data.
  const { data } = await db
    .from("site_settings")
    .select("section, published")
    .eq("section", "organization")
    .maybeSingle();
  const org = (data as any)?.published;
  if (!org?.name?.en) return undefined;
  return {
    institutionName: org.name.en,
    institutionNameKm: org.name.km ?? "",
    abbreviation: org.name.short ?? "",
  } as unknown as OrgIdentity;
}

// ── Loading ──────────────────────────────────────────────────────────────────

const PAGE = 1000;

async function loadAll<T>(table: string, columns: string): Promise<T[] | null> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(table).select(columns).range(from, from + PAGE - 1);
    if (error) {
      console.error(`  ! ${table}: ${error.message}`);
      return null;
    }
    out.push(...((data ?? []) as unknown as T[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

type ContributorRow = {
  id: string;
  display_name: string | null;
  name_km: string | null;
  contributor_type: string | null;
  source: string | null;
  orcid: string | null;
};

type EdgeRow = {
  resource_type: string;
  resource_id: string;
  contributor_id: string;
  role: string | null;
  sequence: number | null;
};

type ResourceRow = { id: string; title: string | null; byline: string | null; slug?: string | null };

function fold(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[.,'"“”‘’\-–—_()[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Report shapes ────────────────────────────────────────────────────────────

type Integrity = {
  generatedAt: string;
  database: string;
  label: string | null;
  institutionResolved: boolean;
  contributors: {
    total: number;
    person: number;
    organization: number;
    institution: number;
    /** A stored contributor whose own name still names more than one entity —
     *  a composite that reached the canonical table. The read model expands
     *  these at render time, so they are not a live SEO defect; they are a
     *  measure of how much of the graph still needs splitting AT THE SOURCE. */
    composite: number;
    /** A row with no usable display name: it can denote nothing. */
    unknown: number;
    /** Stored type disagrees with what the name reads as. */
    typeConflicts: number;
    withOrcid: number;
  };
  edges: {
    total: number;
    byResourceType: Record<string, number>;
    byRole: Record<string, number>;
    duplicateEdges: number;
    orphanEdges: number;
  };
  coverage: Record<
    string,
    { resources: number; canonical: number; legacyOnly: number; neither: number }
  >;
  duplicateIdentities: { name: string; type: string; ids: string[] }[];
};

type Conflict = {
  resourceType: string;
  resourceId: string;
  title: string;
  legacy: string;
  canonical: string[];
  kind: "normalization" | "disagreement" | "partial";
  note: string;
};

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nContributor graph audit\n  database: ${SUPABASE_URL}`);
  if (LABEL) console.log(`  label:    ${LABEL}`);

  const org = await orgIdentity();
  console.log(`  identity: ${org ? "resolved from published settings" : "NOT resolved"}\n`);

  const contributors = await loadAll<ContributorRow>(
    "contributors",
    "id, display_name, name_km, contributor_type, source, orcid",
  );
  const edges = await loadAll<EdgeRow>(
    "resource_contributors",
    "resource_type, resource_id, contributor_id, role, sequence",
  );

  if (!contributors || !edges) {
    console.error("\nCannot audit: the canonical tables did not answer. Nothing written.\n");
    process.exit(2);
  }

  const byId = new Map(contributors.map((c) => [c.id, c]));

  // ── Contributor census ────────────────────────────────────────────────────
  const census = { person: 0, organization: 0, institution: 0, composite: 0, unknown: 0 };
  let typeConflicts = 0;
  const duplicates = new Map<string, { name: string; type: string; ids: string[] }>();

  for (const c of contributors) {
    const name = (c.display_name ?? "").trim();
    if (!name) {
      census.unknown++;
      continue;
    }

    const row: CanonicalContributorRow = {
      contributorId: c.id,
      displayName: name,
      nameKm: c.name_km,
      contributorType:
        c.contributor_type === "organization" || c.contributor_type === "person"
          ? c.contributor_type
          : null,
      recordSource: c.source,
      role: "author",
      sequence: 0,
    };
    const { kind, typeConflict } = kindOfCanonicalRow(row, org);
    if (typeConflict) typeConflicts++;

    // A stored contributor that STILL names several entities is a composite
    // that reached the canonical table — counted separately from its kind,
    // because the defect is the row's granularity, not its type.
    const normalized = normalizeByline(name, org);
    const isComposite =
      kind === "person" && (!normalized.resolved || parseAuthorNames(name).length > 1);
    if (isComposite) census.composite++;
    else census[kind]++;

    const key = `${fold(name)}::${c.contributor_type ?? "?"}`;
    const existing = duplicates.get(key);
    if (existing) existing.ids.push(c.id);
    else duplicates.set(key, { name, type: c.contributor_type ?? "?", ids: [c.id] });
  }

  // ── Edge census ───────────────────────────────────────────────────────────
  const byResourceType: Record<string, number> = {};
  const byRole: Record<string, number> = {};
  const edgeKeys = new Set<string>();
  let duplicateEdges = 0;
  let orphanEdges = 0;
  const canonicalByResource = new Map<string, EdgeRow[]>();

  for (const e of edges) {
    byResourceType[e.resource_type] = (byResourceType[e.resource_type] ?? 0) + 1;
    byRole[e.role ?? "author"] = (byRole[e.role ?? "author"] ?? 0) + 1;
    if (!byId.has(e.contributor_id)) orphanEdges++;

    const key = `${e.resource_type}:${e.resource_id}:${e.contributor_id}`;
    if (edgeKeys.has(key)) duplicateEdges++;
    edgeKeys.add(key);

    const rkey = `${e.resource_type}:${e.resource_id}`;
    const list = canonicalByResource.get(rkey);
    if (list) list.push(e);
    else canonicalByResource.set(rkey, [e]);
  }

  // ── Coverage + conflicts, per resource type ───────────────────────────────
  const RESOURCES: { type: string; table: string; byline: string; title: string }[] = [
    { type: "book", table: "books", byline: "author_id", title: "title" },
    { type: "thesis", table: "research_reports", byline: "author_names", title: "title" },
    // `author_names` is an aggregate on the stats VIEW — the base table has no
    // such column, it has the publication_authorships relation instead.
    { type: "publication", table: "publications_with_stats", byline: "author_names", title: "title" },
  ];

  const coverage: Integrity["coverage"] = {};
  const conflicts: Conflict[] = [];

  for (const spec of RESOURCES) {
    // Books store the byline behind a FK, so the byline comes from the joined
    // author row; theses and publications carry it as text.
    const columns =
      spec.type === "book"
        ? "id, slug, title, authors(name)"
        : `id, slug, ${spec.title}, ${spec.byline}`;
    const rows = await loadAll<any>(spec.table, columns);
    if (!rows) {
      coverage[spec.type] = { resources: -1, canonical: -1, legacyOnly: -1, neither: -1 };
      continue;
    }

    const normalizedRows: ResourceRow[] = rows.map((r) => ({
      id: r.id,
      slug: r.slug ?? null,
      title: r.title ?? null,
      byline:
        spec.type === "book"
          ? (Array.isArray(r.authors) ? r.authors[0]?.name : r.authors?.name) ?? null
          : r[spec.byline] ?? null,
    }));

    let canonical = 0;
    let legacyOnly = 0;
    let neither = 0;

    for (const r of normalizedRows) {
      const rows_ = canonicalByResource.get(`${spec.type}:${r.id}`) ?? [];

      // Compare what the APPLICATION would publish, not the raw column. A
      // 0105-backfilled row can still hold a whole composite byline in one
      // `display_name`, and the read model expands it — so comparing the raw
      // strings reported 53 "the two sources share no name" conflicts whose
      // two sides were byte-identical. The conflict report must ask the same
      // question the renderer does.
      const canonicalNames = viewsFromCanonical(
        rows_.map((e) => {
          const c = byId.get(e.contributor_id);
          const type = c?.contributor_type;
          return {
            contributorId: e.contributor_id,
            displayName: (c?.display_name ?? "").trim(),
            nameKm: c?.name_km ?? null,
            contributorType:
              type === "organization" || type === "person" ? type : null,
            recordSource: c?.source ?? null,
            role: (e.role ?? "author") as CanonicalContributorRow["role"],
            sequence: e.sequence ?? 0,
          };
        }),
        org,
      ).map((v) => v.name);

      const legacy = (r.byline ?? "").trim();

      if (canonicalNames.length > 0) canonical++;
      else if (legacy) legacyOnly++;
      else neither++;

      if (canonicalNames.length === 0 || !legacy) continue;

      // Compare on folded names, as SETS. Order is a fact the graph carries
      // and the byline does not always state, so ordering is not a conflict.
      const canonicalSet = new Set(canonicalNames.map(fold));
      const expected = normalizeByline(legacy, org);
      const expectedNames = expected.contributors.map((c) => fold(c.displayName));

      if (expectedNames.length === 0) {
        // The byline could not be separated safely; the graph holding names
        // for it is more information, not a disagreement — UNLESS none of
        // them appear in the string at all.
        const anyPresent = canonicalNames.some((n) => fold(legacy).includes(fold(n)));
        if (!anyPresent) {
          conflicts.push({
            resourceType: spec.type,
            resourceId: r.id,
            title: r.title ?? r.id,
            legacy,
            canonical: canonicalNames,
            kind: "disagreement",
            note: "no canonical name occurs anywhere in the legacy byline",
          });
        }
        continue;
      }

      const missing = expectedNames.filter((n) => !canonicalSet.has(n));
      const extra = canonicalNames.map(fold).filter((n) => !expectedNames.includes(n));

      if (missing.length === 0 && extra.length === 0) continue; // agreement

      const overlap = expectedNames.some((n) => canonicalSet.has(n));
      conflicts.push({
        resourceType: spec.type,
        resourceId: r.id,
        title: r.title ?? r.id,
        legacy,
        canonical: canonicalNames,
        kind: overlap ? "partial" : "disagreement",
        note: overlap
          ? `byline-only: ${missing.length}, graph-only: ${extra.length}`
          : "the two sources share no name",
      });
    }

    coverage[spec.type] = { resources: normalizedRows.length, canonical, legacyOnly, neither };
  }

  // ── Emit ──────────────────────────────────────────────────────────────────
  const integrity: Integrity = {
    generatedAt: new Date().toISOString(),
    database: SUPABASE_URL,
    label: LABEL ?? null,
    institutionResolved: !!org,
    contributors: {
      total: contributors.length,
      ...census,
      typeConflicts,
      withOrcid: contributors.filter((c) => (c.orcid ?? "").trim().length > 0).length,
    },
    edges: {
      total: edges.length,
      byResourceType,
      byRole,
      duplicateEdges,
      orphanEdges,
    },
    coverage,
    duplicateIdentities: [...duplicates.values()]
      .filter((d) => d.ids.length > 1)
      .sort((a, b) => b.ids.length - a.ids.length),
  };

  write(join(OUT_DIR, "contributor-integrity.json"), JSON.stringify(integrity, null, 2));
  write(join(OUT_DIR, "contributor-integrity.md"), integrityMarkdown(integrity));
  write(
    join(OUT_DIR, "contributor-conflicts.json"),
    JSON.stringify({ generatedAt: integrity.generatedAt, database: SUPABASE_URL, label: LABEL ?? null, conflicts }, null, 2),
  );
  write(join(OUT_DIR, "contributor-conflicts.md"), conflictMarkdown(integrity, conflicts));

  console.log(integrityMarkdown(integrity));
  console.log(`\nConflicts: ${conflicts.length} (${conflicts.filter((c) => c.kind === "disagreement").length} true disagreements)`);
  console.log(`Written to ${OUT_DIR}/\n`);
}

function write(path: string, body: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body.endsWith("\n") ? body : `${body}\n`, "utf8");
}

/**
 * One markdown TABLE CELL, escaped completely.
 *
 * The backslash is escaped FIRST and the pipe second. The other order is not a
 * style preference: escaping `|` into `\|` while leaving `\` alone means an
 * input already containing `\` produces `\\|`, which markdown reads as a
 * literal backslash followed by a live column break — the cell escapes itself
 * back out of the table. CodeQL flags exactly that shape
 * (js/incomplete-sanitization), and it is right to.
 *
 * Newlines end a table row outright, so they are collapsed rather than escaped.
 */
function mdCell(value: unknown, max = 60): string {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/[\r\n]+/g, " ")
    .slice(0, max);
}

function table(rows: (string | number)[][]): string {
  const head = rows[0];
  const sep = head.map(() => "---");
  return [head, sep, ...rows.slice(1)].map((r) => `| ${r.join(" | ")} |`).join("\n");
}

function integrityMarkdown(r: Integrity): string {
  const c = r.contributors;
  const lines = [
    "# Contributor Integrity Report",
    "",
    `- Generated: \`${r.generatedAt}\``,
    `- Database: \`${r.database}\`${r.label ? ` (**${r.label}**)` : ""}`,
    `- Institution identity: ${r.institutionResolved ? "resolved from published settings" : "**NOT resolved** — institution contributors cannot be identified in this run"}`,
    "",
    "## Contributor records",
    "",
    table([
      ["Kind", "Count"],
      ["Person", c.person],
      ["Organization", c.organization],
      ["Institution", c.institution],
      ["Composite (still names several entities)", c.composite],
      ["Unknown (no usable name)", c.unknown],
      ["**Total**", `**${c.total}**`],
    ]),
    "",
    `Stored type disagrees with the name: **${c.typeConflicts}**. With an ORCID: **${c.withOrcid}**.`,
    "",
    "## Resource edges",
    "",
    table([
      ["Measure", "Count"],
      ["Total edges", r.edges.total],
      ["Duplicate edges (same resource + contributor)", r.edges.duplicateEdges],
      ["Orphan edges (contributor row missing)", r.edges.orphanEdges],
    ]),
    "",
    "By resource type: " +
      (Object.keys(r.edges.byResourceType).length
        ? Object.entries(r.edges.byResourceType).map(([k, v]) => `\`${k}\` ${v}`).join(", ")
        : "none"),
    "",
    "By role: " +
      (Object.keys(r.edges.byRole).length
        ? Object.entries(r.edges.byRole).map(([k, v]) => `\`${k}\` ${v}`).join(", ")
        : "none"),
    "",
    "## Coverage",
    "",
    table([
      ["Resource type", "Rows", "Canonical credits", "Legacy byline only", "No contributor at all"],
      ...Object.entries(r.coverage).map(([k, v]) =>
        v.resources < 0
          ? [k, "unreadable", "—", "—", "—"]
          : [k, v.resources, v.canonical, v.legacyOnly, v.neither],
      ),
    ]),
    "",
    "## Duplicate identities",
    "",
    r.duplicateIdentities.length === 0
      ? "None — no two contributor rows share an exact folded name within a type."
      : table([
          ["Name", "Type", "Rows"],
          ...r.duplicateIdentities.slice(0, 50).map((d) => [mdCell(d.name), mdCell(d.type), d.ids.length]),
        ]),
    "",
    "> Duplicates are reported, never merged. Two rows sharing a name may be two",
    "> people; merging on a name is the fabrication this stack exists to prevent.",
  ];
  return lines.join("\n");
}

function conflictMarkdown(r: Integrity, conflicts: Conflict[]): string {
  const groups = {
    disagreement: conflicts.filter((c) => c.kind === "disagreement"),
    partial: conflicts.filter((c) => c.kind === "partial"),
    normalization: conflicts.filter((c) => c.kind === "normalization"),
  };
  const section = (title: string, list: Conflict[], note: string) =>
    [
      `## ${title} — ${list.length}`,
      "",
      note,
      "",
      list.length === 0
        ? "None."
        : table([
            ["Type", "Title", "Legacy byline", "Canonical credits", "Note"],
            ...list.slice(0, 100).map((c) => [
              mdCell(c.resourceType),
              mdCell(c.title),
              mdCell(c.legacy),
              mdCell(c.canonical.join(" · ")),
              mdCell(c.note),
            ]),
          ]),
      "",
    ].join("\n");

  return [
    "# Resource Contributor Conflicts",
    "",
    `- Generated: \`${r.generatedAt}\``,
    `- Database: \`${r.database}\`${r.label ? ` (**${r.label}**)` : ""}`,
    "",
    "A conflict is where a resource's canonical credits and its legacy byline",
    "name different people. **Nothing here is auto-resolved.** Which side is",
    "right is a cataloguing decision with a URL consequence, and preferring one",
    "silently is how the wrong answer becomes permanent.",
    "",
    section(
      "True disagreement",
      groups.disagreement,
      "The two sources share no name. Treat as a data defect and resolve by hand.",
    ),
    section(
      "Partial",
      groups.partial,
      "The sources overlap but not completely — usually a byline edited after the credits were recorded, or a name the splitter could not separate.",
    ),
  ].join("\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
