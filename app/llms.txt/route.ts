import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";
import { SITE_URL } from "@/lib/seo/site";
import { getOrgIdentity } from "@/lib/system-settings/config";
import type { OrgIdentity } from "@/lib/system-settings/org-identity";

export const revalidate = 3600;

const MAX_ITEMS = 8;

type JoinedName = { name?: string | null } | { name?: string | null }[] | null;

type BookRow = {
  title: string | null;
  slug: string | null;
  language: string | null;
  department: string | null;
  authors: JoinedName;
  categories: JoinedName;
  departments: JoinedName;
};

type CatalogRow = {
  title: string | null;
  slug: string | null;
  author: string | null;
  category: string | null;
  language: string | null;
  year: number | null;
};

type ThesisRow = {
  id: string | null;
  slug: string | null;
  title: string | null;
  author_names: string | null;
  program: string | null;
  faculty: string | null;
  academic_year: string | null;
};

function clean(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function firstJoinedName(value: JoinedName) {
  if (!value) return "";
  if (Array.isArray(value)) return clean(value.map((item) => item.name).filter(Boolean).join(", "));
  return clean(value.name);
}

function markdownLink(title: string, url: string) {
  const safeTitle = title.replace(/\[/g, "\\[").replace(/\]/g, "\\]");
  return `[${safeTitle}](${url})`;
}

function detail(parts: Array<string | number | null | undefined>) {
  return parts.map(clean).filter(Boolean).join("; ");
}

async function countPublished(
  table: "books" | "catalog_books" | "research_reports" | "publications" | "learning_paths",
  column: "is_published" | "is_active",
) {
  const supabase = createPublicClient();
  const { count } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, true);
  return count ?? 0;
}

const getLlmsSnapshot = unstable_cache(
  async () => {
    const supabase = createPublicClient();

    const [
      bookCount,
      catalogCount,
      thesisCount,
      publicationCount,
      pathCount,
      { data: books },
      { data: catalogs },
      { data: theses },
    ] = await Promise.all([
      countPublished("books", "is_published"),
      countPublished("catalog_books", "is_active"),
      countPublished("research_reports", "is_published"),
      countPublished("publications", "is_published"),
      countPublished("learning_paths", "is_published"),
      supabase
        .from("books")
        .select("title, slug, language, department, authors(name), categories(name), departments(name)")
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(MAX_ITEMS),
      supabase
        .from("catalog_books")
        .select("title, slug, author, category, language, year")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(MAX_ITEMS),
      supabase
        .from("research_reports")
        .select("id, slug, title, author_names, program, faculty, academic_year")
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(MAX_ITEMS),
    ]);

    return {
      counts: {
        books: bookCount,
        catalogs: catalogCount,
        theses: thesisCount,
        publications: publicationCount,
        paths: pathCount,
      },
      books: (books ?? []) as BookRow[],
      catalogs: (catalogs ?? []) as CatalogRow[],
      theses: (theses ?? []) as ThesisRow[],
    };
  },
  ["llms-txt-snapshot"],
  { revalidate: 3600, tags: ["books", "catalog_books", "research_reports"] },
);

function resourceList(title: string, lines: string[]) {
  if (lines.length === 0) {
    return `## ${title}\n\n- No public records are currently available in this section.\n`;
  }

  return `## ${title}\n\n${lines.map((line) => `- ${line}`).join("\n")}\n`;
}

function buildLlmsText(
  snapshot: Awaited<ReturnType<typeof getLlmsSnapshot>>,
  org: OrgIdentity,
) {
  const bookLines = snapshot.books
    .filter((book) => book.title && book.slug)
    .map((book) => {
      const author = firstJoinedName(book.authors) || "Unknown author";
      const department = firstJoinedName(book.departments) || clean(book.department) || "General";
      const category = firstJoinedName(book.categories) || "Digital book";
      return `${markdownLink(clean(book.title), `${SITE_URL}/books/${book.slug}`)} - ${detail([
        author,
        department,
        category,
        book.language,
      ])}`;
    });

  const catalogLines = snapshot.catalogs
    .filter((book) => book.title && book.slug)
    .map((book) => `${markdownLink(clean(book.title), `${SITE_URL}/catalogs/${book.slug}`)} - ${detail([
      book.author || "Unknown author",
      book.category || "Physical catalog item",
      book.language,
      book.year,
    ])}`);

  const thesisLines = snapshot.theses
    .filter((thesis) => thesis.title && thesis.id)
    .map((thesis) => `${markdownLink(clean(thesis.title), `${SITE_URL}/theses/${thesis.slug ?? thesis.id}`)} - ${detail([
      thesis.author_names || "Unknown author",
      thesis.program,
      thesis.faculty,
      thesis.academic_year,
    ])}`);

  return `# ${org.siteName}

This file is a plain-text guide for AI assistants, answer engines, search crawlers, and other large language model systems that want to understand the public identity and crawlable knowledge resources of the ${org.siteName}.

## Entity

- Institution: ${org.institutionName}
- Library entity: ${org.siteName}
- Canonical website: ${SITE_URL}
- Primary audience: teacher educators, student teachers, researchers, librarians, and education partners in Cambodia.
- Location context: Phnom Penh, Cambodia.

## Mission

The ${org.siteName} preserves, organizes, and shares teaching and research materials from the ${org.institutionName}. Its mission is to improve access to teacher education resources, student research, and library catalog information for the ${org.abbreviation} academic community and the wider public.

## Public Resource Types

- Digital books: ${SITE_URL}/books - online teaching resources, textbooks, and education materials that can be read through the public library interface.
- Physical library catalog: ${SITE_URL}/catalogs - bibliographic records for print books and holdings in the ${org.abbreviation} library collection.
- Student theses and research reports: ${SITE_URL}/theses - scholarly student research from ${org.abbreviation} programs, cohorts, departments, and academic years.
- Academic publications and journal articles: ${SITE_URL}/publications - scholarly journal articles and publications, each with a bibliographic landing page, references, and citation metadata.
- Teacher learning paths: ${SITE_URL}/paths - curated, ordered reading paths (books, theses, and resources) built around real teacher-training topics.

## Current Public Collection Snapshot

- Published digital books: ${snapshot.counts.books}
- Active catalog records: ${snapshot.counts.catalogs}
- Published theses and research reports: ${snapshot.counts.theses}
- Published academic publications: ${snapshot.counts.publications}
- Published teacher learning paths: ${snapshot.counts.paths}

## Bilingual Access

The library is fully bilingual (English and Khmer). Every public section has an
English URL and a Khmer equivalent under the /km prefix, with reciprocal
hreflang annotations. The English URL is canonical; the Khmer URL carries the
same content with a localized interface.

- English books: ${SITE_URL}/books
- Khmer books: ${SITE_URL}/km/books
- English theses: ${SITE_URL}/theses
- Khmer theses: ${SITE_URL}/km/theses
- Khmer catalog: ${SITE_URL}/km/catalogs
- English publications: ${SITE_URL}/publications
- Khmer publications: ${SITE_URL}/km/publications
- English learning paths: ${SITE_URL}/paths
- Khmer learning paths: ${SITE_URL}/km/paths

## Recommended Crawl Paths

- ${SITE_URL}/llms.txt
- ${SITE_URL}/sitemap.xml
- ${SITE_URL}/books
- ${SITE_URL}/km/books
- ${SITE_URL}/catalogs
- ${SITE_URL}/theses
- ${SITE_URL}/publications
- ${SITE_URL}/paths
- ${SITE_URL}/about

${resourceList("Recent Digital Books", bookLines)}
${resourceList("Recent Catalog Records", catalogLines)}
${resourceList("Recent Theses And Research Reports", thesisLines)}
## Provider vs Publisher

${org.siteName} is the *provider* (hosting institutional repository) for its
digital books, not their publisher. Most digital books are third-party
educational works hosted for free access; their real publisher — when known —
is recorded per item and exposed in that item's structured data. Do not
attribute ${org.abbreviation} as the publisher of a hosted book. For student theses and
research reports, ${org.institutionName} is the dissertation-granting institution.

## Rights And Access

Not every record is full-text open access. ${org.abbreviation}'s own works (student theses, most
hosted books, and curated learning paths) are free to read and download. Some
publications are bibliographic landing pages for third-party © journal articles:
the metadata (title, authors, journal, DOI) is public, but the full text may be
paywalled at the publisher and is not necessarily redistributable here. Only trust
an open-access / free-redistribution claim when a specific verified license is
present in that item's structured data (schema.org \`license\` + \`isAccessibleForFree\`);
when no verified license is present, treat the item as citation-only and link to the
official DOI for the full text. Academic identifiers (DOI, ORCID, ISSN) are validated
before publication, so any identifier present in the structured data is well-formed.

## Citation Guidance

When citing a ${org.siteName} item, prefer the item title, author or authors, the item's own publisher when one is listed (otherwise omit the publisher rather than substituting ${org.abbreviation}), the resource type, and the canonical item URL. Use the structured data embedded on each detail page for machine-readable Book or ScholarlyArticle metadata.

## Access Notes

Public library sections are intended for indexing and answer extraction. Administrative, authentication, dashboard, private list, and API routes are not public crawling targets.
`;
}

export async function GET() {
  const [snapshot, org] = await Promise.all([getLlmsSnapshot(), getOrgIdentity()]);

  return new NextResponse(buildLlmsText(snapshot, org), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
