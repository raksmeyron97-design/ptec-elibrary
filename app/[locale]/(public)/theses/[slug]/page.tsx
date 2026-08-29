import { notFound, permanentRedirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
// Plain next/link, not the locale-aware one: /admin is outside the locale
// scheme and the i18n Link would prefix it with /km.
import NextLink from "next/link";
import { decodeSlugParam } from "@/lib/slug";
import type { AppRole } from "@/lib/types/roles";
import { ADMIN_PANEL_ROLES } from "@/lib/types/roles";
import type { Metadata } from "next";
import { getThesisById, getThesisBySlug, getThesisPrograms, getThesisFaculties } from "@/app/actions/theses";
import { getThesisRank, TOP_N_PROTECTED } from "@/lib/theses/download-permission";
import ThesisViewPing from "@/components/ui/theses/ThesisViewPing";
import FullTextSection from "@/components/ui/theses/detail/FullTextSection";
import RelatedTheses from "@/components/ui/theses/RelatedTheses";
import ReferenceList from "@/components/ui/theses/ReferenceList";
import ThesisHero from "@/components/ui/theses/detail/ThesisHero";
import ThesisMetadata from "@/components/ui/theses/detail/ThesisMetadata";
import ThesisSectionNav, {
  type RecordSection,
} from "@/components/ui/theses/detail/ThesisSectionNav";
import RecordStatusCard from "@/components/ui/theses/detail/RecordStatusCard";
import PublicationMetadata from "@/components/ui/theses/detail/PublicationMetadata";
import {
  ThesisPrimaryActions,
  ThesisSecondaryActions,
} from "@/components/ui/theses/detail/ThesisActions";
import ThesisDownloadButton from "@/components/ui/theses/ThesisDownloadButton";
import CiteThis from "@/components/ui/theses/CiteThis";
import BackToTopButton from "@/components/ui/detail/BackToTopButton";
import ThesisAbstractReader from "@/components/ui/theses/ThesisAbstractReader";
import AuthorCard from "@/components/ui/theses/detail/AuthorCard";
import ReadingProgress from "@/components/ui/detail/ReadingProgress";
import { getTranslations } from "next-intl/server";
import JsonLd from "@/components/seo/JsonLd";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPublicResourceAuthors } from "@/lib/resources/public-contributors";
import {
  formatPublicationDate,
  getCoAdvisor,
  getThesisTypeLabel,
  getKeywords,
  getReferences,
  getDoi,
  getDepartment,
  getLanguageLabel,
} from "@/lib/theses/report-fields";
import { SITE_URL } from "@/lib/seo/site";
import { getOrgIdentity, getSiteConfig } from "@/lib/system-settings/config";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { thesisScholarMeta } from "@/lib/seo/citation";
import { buildThesisMetadata, thesisJsonLd, type ThesisSeoInput } from "@/lib/seo/thesis-seo";
import { ChevronRight, FileX2, Pencil } from "lucide-react";

/** Split "Sok San, Chan Dara" → ["Sok San", "Chan Dara"]. */
function splitAuthors(authorNames: string | null | undefined): string[] {
  return authorNames
    ? authorNames.split(",").flatMap((s: string) => {
        const name = s.trim();
        return name ? [name] : [];
      })
    : [];
}

export const revalidate = 3600;

type PageProps = { params: Promise<{ slug: string; locale: string }> };

// Legacy /theses/[uuid] URLs. Middleware already issues the 301 for these;
// this page-level lookup is the fallback for anything that slips past the
// middleware matcher, and produces the 404 when the id doesn't exist.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const [{ slug: rawSlug, locale }, supabase, org] = await Promise.all([
    params,
    createClient(),
    getOrgIdentity(),
  ]);
  // decodeSlugParam is idempotent — normalize in both entry points so the
  // metadata and the body can never resolve to different records.
  const slug = decodeSlugParam(rawSlug);
  // seo_title/seo_description/og_image (migration 0076) are selected HERE, in
  // the row we are already fetching, rather than in a follow-up query keyed on
  // report.id. That second round-trip was pure latency — same table, same row —
  // and it is what pushed this route's metadata past the shell: Next streams
  // metadata that resolves after the shell has flushed, emitting the tags into
  // <body> instead of <head>. Lighthouse reads `head meta`, saw no description,
  // and scored SEO 0.92 against a 0.95 gate. A meta description in <body> is
  // also invalid HTML that head-only crawlers ignore, so this was a real SEO
  // bug and not just a failing audit.
  const { data: report } = await supabase
    .from('research_reports')
    .select('id, slug, title, abstract, author_names, cover_url, file_url, published_at, created_at, updated_at, keywords, doi, is_published, program, faculty, subject, language, department_id, verified_at, seo_title, seo_description, og_image, departments(name)')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle();

  if (!report) {
    // Legacy UUID URLs are handled in the page component (301 or 404); for
    // everything else, throwing here (before the shell streams) makes the
    // response a genuine HTTP 404 instead of a soft 200+noindex.
    if (!UUID_RE.test(slug)) notFound();
    return { title: 'Thesis not found' };
  }

  // Canonical authors feed the citation_* meta tags + JSON-LD, consistent with
  // the visible page; defensive fallback to the legacy string.
  const canonicalMetaAuthors = await getPublicResourceAuthors("thesis", report.id);
  const seoRow = report;
  const reportForMeta =
    canonicalMetaAuthors.length > 0
      ? { ...report, author_names: canonicalMetaAuthors.join(", ") }
      : report;

  const seoInput: ThesisSeoInput = {
    slug: report.slug,
    title: report.title,
    abstract: report.abstract,
    authors: splitAuthors(reportForMeta.author_names),
    coverUrl: report.cover_url,
    // published_at is the academic publication date; the website deposit time
    // (created_at) is NOT used as datePublished. verified_at/updated_at is the
    // last significant metadata change.
    datePublished: report.published_at,
    dateModified: report.verified_at ?? report.updated_at ?? null,
    keywords: getKeywords(report),
    doi: report.doi,
    department: getDepartment(report),
    program: report.program,
    language: getLanguageLabel(report),
  };

  // Admin-set SEO overrides (migration 0076) win when present.
  const base = buildThesisMetadata(
    seoInput,
    locale,
    {
      seoTitle: seoRow?.seo_title,
      seoDescription: seoRow?.seo_description,
      ogImage: seoRow?.og_image,
    },
    org,
  );

  return {
    ...base,
    // Google Scholar citation_* meta tags — see lib/seo/citation.ts
    other: {
      ...thesisScholarMeta(reportForMeta, org),
      'dc.publisher': org.institutionName,
      'dc.type': 'ScholarlyArticle',
    },
  };
}

export default async function ThesisDetailPage({ params }: PageProps) {
  const { slug: rawSlug, locale } = await params;
  const slug = decodeSlugParam(rawSlug);
  let { data: report } = await getThesisBySlug(slug);

  if (!report && UUID_RE.test(slug)) {
    // Legacy ID URL: 301 to the canonical slug URL, 404 if the id is unknown.
    const { data: bySlugId } = await getThesisById(slug);
    if (bySlugId?.slug && bySlugId.is_published) {
      permanentRedirect(locale === "km" ? `/km/theses/${bySlugId.slug}` : `/theses/${bySlugId.slug}`);
    }
    report = bySlugId;
  }

  if (!report || !report.is_published) {
    notFound();
  }

  const id: string = report.id;
  const canonicalSlug: string = report.slug ?? report.id;

  // Canonical author credits (migrations 0104–0109). DEFENSIVE read-switch:
  // structured contributors replace the free-text `author_names` on the display
  // surfaces and JSON-LD when present, falling back to the legacy string when
  // absent (pre-migration) or empty. `report` itself is left untouched because
  // AuthorCard matches sibling theses by the exact legacy `author_names` string;
  // only `displayReport` carries the canonical form.
  const canonicalAuthors = await getPublicResourceAuthors("thesis", id);
  const displayReport =
    canonicalAuthors.length > 0
      ? { ...report, author_names: canonicalAuthors.join(", ") }
      : report;

  // Admin-only edit link — best-effort, non-blocking
  let isAdmin = false;
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (user) {
      const { data: profile } = await authClient
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      isAdmin = ADMIN_PANEL_ROLES.includes((profile?.role ?? "reader") as AppRole);
    }
  } catch { /* non-fatal */ }

  // ── Derived metadata ──────────────────────────────────────────────────────
  const keywords = getKeywords(report);
  const references = getReferences(report);
  const doi = getDoi(report);
  const department = getDepartment(report);
  const fileHref = `/api/theses/${id}/file`;
  const shareUrl = `${SITE_URL}/theses/${canonicalSlug}`;
  // Localized internal path — carried as returnTo / login callback by the
  // gated download flow (validated by safeReturnTo before use).
  const thesisPath = locale === "km" ? `/km/theses/${canonicalSlug}` : `/theses/${canonicalSlug}`;

  // Global Top-N rank (service-role read of the ranking view). Drives the
  // subtle "Top 10 · Most Downloaded" badge; the actual download gate is
  // enforced server-side by the permission engine, never by this badge.
  let thesisRank: number | null = null;
  try {
    thesisRank = await getThesisRank(createServiceClient(), id);
  } catch { /* non-fatal — badge simply hidden */ }
  const isTopTen = thesisRank != null && thesisRank <= TOP_N_PROTECTED;

  // ── Display labels ────────────────────────────────────────────────────────
  // Program and faculty are stored as codes; the spec strip shows names.
  // Independent lookups, so they run together rather than in series.
  const [{ data: programs }, { data: faculties }, siteConfig, orgIdentity] = await Promise.all([
    getThesisPrograms(),
    getThesisFaculties(),
    getSiteConfig(),
    getOrgIdentity(),
  ]);
  const programLabel =
    programs?.find((p) => p.code === report.program)?.name_en ?? report.program ?? null;
  const facultyLabel =
    faculties?.find((f) => f.program_code === report.program && f.code === report.faculty)
      ?.name_en ?? null;
  // Department is the messiest field on this table. `getDepartment()` falls
  // back to the raw faculty CODE when no distinct department record exists, so
  // a record whose faculty is "Primary Education" was showing "primary" in a
  // Department row directly beside it — the same fact, once as a label and
  // once as a code, which reads as a data error rather than as two fields.
  //
  // The row is therefore dropped whenever it is just the faculty in disguise
  // (equal, or a prefix of it, case-insensitively), and title-cased when it
  // does survive, because codes are stored lowercase and a metadata grid
  // should not be the place a reader meets one.
  const departmentLabel = (() => {
    const raw = department?.trim();
    if (!raw) return null;
    const a = raw.toLowerCase();
    const b = (facultyLabel ?? "").toLowerCase();
    if (b && (a === b || b.startsWith(a))) return null;
    return raw.replace(/\b\p{Ll}/gu, (c) => c.toUpperCase());
  })();

  // The poster's one-line lead. A librarian's SEO description when there is
  // one, otherwise the abstract's first sentence — the deck sets a single
  // claim here, not a paragraph, and the full abstract is a screen below.
  const abstractText = (report.abstract ?? "").replace(/\s+/g, " ").trim();
  const lead =
    (report.seo_description ?? "").trim() ||
    (abstractText ? `${abstractText.split(/(?<=[.!?។])\s/)[0]}`.slice(0, 240) : null);

  const cohortLine = [report.cohort ? `Cohort ${report.cohort}` : null, report.academic_year]
    .filter(Boolean)
    .join(" · ");

  // ── The reading column's sections ─────────────────────────────────────────
  // The tab strip this replaced hid the full text and the reference list
  // behind a click, so a reader arriving from a search result could not see
  // that either existed. Everything is on the page now; the left rail indexes
  // it. A section that has no content for this thesis is not listed, so the
  // index never points at an empty heading.
  const hasReferences = references.length > 0;
  const sections: RecordSection[] = [
    { id: "abstract", label: "Abstract" },
    ...(keywords.length > 0 ? [{ id: "keywords", label: "Keywords" }] : []),
    { id: "full-text", label: "Full text" },
    { id: "publication-details", label: "Publication details" },
    { id: "references", label: "References", meta: String(references.length) },
  ];

  const tNav = await getTranslations("nav");

  // Validated, sanitized ScholarlyArticle JSON-LD — see lib/seo/thesis-seo.ts.
  const thesisArticleSchema = thesisJsonLd(
    {
      slug: canonicalSlug,
      title: report.title,
      abstract: report.abstract,
      authors: splitAuthors(displayReport.author_names),
      coverUrl: report.cover_url,
      datePublished: report.published_at,
      dateModified: report.verified_at ?? report.updated_at ?? null,
      keywords,
      doi,
      department,
      program: report.program,
      language: getLanguageLabel(report),
      references,
    },
    locale,
    await getOrgIdentity(),
  );
  const thesisBreadcrumbSchema = breadcrumbSchema([
    { name: tNav("home"), path: "/" },
    { name: tNav("theses"), path: "/theses" },
    { name: report.title },
  ]);

  return (
    // One <article> holding one <h1>, with the sections beneath it as <section>
    // elements carrying their own <h2>. Heading levels run h1 → h2 with no
    // skips, which is what lets a screen-reader user jump the record by
    // heading. `scroll-smooth` is set here rather than globally so the anchors
    // in <ThesisSectionNav> glide, and it defers to prefers-reduced-motion.
    <article className="scroll-smooth bg-bg-app pb-16">
      <JsonLd data={thesisArticleSchema} />
      <JsonLd data={thesisBreadcrumbSchema} />
      <ThesisViewPing id={id} />
      <ReadingProgress />

      <div className="mx-auto w-full max-w-[1320px] px-4 sm:px-6 lg:px-8">
        {/* ── Breadcrumb ──
            Deliberately small and quiet: it orients, it does not compete with
            the title two elements below it. */}
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center gap-x-2 gap-y-1 py-5 text-[12.5px] text-text-muted"
        >
          <Link href="/" className="rounded-sm transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50">
            {tNav("home")}
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-divider" aria-hidden="true" />
          <Link href="/theses" className="rounded-sm transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50">
            {tNav("theses")}
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-divider" aria-hidden="true" />
          <span aria-current="page" className="max-w-[46ch] truncate font-medium text-text-heading">
            {report.title}
          </span>
          {isAdmin && (
            <NextLink
              href={`/admin/theses/edit/${id}`}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-divider bg-bg-surface px-3 py-1.5 text-[12px] font-medium text-text-muted transition-colors duration-150 hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              Edit thesis
            </NextLink>
          )}
        </nav>

        <ThesisHero
          report={displayReport}
          typeLabel={getThesisTypeLabel(report)}
          rank={isTopTen ? thesisRank : null}
          lead={lead}
          cohortLine={cohortLine || null}
          primaryActions={
            <ThesisPrimaryActions
              hasFile={!!report.file_url}
              downloadSlot={
                <ThesisDownloadButton
                  reportId={id}
                  hasFile={!!report.file_url}
                  variant="full"
                  thesisPath={thesisPath}
                />
              }
            />
          }
          secondaryActions={
            <ThesisSecondaryActions id={id} title={report.title} shareUrl={shareUrl} />
          }
        />

        <div className="mt-10">
          <ThesisMetadata
            authorNames={displayReport.author_names}
            advisor={report.advisor_name}
            coAdvisor={getCoAdvisor(report)}
            program={programLabel}
            faculty={facultyLabel}
            department={departmentLabel}
            academicYear={report.academic_year}
            language={getLanguageLabel(report)}
            publishedOn={formatPublicationDate(report)}
          />
        </div>

        {/* ── Content + supporting rail ──
            70/30 at `lg`, one column below it. The rail is NOT sticky as a
            whole — a 700px-tall pinned column fights the reader on a laptop —
            only the section nav inside it is. */}
        <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px] xl:gap-10">
          <div className="min-w-0 space-y-6">
            {/* On small screens the section nav is a disclosure and belongs
                above the content it indexes; on `lg` it is the sticky rail at
                the top of the sidebar instead. One component, two slots — the
                hidden one costs nothing because each presentation is behind a
                display query inside it. */}
            <div className="lg:hidden">
              <ThesisSectionNav sections={sections} variant="disclosure" />
            </div>

            {/* The reading card. Every content section lives in ONE surface
                with hairline separators, rather than each getting its own
                bordered box — five stacked cards is the "collection of boxes"
                the previous layout had. */}
            <div className="divide-y divide-divider rounded-2xl border border-divider bg-bg-surface shadow-sm">
              <section id="abstract" className="scroll-mt-28 p-5 sm:p-7">
                <ThesisAbstractReader
                  abstract={report.abstract || ""}
                  keywords={keywords}
                  basePath="/theses"
                  title={report.title}
                  locale={locale}
                />
              </section>

              <section id="full-text" className="scroll-mt-28 p-5 sm:p-7">
                <h2 className="text-[20px] font-bold tracking-[-0.01em] text-text-heading sm:text-[22px]">
                  Full text
                </h2>
                <div className="mt-4">
                  {report.file_url ? (
                    <FullTextSection
                      reportId={id}
                      title={report.title}
                      fileHref={fileHref}
                      reportEmail={siteConfig.email}
                      language={getLanguageLabel(report)}
                    />
                  ) : (
                    <div className="flex items-start gap-3 rounded-2xl bg-bg-app p-5">
                      <FileX2 className="mt-0.5 h-5 w-5 shrink-0 text-text-muted" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-[14.5px] font-semibold text-text-heading">
                          No PDF deposited yet
                        </p>
                        <p className="mt-1 max-w-[52ch] text-[13.5px] leading-[1.6] text-text-muted">
                          The full text for this thesis hasn&apos;t been uploaded to the
                          repository. The record&apos;s abstract and details above are complete.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <section id="publication-details" className="scroll-mt-28 p-5 sm:p-7">
                <h2 className="text-[20px] font-bold tracking-[-0.01em] text-text-heading sm:text-[22px]">
                  Publication details
                </h2>
                <div className="mt-4">
                  <PublicationMetadata report={displayReport} />
                </div>
              </section>

              <section id="references" className="scroll-mt-28 p-5 sm:p-7">
                <h2 className="text-[20px] font-bold tracking-[-0.01em] text-text-heading sm:text-[22px]">
                  References
                  {hasReferences && (
                    <span className="ml-2 text-[15px] font-medium tabular-nums text-text-muted">
                      ({references.length})
                    </span>
                  )}
                </h2>
                <div className="mt-4">
                  <ReferenceList references={references} />
                </div>
              </section>
            </div>
          </div>

          {/* ── Supporting rail ──
              The whole rail pins as ONE sticky unit, not just the nav inside
              it. Sticking only the nav looked right until the page scrolled:
              a sticky element stays put while its SIBLINGS scroll past it, so
              the citation and status cards slid underneath the pinned nav and
              overlapped it.
              `max-h` + `overflow-y-auto` keep the bottom of the rail reachable
              when its cards are taller than the viewport, and
              `overscroll-contain` stops a scroll that reaches the rail's end
              from chaining into the page behind it. `dvh` rather than `vh`
              because mobile browser chrome changes the viewport height —
              harmless here since the rule is `lg`-only, but correct. */}
          <aside className="space-y-5 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:min-w-0 lg:overflow-y-auto lg:overscroll-contain lg:pb-2">
            <div className="hidden lg:block">
              <ThesisSectionNav sections={sections} variant="rail" />
            </div>

            <div id="cite-panel" className="scroll-mt-28">
              <CiteThis
                report={displayReport}
                reportId={canonicalSlug}
                institution={orgIdentity.institutionName}
                // The verification warning and the corrections link live in
                // <RecordStatusCard> on this page — see the prop's docs.
                showRecordNotes={false}
              />
            </div>

            <RecordStatusCard
              verifiedAt={report.verified_at}
              publishedOn={formatPublicationDate(report)}
              views={(report.view_count || 0) + 1}
              downloads={report.download_count || 0}
              reportTitle={report.title ?? canonicalSlug}
            />

            {report.author_names && (
              <AuthorCard variant="rail" currentId={id} authorNames={report.author_names} />
            )}

            <div className="hidden lg:block">
              <BackToTopButton />
            </div>
          </aside>
        </div>

        <RelatedTheses
          currentId={id}
          cohort={report.cohort}
          academicYear={report.academic_year}
          department={department ?? undefined}
        />
      </div>
    </article>
  );
}
