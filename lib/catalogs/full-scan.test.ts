/**
 * The physical catalogue is read WHOLE, or not at all.
 *
 * PostgREST clips every one-shot select at 1,000 rows with no error. At six
 * hand-catalogued records nothing noticed; the PMB import is 2,638 records and
 * 13,429 copies, and four readers each saw an arbitrary 1,000 of them:
 *
 *   • the importer's duplicate check — a record past the first 1,000 read as
 *     "does not exist", so re-running a sheet created empty duplicates, and a
 *     FAILED read was treated the same as an empty catalogue;
 *   • the admin statistics and the Add form's category suggestions;
 *   • the public category chips;
 *   • public search, which spliced every keyword/DDC match into the listing
 *     query as `id.in.(…)` — clipped at 1,000, and long enough past a few
 *     hundred ids to exceed the proxy's request line, whose error path renders
 *     "No books found" for exactly the commonest searches.
 *
 * The behavioural half proves the matcher finds a record a clipped read would
 * never have handed it; the source half pins that these readers page.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pagedScan, POSTGREST_MAX_ROWS } from "@/lib/db/paged-scan";
import { CATALOG_SCAN_CAP } from "@/lib/catalog";
import {
  matchExistingRecords,
  titleAuthorKey,
  type ExistingCatalogRecord,
} from "@/lib/catalog-import";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

/** A catalogue of `n` records served the way PostgREST serves it: ≤ 1,000 a response. */
function fakeCatalog(n: number) {
  const rows: ExistingCatalogRecord[] = Array.from({ length: n }, (_, i) => ({
    id: `book-${String(i).padStart(5, "0")}`,
    title: `Title ${i}`,
    author: i % 3 === 0 ? null : `Author ${i}`,
    isbn: null,
    slug: `title-${i}`,
  }));
  const page = (from: number, to: number) =>
    Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + POSTGREST_MAX_ROWS)), error: null });
  return { rows, page };
}

describe("duplicate check over a catalogue larger than one response", () => {
  it("recognises a record the one-shot read could not see", async () => {
    const { page } = fakeCatalog(2_638);

    // What the importer used to do: one request, clipped at 1,000.
    const clipped = (await page(0, 1_000_000)).data;
    expect(clipped).toHaveLength(POSTGREST_MAX_ROWS);
    const want = { isbns: [], titleAuthors: [titleAuthorKey("Title 2500", "Author 2500")] };
    expect(Object.keys(matchExistingRecords(clipped, want).byTitleAuthor)).toHaveLength(0);

    // What it does now.
    const scan = await pagedScan<ExistingCatalogRecord>(page, CATALOG_SCAN_CAP);
    expect(scan.error).toBeNull();
    expect(scan.truncated).toBe(false);
    expect(scan.data).toHaveLength(2_638);
    const hit = matchExistingRecords(scan.data, want).byTitleAuthor[want.titleAuthors[0]];
    expect(hit?.existingBookId).toBe("book-02500");
  });

  it("builds one key for the preview, the batch and the existing record", () => {
    // Whitespace and case differences are the same book; a missing author is ''.
    expect(titleAuthorKey("  Group  Dynamics ", "Forsyth,  Donelson R.")).toBe(
      titleAuthorKey("group dynamics", "forsyth, donelson r."),
    );
    expect(titleAuthorKey("គណិតវិទ្យា ថ្នាក់ទី៤", null)).toBe(titleAuthorKey("គណិតវិទ្យា  ថ្នាក់ទី៤", ""));
    // …but a different author is a different record.
    expect(titleAuthorKey("Group Dynamics", "Forsyth")).not.toBe(titleAuthorKey("Group Dynamics", "Smith"));
  });

  it("matches an ISBN whatever its hyphens", () => {
    const existing: ExistingCatalogRecord[] = [
      { id: "a", title: "T", author: null, isbn: "978-0-13-468599-1", slug: "t" },
    ];
    expect(matchExistingRecords(existing, { isbns: ["9780134685991"], titleAuthors: [] }).byIsbn["9780134685991"]?.existingBookId).toBe("a");
  });
});

// ── Source half ────────────────────────────────────────────────────────────────

const FILES = [
  "app/(admin)/admin/(protected)/catalogs/import-actions.ts",
  "app/(admin)/admin/(protected)/catalogs/page.tsx",
  "app/(admin)/admin/(protected)/catalogs/add/page.tsx",
  "app/[locale]/(public)/catalogs/page.tsx",
];

/** Every awaited statement that reads catalog_books. */
function awaitedCatalogReads(src: string): string[] {
  return src
    .split(";")
    .filter((stmt) => /await\s+supabase\s*\.from\("catalog_books"\)/.test(stmt))
    .filter((stmt) => /\.select\(/.test(stmt));
}

describe("whole-collection catalogue reads page", () => {
  it.each(FILES)("%s has no awaited, unbounded catalog_books select", (file) => {
    for (const stmt of awaitedCatalogReads(read(file))) {
      // Bounded by identity, by an explicit page window, or it is a count.
      const bounded = /\.eq\("(id|slug)"|\.single\(\)|\.maybeSingle\(\)|\.range\(|\.in\("id"|head:\s*true/.test(stmt);
      expect(bounded, `unbounded read in ${file}:\n${stmt.trim().slice(0, 300)}`).toBe(true);
    }
  });

  it.each(FILES.filter((f) => f !== "app/(admin)/admin/(protected)/catalogs/import-actions.ts"))(
    "%s reads its whole-collection figures through pagedScan",
    (file) => {
      expect(read(file)).toMatch(/pagedScan</);
      expect(read(file)).toMatch(/CATALOG_SCAN_CAP/);
    },
  );

  it("public search never splices matched ids into the listing query", () => {
    const src = read("app/[locale]/(public)/catalogs/page.tsx");
    // The old shape: `…,id.in.(${[...matchIds].join(",")})` built into an .or() string.
    expect(src).not.toMatch(/id\.in\.\(\$\{/);
    // Candidate legs are paged and ordered by id; only the visible page is fetched by id.
    expect(src).toMatch(/\.in\("id", pageIds\)/);
  });
});

describe("the importer refuses to import on a partial view of the catalogue", () => {
  const src = read("app/(admin)/admin/(protected)/catalogs/import-actions.ts");

  it("reads existing records through one paged scan that throws on error or truncation", () => {
    expect(src).toMatch(/async function scanCatalog<T>/);
    expect(src).toMatch(/pagedScan<T>\([\s\S]*?\.order\("id", \{ ascending: true \}\)[\s\S]*?CATALOG_SCAN_CAP\)/);
    expect(src).toMatch(/if \(scan\.error\) \{\s*throw/);
    expect(src).toMatch(/if \(scan\.truncated\) \{\s*throw/);
  });

  it("a failed duplicate lookup fails the batch instead of importing it", () => {
    const batch = src.slice(src.indexOf("export async function runCatalogImportBatch"));
    expect(batch).toMatch(/try \{\s*dupes = await lookupDuplicates/);
    expect(batch).toMatch(/return \{ ok: false, error: `Nothing in this batch was imported/);
  });

  it("a failed barcode lookup is an error, not an empty answer", () => {
    const lookup = src.slice(src.indexOf("async function lookupDuplicates"), src.indexOf("export async function checkCatalogDuplicates"));
    expect(lookup).toMatch(/\.in\("barcode", part\)[\s\S]*?if \(error\) throw/);
    expect(lookup).not.toMatch(/if \(!error\) result\.usedBarcodes/);
  });
});
