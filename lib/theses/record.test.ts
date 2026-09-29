import { describe, it, expect } from "vitest";
import { buildThesisRecord, leadFrom, scriptOf, type ThesisRecordInput } from "@/lib/theses/record";

// A translator that shows which key was asked for, and with what.
const t = (key: string, values?: Record<string, string | number>) =>
  values ? `${key}(${Object.entries(values).map(([k, v]) => `${k}=${v}`).join(",")})` : key;

const ROW = {
  id: "8f1c2a90-0000-4000-8000-000000000001",
  slug: "play-based-numeracy",
  title: "Using Play-Based Learning to Build Early Numeracy",
  title_km: "ការប្រើប្រាស់ការរៀនតាមរយៈការលេង",
  abstract:
    "This study tested play-based lessons with 64 first-graders. Scores rose by a third. Teachers found the lessons easy to run.",
  abstract_km: null,
  author_names: "Sok Dara",
  advisor_name: "Dr. Chan Sophal",
  co_advisor_name: "",
  program: "b_ed_12_4",
  faculty: "primary",
  cohort: 12,
  academic_year: "2023–2024",
  thesis_type: "thesis",
  language: "en",
  license: "cc_by_nc",
  doi: "10.1234/ptec.2024.1",
  published_at: "2024-07-18T00:00:00Z",
  defense_date: "2024-06-02",
  verified_at: "2024-09-12T00:00:00Z",
  file_url: "https://storage.example/research/x/thesis.pdf",
  download_override: null,
  keywords: ["numeracy", "play-based learning"],
  references: "Smith, J. (2020). Play. https://doi.org/10.1/abc\nLee, K. (2019). Counting.",
  table_of_contents: [
    { level: 1, number: "1", label: "Introduction", page: "1" },
    { level: 2, number: "1.1", label: "Background", page: "2" },
  ],
  view_count: 1284,
  download_count: 312,
  departments: { name: "Primary" },
};

const input = (over: Partial<ThesisRecordInput> = {}, row: Record<string, unknown> = {}): ThesisRecordInput => ({
  row: { ...ROW, ...row },
  locale: "en",
  authors: ["Sok Dara"],
  canonicalAuthors: [],
  programs: [{ code: "b_ed_12_4", name_en: "Bachelor of Education (12+4)", name_km: "បរិញ្ញាបត្រអប់រំ (១២+៤)" }],
  faculties: [{ code: "primary", program_code: "b_ed_12_4", name_en: "Primary Education", name_km: "អប់រំបឋមសិក្សា" }],
  decision: { reason: "AUTHENTICATION_REQUIRED", effectivePolicy: "allowed", rank: null },
  institution: "Phnom Penh Teacher Education College",
  siteUrl: "https://library.ptec.edu.kh",
  t,
  tTrust: t,
  ...over,
});

describe("buildThesisRecord — one fact, one place", () => {
  const r = buildThesisRecord(input());

  it("puts identity on the title page and the rest in the facts grid, each once", () => {
    expect(r.degree).toBe("Bachelor of Education (12+4)");
    expect(r.institution).toEqual({
      name: "Phnom Penh Teacher Education College",
      faculty: "Primary Education",
      cohort: "cohortNumber(number=12)",
      academicYear: "2023–2024",
    });
    expect(r.advisor).toBe("Dr. Chan Sophal");
    expect(r.coAdvisor).toBeNull();
    expect(r.facts.map((f) => f.id)).toEqual(["published", "defended", "language", "licence", "doi"]);
    // Nothing the title page states is repeated as a fact.
    const factValues = r.facts.map((f) => f.value).join(" | ");
    for (const shown of ["Primary Education", "Dr. Chan Sophal", "2023–2024", "Bachelor of Education"]) {
      expect(factValues).not.toContain(shown);
    }
  });

  it("formats a cohort number, and never doubles a cohort that is already a label", () => {
    expect(buildThesisRecord(input({}, { cohort: "12" })).institution.cohort).toBe("cohortNumber(number=12)");
    expect(buildThesisRecord(input({}, { cohort: "១២" })).institution.cohort).toBe("cohortNumber(number=១២)");
    expect(buildThesisRecord(input({}, { cohort: "Cohort 2023" })).institution.cohort).toBe("Cohort 2023");
    expect(buildThesisRecord(input({}, { cohort: null })).institution.cohort).toBeNull();
  });

  it("drops the department when it is only the faculty under another name", () => {
    expect(r.facts.some((f) => f.id === "department")).toBe(false);
    const other = buildThesisRecord(input({}, { departments: { name: "Mathematics" } }));
    expect(other.facts.find((f) => f.id === "department")?.value).toBe("Mathematics");
    // Never the raw faculty code: with no departments row there is no fact.
    const none = buildThesisRecord(input({}, { departments: null }));
    expect(none.facts.some((f) => f.id === "department")).toBe(false);
  });

  it("links the licence to its deed and the DOI to its resolver", () => {
    expect(r.facts.find((f) => f.id === "licence")).toEqual({
      id: "licence",
      label: "factLicence",
      value: "license.cc_by_nc",
      href: "https://creativecommons.org/licenses/by-nc/4.0/",
    });
    expect(r.facts.find((f) => f.id === "doi")).toMatchObject({ value: "10.1234/ptec.2024.1", href: "https://doi.org/10.1234/ptec.2024.1", mono: true });
    const unknown = buildThesisRecord(input({}, { license: "unknown" }));
    expect(unknown.facts.some((f) => f.id === "licence")).toBe(false);
  });

  it("shows the stored counts, not an optimistic +1", () => {
    expect(r.metrics).toEqual({ views: 1284, downloads: 312 });
  });

  it("uses Khmer taxonomy names on /km, falling back to English only when the Khmer name is blank", () => {
    const km = buildThesisRecord(input({ locale: "km" }));
    expect(km.degree).toBe("បរិញ្ញាបត្រអប់រំ (១២+៤)");
    expect(km.institution.faculty).toBe("អប់រំបឋមសិក្សា");
    expect(km.path).toBe("/km/theses/play-based-numeracy");
    const blank = buildThesisRecord(
      input({ locale: "km", faculties: [{ code: "primary", program_code: "b_ed_12_4", name_en: "Primary Education", name_km: " " }] }),
    );
    expect(blank.institution.faculty).toBe("Primary Education");
  });
});

describe("buildThesisRecord — titles and lead", () => {
  it("keeps the Khmer title unless it repeats the title", () => {
    expect(buildThesisRecord(input()).titleKm).toBe("ការប្រើប្រាស់ការរៀនតាមរយៈការលេង");
    expect(buildThesisRecord(input({}, { title_km: ROW.title })).titleKm).toBeNull();
  });

  it("tags the title by its own script, not by the UI locale", () => {
    expect(buildThesisRecord(input({ locale: "km" })).title.lang).toBe("en");
    expect(buildThesisRecord(input({}, { title: "ការសិក្សាអំពីការអាន" })).title.lang).toBe("km");
    expect(scriptOf("PISA-D ការវាយតម្លៃ")).toBe("km");
    expect(scriptOf("Reading in Grade 3")).toBe("en");
  });

  it("leads with the SEO description, else the abstract's first sentence", () => {
    expect(buildThesisRecord(input()).lead).toBe("This study tested play-based lessons with 64 first-graders.");
    expect(leadFrom("  A librarian's one-line summary. ", "Ignored.")).toBe("A librarian's one-line summary.");
    expect(leadFrom("", "សេចក្ដីសង្ខេប។ ប្រយោគទីពីរ")).toBe("សេចក្ដីសង្ខេប។");
    expect(leadFrom(null, "")).toBeNull();
  });

  it("cuts a long lead on a word boundary, never mid-word", () => {
    const long = `${"word ".repeat(60)}end.`;
    const lead = leadFrom(null, long)!;
    expect(lead.length).toBeLessThanOrEqual(241);
    expect(lead.endsWith("word…")).toBe(true);
  });
});

describe("buildThesisRecord — access and sections", () => {
  it("renders the anonymous reader's state; the viewer's half is resolved in the browser", () => {
    const r = buildThesisRecord(input());
    expect(r.access.state).toBe("sign_in");
    expect(r.sections.map((s) => s.id)).toEqual(["abstract", "contents", "full-text", "references"]);
    expect(r.sections.find((s) => s.id === "references")?.count).toBe(2);
  });

  it("offers no full-text section for a protected record, and names the rank only inside the Top N", () => {
    const top = buildThesisRecord(input({ decision: { reason: "TOP_TEN_RESTRICTED", effectivePolicy: "blocked", rank: 3 } }));
    expect(top.access).toMatchObject({ state: "protected", blockedBy: "top_ten", canRead: false });
    expect(top.rank).toBe(3);
    expect(top.sections.some((s) => s.id === "full-text")).toBe(false);

    const ranked = buildThesisRecord(input({ decision: { reason: "AUTHENTICATION_REQUIRED", effectivePolicy: "allowed", rank: 42 } }));
    expect(ranked.rank).toBeNull();
  });

  it("offers no full-text section without a PDF, and lists only sections with content", () => {
    const bare = buildThesisRecord(
      input({ decision: { reason: "FILE_UNAVAILABLE", effectivePolicy: "allowed", rank: null } }, {
        file_url: null,
        references: null,
        table_of_contents: null,
      }),
    );
    expect(bare.access.state).toBe("no_file");
    expect(bare.sections.map((s) => s.id)).toEqual(["abstract"]);
  });
});

describe("buildThesisRecord — citations", () => {
  const r = buildThesisRecord(input({ authors: ["Sok Dara", "Lim Sreyneang"], canonicalAuthors: ["Sok Dara", "Lim Sreyneang"] }));

  it("renders all six formats on the server, with the canonical authors", () => {
    expect(r.citations.map((c) => c.format)).toEqual(["apa", "mla", "chicago", "ieee", "bibtex", "ris"]);
    expect(r.citations.find((c) => c.format === "apa")!.text).toMatch(/Lim/);
    expect(r.citations.filter((c) => c.code).map((c) => c.format)).toEqual(["bibtex", "ris"]);
  });

  it("keeps the row's own byline in the citation when the graph has no credits", () => {
    const legacy = buildThesisRecord(input({ authors: ["Sok Dara"], canonicalAuthors: [] }, { author_names: "Sok Dara" }));
    expect(legacy.citations[0].text).toMatch(/Sok/);
    expect(legacy.citations[0].text).not.toMatch(/Lim/);
  });

  it("never carries the storage URL to the browser", () => {
    expect(JSON.stringify(r)).not.toContain("storage.example");
  });

  it("builds the contact and corrections links in the page's locale", () => {
    const km = buildThesisRecord(input({ locale: "km" }));
    expect(km.contactHref.startsWith("/km/contact?")).toBe(true);
    expect(r.reportHref).toMatch(/^\/contact\?subject=Incorrect\+record\+details/);
    expect(r.signInHref).toBe("/auth/login?callbackUrl=%2Ftheses%2Fplay-based-numeracy");
    expect(r.permalink).toBe("https://library.ptec.edu.kh/theses/play-based-numeracy");
  });
});
