import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  classifyJournalMapping,
  journalCleanName,
  journalMatchKey,
  journalsMatching,
  spellingCollisions,
  summarizeMapping,
  type MappingArticle,
} from "@/lib/journals/mapping";

const MIGRATION = fs.readFileSync(
  path.resolve(__dirname, "..", "..", "supabase", "migrations", "0148_journals.sql"),
  "utf8",
);
/** The migration with its comments removed (rollback notes are comments). */
const SQL = MIGRATION.replace(/--.*$/gm, "");

function fnBody(name: string): string {
  const start = SQL.indexOf(`function public.${name}(`);
  expect(start, `${name} not found`).toBeGreaterThan(-1);
  const open = SQL.indexOf("$$", start);
  const close = SQL.indexOf("$$", open + 2);
  return SQL.slice(open + 2, close);
}

describe("journalMatchKey — the one definition of 'the same journal name'", () => {
  it("trims, collapses whitespace and case-folds", () => {
    expect(journalMatchKey("  Journal   of\tChemical Education ")).toBe("journal of chemical education");
  });

  it("does nothing else — punctuation, abbreviations and accents are NOT folded", () => {
    expect(journalMatchKey("J. Chem. Educ.")).not.toBe(journalMatchKey("Journal of Chemical Education"));
    expect(journalMatchKey("Journal of X")).not.toBe(journalMatchKey("Journal of X."));
    expect(journalMatchKey("Éducation")).not.toBe(journalMatchKey("Education"));
  });

  it("keeps Khmer intact and treats blank as no name", () => {
    expect(journalMatchKey(" ទស្សនាវដ្ដីគរុកោសល្យ ")).toBe("ទស្សនាវដ្ដីគរុកោសល្យ");
    expect(journalMatchKey("   ")).toBeNull();
    expect(journalMatchKey(null)).toBeNull();
  });

  it("clean name keeps case", () => {
    expect(journalCleanName("  Journal  of X ")).toBe("Journal of X");
  });

  it("is the same three steps as the SQL twin, and nothing looser", () => {
    const body = fnBody("journal_match_key");
    expect(body).toContain("btrim(");
    expect(body).toContain("regexp_replace(");
    expect(body).toContain("'\\s+', ' ', 'g'");
    expect(body).toContain("lower(");
    expect(body).not.toMatch(/unaccent|similarity|levenshtein|soundex|%/);
  });
});

const J = [
  { id: "j1", title: "Journal of Chemical Education", aliases: ["J. Chem. Educ."] },
  { id: "j2", title: "Cambodian Journal of Teacher Education", aliases: [] },
];
const art = (over: Partial<MappingArticle>): MappingArticle => ({
  journal_name: null, volume: null, issue_no: null, journal_id: null, volume_id: null, issue_id: null, ...over,
});

describe("classifyJournalMapping — same statuses as journal_mapping_report", () => {
  it("mapped only when every named level resolved and the text matches the canonical title", () => {
    expect(classifyJournalMapping(art({ journal_name: "Journal of Chemical Education", journal_id: "j1" }), J)).toBe("mapped");
    expect(
      classifyJournalMapping(art({ journal_name: "Journal of Chemical Education", volume: "102", journal_id: "j1", volume_id: "v" }), J),
    ).toBe("mapped");
  });
  it("partial when a named volume or issue did not resolve", () => {
    expect(classifyJournalMapping(art({ journal_name: "Journal of Chemical Education", issue_no: "3", journal_id: "j1" }), J)).toBe("partial");
  });
  it("invalid when mapped text disagrees with the canonical row", () => {
    expect(classifyJournalMapping(art({ journal_name: "j. chem. educ.", journal_id: "j1" }), J)).toBe("invalid");
  });
  it("unmapped, ambiguous and no_journal are told apart", () => {
    expect(classifyJournalMapping(art({ journal_name: "Some Other Journal" }), J)).toBe("unmapped");
    expect(classifyJournalMapping(art({}), J)).toBe("no_journal");
    const clash = [...J, { id: "j3", title: "Other", aliases: ["journal of chemical education"] }];
    expect(classifyJournalMapping(art({ journal_name: "Journal of Chemical Education" }), clash)).toBe("ambiguous");
  });
  it("an alias matches only by the same key", () => {
    expect(journalsMatching("  j. CHEM.  educ. ", J).map((j) => j.id)).toEqual(["j1"]);
    expect(journalsMatching("J Chem Educ", J)).toEqual([]);
  });
  it("summarizes every status", () => {
    const s = summarizeMapping(["mapped", "mapped", "unmapped"]);
    expect(s).toMatchObject({ total: 3, mapped: 2, unmapped: 1, ambiguous: 0 });
  });
});

describe("spellingCollisions — what the backfill refuses to guess", () => {
  it("reports two spellings that fold to one key, and nothing that is merely repeated", () => {
    const out = spellingCollisions(["Journal of X", "journal of x", "Journal  of X", "Journal of Y", "Journal of Y"]);
    expect([...out.entries()]).toEqual([["journal of x", ["Journal of X", "journal of x"]]]);
  });
});

// ── Migration invariants ─────────────────────────────────────────────────────
describe("0148 is additive, deterministic and hierarchy-safe", () => {
  it("drops no table and no column outside the rollback comments", () => {
    expect(SQL).not.toMatch(/drop\s+table/i);
    expect(SQL).not.toMatch(/drop\s+column/i);
    expect(SQL).not.toMatch(/alter\s+table\s+public\.publications\s+rename/i);
  });

  it("never orders or filters on created_at (hosted chain drift)", () => {
    expect(SQL).not.toMatch(/order\s+by[^;]*created_at/i);
    expect(SQL).not.toMatch(/where[^;]*created_at/i);
  });

  it("makes cross-journal and cross-volume assignment a foreign-key violation", () => {
    for (const fk of [
      "journal_issues_volume_in_journal",
      "publications_volume_in_journal",
      "publications_issue_in_journal",
      "publications_issue_in_volume",
    ]) {
      expect(SQL, fk).toContain(fk);
    }
    expect(SQL).toMatch(/foreign key \(volume_id, journal_id\)\s+references public\.journal_volumes \(id, journal_id\)/);
    expect(SQL).toMatch(/foreign key \(issue_id, journal_id\) references public\.journal_issues \(id, journal_id\)/);
    expect(SQL).toMatch(/foreign key \(issue_id, volume_id\) references public\.journal_issues \(id, volume_id\)/);
    expect(SQL).toContain("check ((volume_id is null and issue_id is null) or journal_id is not null)");
  });

  it("the trigger never creates a journal — only volumes and issues inside a resolved one", () => {
    for (const fn of ["publications_sync_journal_refs", "journal_ensure_volume", "journal_ensure_issue", "journal_resolve_id"]) {
      expect(fnBody(fn), fn).not.toMatch(/insert\s+into\s+public\.journals\b/i);
    }
  });

  it("an ambiguous name resolves to nothing rather than a tie-break", () => {
    expect(fnBody("journal_resolve_id")).toMatch(/count\(\*\) from hits\) = 1/);
  });

  it("the backfill creates no journal for a spelling collision, and copies no ISSN or publisher", () => {
    const backfill = SQL.slice(SQL.indexOf("0148 backfill") - 2000);
    expect(backfill).toContain("k.variants = 1");
    const insert = SQL.slice(SQL.indexOf("insert into public.journals (slug, title, is_published)"));
    expect(insert.slice(0, 200)).not.toMatch(/issn|publisher/);
  });

  it("enables RLS on all three tables and exposes only public rows to anon", () => {
    expect(SQL).toMatch(/alter table public\.journals\s+enable row level security/);
    expect(SQL).toMatch(/alter table public\.journal_volumes\s+enable row level security/);
    expect(SQL).toMatch(/alter table public\.journal_issues\s+enable row level security/);
    expect(SQL).toContain("revoke all on public.journal_mapping_report from public, anon, authenticated");
  });

  it("an issue page exists only with a published article (no orphan issue)", () => {
    const view = SQL.slice(SQL.indexOf("create view public.journal_issues_public"));
    expect(view.slice(0, 800)).toMatch(/where p\.issue_id = i\.id and p\.is_published = true/);
    expect(view.slice(0, 800)).toContain("j.is_published = true");
  });

  it("recreates publications_with_stats so the new columns are visible through it", () => {
    expect(SQL).toMatch(/drop view if exists public\.publications_with_stats;\s+create view public\.publications_with_stats/);
  });

  it("reserves the `articles` slug, which is the article route's segment", () => {
    expect(SQL).toContain("slug not in ('articles')");
  });
});
