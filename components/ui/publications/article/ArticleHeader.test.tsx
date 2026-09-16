import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import enMessages from "@/messages/en.json";
import type { Publication, PublicationAffiliation, PublicationAuthorship } from "@/lib/publications";
import { resolveDownloadAccess } from "@/lib/publications/access";
import { affiliationMarkers } from "@/lib/publications/article-layout";
import { openCiteDialog } from "@/lib/publications/cite-bus";
import ArticleHeader from "./ArticleHeader";
import ArticleSectionNav from "./ArticleSectionNav";
import ArticleToolRail from "./ArticleToolRail";
import CiteArticleDialog from "./CiteArticleDialog";
import ArticleScholarship from "./ArticleScholarship";
import { resolveServerTree } from "./test-utils";

// Server components read their strings through next-intl/server. Serve them
// from the real English catalogue, so these tests fail on a missing key.
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const messages = (await import("@/messages/en.json")).default;
  return {
    getTranslations: async (arg?: string | { namespace?: string }) =>
      createTranslator({
        locale: "en",
        messages,
        namespace: (typeof arg === "string" ? arg : arg?.namespace) as never,
      }),
  };
});
// Locale-aware links need the app's routing context; a plain anchor keeps the
// href assertions honest about what the page links to.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
// The collections menu talks to server actions; its contract here is only
// that it is offered, with the localised label.
vi.mock("@/components/ui/books/ReadingListButton", () => ({
  default: ({ label }: { label?: { add: string } }) => <button type="button">{label?.add ?? "Add to List"}</button>,
}));
vi.mock("@/components/ui/books/ShareButton", () => ({
  default: ({ label }: { label?: string }) => <button type="button">{label}</button>,
}));

beforeAll(() => {
  // jsdom 29 has no <dialog> modal API. The native focus trap and Escape are
  // the browser's; e2e/journal-article.spec.ts covers them in a real one.
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void };
  if (typeof proto.showModal !== "function") {
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
    proto.close = function (this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  }
});

afterEach(() => cleanup());

const aff = (id: string, name: string): PublicationAffiliation => ({ id, name, name_km: null, city: "Phnom Penh", country: "Cambodia" });
const person = (n: number, affiliation_ids: string[], is_corresponding = false): PublicationAuthorship => ({
  author: {
    id: `a${n}`,
    full_name: `Author Number${n}`,
    full_name_km: null,
    orcid: null,
    email: null,
    bio: null,
    bio_km: null,
    photo_url: null,
    slug: `author-number${n}`,
  },
  author_order: n,
  is_corresponding,
  affiliation_ids,
});

function pub(over: Partial<Publication> = {}): Publication {
  return {
    id: "p1",
    slug: "handmade-conductivity",
    title: "Development of a Handmade Conductivity Measurement Device",
    title_km: "ការអភិវឌ្ឍឧបករណ៍វាស់ចរន្តអគ្គិសនី",
    article_type: "article",
    journal_name: "Journal of Chemical Education",
    volume: "91",
    issue_no: "11",
    page_start: "1971",
    page_end: "1975",
    article_no: null,
    doi: "10.1021/ed500287q",
    issn: "0021-9584",
    publication_date: "2014-11-11",
    abstract: "An abstract.",
    abstract_km: null,
    keywords: ["polypyrrole"],
    publisher: "American Chemical Society",
    isbn: null,
    subjects: ["Chemistry"],
    table_of_contents: [],
    learning_outcomes: [],
    faqs: [],
    license: "CC BY 4.0",
    copyright: null,
    language: "en",
    cover_url: null,
    pdf_url: "publications/x/handmade.pdf",
    seo_title: null,
    seo_description: null,
    og_image: null,
    references: [],
    is_published: true,
    published_at: "2014-11-11",
    view_count: 0,
    download_count: 0,
    created_at: "2026-01-01",
    author_names: null,
    authorships: [],
    ...over,
  };
}

async function renderHeader(
  p: Publication,
  opts: {
    affiliations?: PublicationAffiliation[];
    journal?: { name: string | null; href: string | null };
    issue?: { label: string | null; href: string | null; year: string | null };
    neighbours?: { previous: { slug: string; title: string; title_km: null } | null; next: { slug: string; title: string; title_km: null } | null };
    doi?: { value: string; href: string } | null;
  } = {},
) {
  const authorships = p.authorships ?? [];
  const { markerFor, ordered } = affiliationMarkers(authorships, opts.affiliations ?? []);
  const access = resolveDownloadAccess({ ...p, allow_download: p.allow_download, pdf_url: p.pdf_url });
  const tree = await resolveServerTree(
    <ArticleHeader
      pub={p}
      back={{ href: "/journals/jce/issues/vol-91-issue-11", label: "Back to issue" }}
      journal={opts.journal ?? { name: "Journal of Chemical Education", href: "/journals/jce" }}
      issue={opts.issue ?? { label: "Vol. 91, No. 11", href: "/journals/jce/issues/vol-91-issue-11", year: "2014" }}
      typeLabel="Article"
      authorships={authorships}
      markerFor={markerFor}
      affiliations={ordered}
      fallbackNames={[]}
      citationLine="Journal of Chemical Education 2014, 91 (11), 1971–1975"
      dates={{ published: "11 November 2014", issue: null }}
      counts={{ views: null, downloads: null }}
      doi={opts.doi === undefined ? { value: "10.1021/ed500287q", href: "https://doi.org/10.1021/ed500287q" } : opts.doi}
      access={access}
      fileHref="/api/publications/handmade-conductivity/file"
      shareUrl="https://library.example/journals/articles/handmade-conductivity"
      neighbours={opts.neighbours ?? { previous: null, next: null }}
      locale="en"
    />,
  );
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {tree}
    </NextIntlClientProvider>,
  );
}

/** a precedes b in document order */
const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("ArticleHeader — hierarchy", () => {
  it("answers what / who / where / DOI / how, in that order", async () => {
    const affs = [aff("x", "Phnom Penh Teacher Education College")];
    await renderHeader(pub({ authorships: [person(1, ["x"], true), person(2, ["x"])] }), { affiliations: affs });

    const back = screen.getByRole("link", { name: /Back to issue/ });
    const journal = screen.getByRole("link", { name: "Journal of Chemical Education" });
    const issue = screen.getByRole("link", { name: "Vol. 91, No. 11" });
    const type = screen.getByText("Article");
    const title = screen.getByRole("heading", { level: 1 });
    const authors = screen.getByRole("list", { name: "Authors" });
    const doi = screen.getByRole("link", { name: /10\.1021\/ed500287q/ });
    const read = screen.getByRole("link", { name: "Read article" });

    for (const [a, b] of [[back, journal], [journal, issue], [issue, type], [type, title], [title, authors], [authors, doi], [doi, read]] as const) {
      expect(before(a, b)).toBe(true);
    }
    expect(journal).toHaveAttribute("href", "/journals/jce");
    expect(issue).toHaveAttribute("href", "/journals/jce/issues/vol-91-issue-11");
  });

  it("has exactly one h1 — the title, whole — and marks a translated title's language", async () => {
    const long = "A".repeat(60) + " " + "B".repeat(60) + " Poly(3,4-ethylenedioxythiophene)–polystyrenesulfonate and a very long end";
    await renderHeader(pub({ title: long }));
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent(long); // never truncated
    expect(screen.getByText("ការអភិវឌ្ឍឧបករណ៍វាស់ចរន្តអគ្គិសនី")).toHaveAttribute("lang", "km");
  });

  it("makes the DOI resolvable and copyable", async () => {
    await renderHeader(pub());
    expect(screen.getByRole("link", { name: /10\.1021\/ed500287q/ })).toHaveAttribute("href", "https://doi.org/10.1021/ed500287q");
    expect(screen.getByRole("button", { name: "Copy DOI" })).toBeInTheDocument();
  });
});

describe("ArticleHeader — authors", () => {
  it("renders one author as one entity, linked to the profile, markers outside the link", async () => {
    await renderHeader(pub({ authorships: [person(1, ["x"], true)] }), { affiliations: [aff("x", "PTEC")] });
    const list = screen.getByRole("list", { name: "Authors" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    const link = within(list).getByRole("link", { name: "Author Number1" });
    expect(link).toHaveAttribute("href", "/authors/author-number1");
    // The marker and the corresponding mark are read as words, not glyphs.
    expect(list).toHaveTextContent("(Affiliations 1)");
    expect(list).toHaveTextContent("Corresponding author");
    expect(screen.getByRole("list", { name: "Affiliations" })).toHaveTextContent("PTEC");
  });

  it("shows every author when there are many — no et al. on the work's own page", async () => {
    const twelve = Array.from({ length: 12 }, (_, i) => person(i + 1, []));
    await renderHeader(pub({ authorships: twelve }));
    expect(within(screen.getByRole("list", { name: "Authors" })).getAllByRole("listitem")).toHaveLength(12);
    expect(screen.queryByText(/et al/)).toBeNull();
  });

  it("folds more than four affiliations behind a disclosure, and renders none when there are none", async () => {
    const affs = Array.from({ length: 6 }, (_, i) => aff(`f${i}`, `Institution ${i}`));
    await renderHeader(pub({ authorships: [person(1, affs.map((a) => a.id))] }), { affiliations: affs });
    expect(screen.getByText("Affiliations (6)").closest("details")).not.toHaveAttribute("open");
    cleanup();
    await renderHeader(pub({ authorships: [person(1, [])] }));
    expect(screen.queryByRole("list", { name: "Affiliations" })).toBeNull();
  });
});

describe("ArticleHeader — never fabricates metadata", () => {
  it("drops a missing journal, issue, DOI and date rather than filling them in", async () => {
    await renderHeader(pub({ journal_name: null, volume: null, issue_no: null, doi: null }), {
      journal: { name: null, href: null },
      issue: { label: null, href: null, year: null },
      doi: null,
    });
    expect(screen.queryByText("DOI")).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy DOI" })).toBeNull();
    expect(screen.queryByText(/Vol\./)).toBeNull();
    expect(screen.queryByText(/Issue date/)).toBeNull();
  });
});

describe("ArticleHeader — actions follow the access decision", () => {
  it("offers Read and PDF when the file may be downloaded, and never links the storage path", async () => {
    const { container } = await renderHeader(pub());
    expect(screen.getByRole("link", { name: "Read article" })).toHaveAttribute("href", "#fulltext");
    expect(screen.getByRole("link", { name: "Download PDF" })).toHaveAttribute(
      "href",
      "/api/publications/handmade-conductivity/file?download=1",
    );
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.some((h) => h.includes("publications/x/handmade.pdf"))).toBe(false);
  });

  it("reading only: no PDF button, and the librarian's own reason is shown", async () => {
    await renderHeader(pub({ allow_download: false, download_disabled_reason: "Embargoed until print." }));
    expect(screen.getByRole("link", { name: "Read article" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Download PDF" })).toBeNull();
    expect(screen.getByRole("note")).toHaveTextContent("Embargoed until print.");
  });

  it("third-party rights: readable online, not downloadable", async () => {
    await renderHeader(pub({ license: "© 2014 American Chemical Society. All rights reserved.", publisher: "American Chemical Society" }));
    expect(screen.getByRole("link", { name: "Read article" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Download PDF" })).toBeNull();
  });

  it("no file: neither Read nor PDF, and the page says so", async () => {
    await renderHeader(pub({ pdf_url: null }));
    expect(screen.queryByRole("link", { name: "Read article" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Download PDF" })).toBeNull();
    expect(screen.getByRole("note")).toHaveTextContent("No file attached");
    // Secondary actions stay: a bibliographic record can still be cited and saved.
    expect(screen.getByRole("button", { name: "Cite" })).toBeInTheDocument();
  });
});

describe("ArticleHeader — previous / next", () => {
  it("links only the neighbours that exist", async () => {
    await renderHeader(pub(), { neighbours: { previous: null, next: { slug: "later", title: "Later", title_km: null } } });
    expect(screen.queryByRole("link", { name: /Previous article/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Next article/ })).toHaveAttribute("href", "/journals/articles/later");
  });
});

describe("ArticleSectionNav", () => {
  const sections = [
    { id: "abstract" as const, label: "Abstract" },
    { id: "references" as const, label: "References" },
  ];
  const wrap = (ui: ReactNode) => render(<NextIntlClientProvider locale="en" messages={enMessages}>{ui}</NextIntlClientProvider>);

  it("lists only the sections it is given, as in-page anchors", () => {
    wrap(<ArticleSectionNav sections={sections} variant="rail" />);
    const nav = screen.getByRole("navigation", { name: "On this page" });
    expect(within(nav).getByRole("link", { name: "Abstract" })).toHaveAttribute("href", "#abstract");
    expect(within(nav).getByRole("link", { name: "References" })).toHaveAttribute("href", "#references");
    expect(within(nav).queryByRole("link", { name: "Figures" })).toBeNull();
  });

  it("keeps only the control that belongs to navigation — the tools moved above it", () => {
    wrap(<ArticleSectionNav sections={sections} variant="rail" />);
    expect(screen.getByRole("link", { name: "Back to top" })).toHaveAttribute("href", "#publication-masthead");
    // Cite and the PDF are ArticleToolRail's, at the top of the rail.
    expect(screen.queryByRole("link", { name: "Download PDF" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cite this article" })).toBeNull();
  });

  it("renders nothing when there is no section", () => {
    const { container } = wrap(<ArticleSectionNav sections={[]} variant="inline" />);
    expect(container.querySelector("nav")).toBeNull();
  });
});

describe("ArticleToolRail", () => {
  const railProps = { id: "pub-1", title: "A study", shareUrl: "https://example.org/a" };
  const mount = async (pdfHref: string | null) =>
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        {await resolveServerTree(<ArticleToolRail {...railProps} pdfHref={pdfHref} />)}
      </NextIntlClientProvider>,
    );

  it("offers the PDF only when the access decision passed one down", async () => {
    await mount(null);
    expect(screen.queryByRole("link", { name: "Download PDF" })).toBeNull();
    cleanup();
    await mount("/api/publications/x/file?download=1");
    expect(screen.getByRole("link", { name: "Download PDF" })).toHaveAttribute(
      "href",
      "/api/publications/x/file?download=1",
    );
  });

  it("carries the article's utilities, so the rail can start at the masthead", async () => {
    await mount(null);
    for (const name of ["Cite", "Save", "Add to list", "Share"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });
});

describe("CiteArticleDialog", () => {
  it("opens from the Cite control, offers every format, and hands focus back on close", async () => {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <button type="button" onClick={() => openCiteDialog()}>
          Cite
        </button>
        <CiteArticleDialog publication={pub()} labels={{ title: "Cite this article", close: "Close" }} />
      </NextIntlClientProvider>,
    );
    const trigger = screen.getByRole("button", { name: "Cite" });
    trigger.focus();
    act(() => fireEvent.click(trigger));
    const dialog = screen.getByRole("dialog", { name: "Cite this article" });
    for (const f of ["APA", "MLA", "Chicago", "IEEE", "BibTeX", "RIS"]) {
      expect(within(dialog).getByRole("button", { name: f })).toBeInTheDocument();
    }
    expect(within(dialog).getByRole("button", { name: "APA" })).toHaveAttribute("aria-pressed", "true");
    act(() => fireEvent.click(within(dialog).getByRole("button", { name: "Close" })));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });
});

describe("ArticleScholarship — related, strongest relationship first", () => {
  const item = (id: string, title: string) => ({ id, slug: id, title, titleKm: null, authors: ["A. Author"], journal: "J", date: "2020-01-01" });

  it("orders journal → author → related and omits empty blocks", async () => {
    const tree = await resolveServerTree(
      <ArticleScholarship
        locale="en"
        journal={{ name: "J", href: "/journals/j", items: [item("j1", "Journal sibling")] }}
        author={{ name: "Set Seng", scholarUrl: "https://scholar.google.com/scholar?q=Set%20Seng", items: [item("a1", "Author work")] }}
        related={[{ ...item("r1", "Related work"), reason: "keywords" }]}
        books={null}
      />,
    );
    render(tree);
    const [journal, author, related] = ["More from this journal", "More by Set Seng", "Related articles"].map((name) =>
      screen.getByRole("heading", { level: 3, name }),
    );
    expect(before(journal, author) && before(author, related)).toBe(true);
    expect(screen.getByRole("link", { name: "Related work" })).toHaveAttribute("href", "/journals/articles/r1");
    cleanup();
    render(await resolveServerTree(<ArticleScholarship locale="en" journal={{ name: null, href: null, items: [] }} author={null} related={[]} books={null} />));
    expect(screen.queryByRole("heading")).toBeNull();
  });
});
