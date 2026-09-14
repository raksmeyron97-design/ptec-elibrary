/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { SITE_URL } from "@/lib/seo/site";
import {
  buildIssueMetadata,
  buildJournalMetadata,
  issueJsonLd,
  journalIssns,
  journalJsonLd,
  partOfChain,
  periodicalId,
  periodicalNode,
  type JournalPageSeoInput,
} from "@/lib/seo/journal-seo";
import { publicationJsonLd, buildPublicationMetadata, type PublicationSeoInput } from "@/lib/seo/publication-seo";
import { apa, publicationToCitationWork } from "@/lib/citations";
import { mapRowToPublication } from "@/lib/publications";

const CJTE: JournalPageSeoInput = {
  slug: "cambodian-journal-of-teacher-education",
  title: "Cambodian Journal of Teacher Education",
  titleKm: "ទស្សនាវដ្ដីគរុកោសល្យកម្ពុជា",
  issn: "2789-0001", // fails its check digit — a fixture for "never published"
  publisher: "PTEC Press",
  articleCount: 3,
  isIndexable: true,
};

describe("Periodical node", () => {
  it("publishes only check-digit-valid ISSNs", () => {
    expect(journalIssns({ issn: "2789-0001" })).toEqual([]);
    expect(journalIssns({ issn: "0021-9584", eIssn: "00219584" })).toEqual(["0021-9584"]);
    expect((periodicalNode(CJTE, "en") as any).issn).toBeUndefined();
  });

  it("uses the article's own ISSN only when the journal holds none, and only if valid", () => {
    expect((periodicalNode({ slug: "j", title: "J" }, "en", "0021-9584") as any).issn).toBe("0021-9584");
    expect((periodicalNode({ slug: "j", title: "J" }, "en", "2789-0001") as any).issn).toBeUndefined();
  });

  it("asserts a publisher only when the journal record names one", () => {
    expect((periodicalNode({ slug: "j", title: "J" }, "en") as any).publisher).toBeUndefined();
    expect((periodicalNode(CJTE, "en") as any).publisher).toEqual({ "@type": "Organization", name: "PTEC Press" });
  });

  it("has a locale-free @id and a locale-correct url", () => {
    const km = periodicalNode(CJTE, "km") as any;
    expect(km["@id"]).toBe(`${SITE_URL}/journals/${CJTE.slug}#periodical`);
    expect(km.url).toBe(`${SITE_URL}/km/journals/${CJTE.slug}`);
  });
});

describe("partOfChain — Issue → Volume → Periodical, as far as the data goes", () => {
  it("builds the full chain for an issue with a volume", () => {
    const chain = partOfChain(CJTE, "en", { issue: { slug: "vol-7-issue-2", issueNumber: "2", volumeNumber: "7" } }) as any;
    expect(chain["@type"]).toBe("PublicationIssue");
    expect(chain.isPartOf["@type"]).toBe("PublicationVolume");
    expect(chain.isPartOf.volumeNumber).toBe("7");
    expect(chain.isPartOf.isPartOf["@id"]).toBe(periodicalId(CJTE.slug));
  });

  it("an issue without a volume points straight at the Periodical; a volume alone is Volume → Periodical", () => {
    expect((partOfChain(CJTE, "en", { issue: { slug: "issue-3", issueNumber: "3" } }) as any).isPartOf["@type"]).toBe("Periodical");
    expect((partOfChain(CJTE, "en", { volumeNumber: "7" }) as any)["@type"]).toBe("PublicationVolume");
    expect((partOfChain(CJTE, "en") as any)["@type"]).toBe("Periodical");
  });
});

describe("journal and issue pages", () => {
  it("a journal page with no public article is noindex, follow", () => {
    expect(buildJournalMetadata({ ...CJTE, articleCount: 0 }, "en").robots).toEqual({ index: false, follow: true });
    expect(buildJournalMetadata(CJTE, "en").robots).toBeUndefined();
    expect(buildJournalMetadata({ ...CJTE, isIndexable: false }, "en").robots).toEqual({ index: false, follow: true });
  });

  it("canonical and hreflang are the journal's own URL in both locales", () => {
    const md = buildJournalMetadata(CJTE, "km");
    expect(md.alternates?.canonical).toBe(`${SITE_URL}/km/journals/${CJTE.slug}`);
    expect((md.alternates?.languages as any).en).toBe(`${SITE_URL}/journals/${CJTE.slug}`);
  });

  it("journal JSON-LD is a Periodical with the shared @id", () => {
    const ld = journalJsonLd(CJTE, "en") as any;
    expect(ld["@type"]).toBe("Periodical");
    expect(ld["@id"]).toBe(periodicalId(CJTE.slug));
  });

  it("issue JSON-LD lists its articles at their canonical /journals/articles URLs", () => {
    const ld = issueJsonLd(CJTE, { slug: "vol-7-issue-2", issueNumber: "2", volumeNumber: "7" }, [
      { slug: "a", title: "A", doi: "10.5281/zenodo.9000001", pageStart: "114", pageEnd: "139" },
    ], "en") as any;
    expect(ld["@type"]).toBe("PublicationIssue");
    expect(ld.hasPart[0].url).toBe(`${SITE_URL}/journals/articles/a`);
    expect(ld.hasPart[0].identifier.value).toBe("10.5281/zenodo.9000001");
    expect(buildIssueMetadata(CJTE, { slug: "vol-7-issue-2", label: "Vol. 7, No. 2" }, "en").alternates?.canonical).toBe(
      `${SITE_URL}/journals/${CJTE.slug}/issues/vol-7-issue-2`,
    );
  });
});

const ARTICLE: PublicationSeoInput = {
  slug: "first-posting-graduates-longitudinal",
  title: "What Happens After Graduation",
  authors: ["Sok Dara"],
  journalName: "Cambodian Journal of Teacher Education",
  volume: "7",
  issue: "2",
  pageStart: "114",
  pageEnd: "139",
  doi: "10.5281/zenodo.9000001",
  issn: "2789-0001",
  publicationDate: "2025-06-18",
};

describe("the article's ScholarlyArticle joins the journal graph", () => {
  it("mapped to a public journal: isPartOf is the Issue chain with the journal page's ids", () => {
    const ld = publicationJsonLd(
      { ...ARTICLE, journalRef: { ...CJTE, issue: { slug: "vol-7-issue-2", issueNumber: "2", volumeNumber: "7" } } },
      "en",
    ) as any;
    expect(ld.url).toBe(`${SITE_URL}/journals/articles/${ARTICLE.slug}`);
    expect(ld.isPartOf["@id"]).toBe(`${SITE_URL}/journals/${CJTE.slug}/issues/vol-7-issue-2#issue`);
    expect(ld.isPartOf.isPartOf.isPartOf["@id"]).toBe(periodicalId(CJTE.slug));
  });

  it("unmapped: exactly the pre-0148 Periodical built from the article's own text", () => {
    const ld = publicationJsonLd(ARTICLE, "en") as any;
    expect(ld.isPartOf).toEqual({ "@type": "Periodical", name: "Cambodian Journal of Teacher Education" });
    expect(ld.volumeNumber).toBe("7");
    expect(ld.issueNumber).toBe("2");
  });

  it("canonical and hreflang moved to /journals/articles in both locales", () => {
    const md = buildPublicationMetadata(ARTICLE, "km");
    expect(md.alternates?.canonical).toBe(`${SITE_URL}/km/journals/articles/${ARTICLE.slug}`);
    expect((md.alternates?.languages as any)["x-default"]).toBe(`${SITE_URL}/journals/articles/${ARTICLE.slug}`);
  });
});

describe("a scholarly citation carries journal, volume(issue), pages and DOI — for the reader and the AI alike", () => {
  it("APA: Author. (Year). Title. Journal, Volume(Issue), pages. DOI", () => {
    const pub = mapRowToPublication({
      id: "x",
      slug: ARTICLE.slug,
      title: ARTICLE.title,
      journal_name: ARTICLE.journalName,
      volume: "7",
      issue_no: "2",
      page_start: "114",
      page_end: "139",
      doi: ARTICLE.doi,
      publication_date: "2025-06-18",
      author_names: "Sok Dara",
      created_at: "2025-06-18",
    });
    const ref = apa(publicationToCitationWork(pub));
    expect(ref).toContain("Cambodian Journal of Teacher Education");
    expect(ref).toMatch(/7\s*\(2\)/);
    expect(ref).toMatch(/114.139/);
    expect(ref).toContain("10.5281/zenodo.9000001");
  });
});
