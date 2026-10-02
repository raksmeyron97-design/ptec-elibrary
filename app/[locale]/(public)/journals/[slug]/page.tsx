// /journals/<journal> — a journal the library INDEXES (decision 2026-10-02:
// PTEC Library records journals, it does not publish them). The page answers
// what a reader asks of a source, in this order: what is this journal, what
// is in its newest issue, can I trust it, can I read it, and which PTEC
// authors publish in it. Every block renders only when the record (or its
// articles) holds the fact; nothing is filled in to make the page look
// complete — no invented editorial board, aims, ISSN or indexing.
//
// ONE GRID from the breadcrumb down: the masthead sits in the main column and
// the rail starts level with it (the defect #209 fixed on the article page —
// a full-width masthead above a column + rail left the top-right of the first
// screen empty).
//
// Prerendered (ISR) and cookie-free: lib/journals/data.ts reads through the
// anon client under unstable_cache, invalidated by TAGS.journals.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ArrowRight, ExternalLink, Search } from "lucide-react";
import PageJsonLd from "@/components/seo/PageJsonLd";
import JournalBreadcrumb from "@/components/ui/journals/JournalBreadcrumb";
import IssueToc from "@/components/ui/journals/IssueToc";
import PublicationListItem from "@/components/ui/publications/PublicationListItem";
import ArticleSectionNav from "@/components/ui/publications/article/ArticleSectionNav";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { buildJournalMetadata, journalJsonLd, type JournalPageSeoInput } from "@/lib/seo/journal-seo";
import { getJournalBySlug, getJournalOverview, getJournalPtecAuthors, type JournalSummary } from "@/lib/journals/data";
import {
  formatJournalDate,
  issueLabel,
  issueSubtitle,
  journalTitle,
  languageName,
  officialTitleKm,
  translatedTitleKm,
} from "@/lib/journals/types";
import { countryName, frequencyCode, indexServiceName, licenseName } from "@/lib/journals/vocab";
import { issuePath, journalFilterPath, journalIssuesPath, journalPath, JOURNALS_PATH } from "@/lib/journals/urls";
import { normalizeIssn } from "@/lib/seo/identifiers";
import { accessStatus, type AccessStatus } from "@/lib/publications/integrity";
import { resolveAuthorLinks } from "@/lib/resources/connections";
import { getOrgIdentity } from "@/lib/system-settings/config";
import { safeExternalUrl } from "@/lib/authors/links";
import { decodeSlugParam } from "@/lib/slug";

export const revalidate = 3600;

// `revalidate` alone does not cache a dynamic segment: Next 16 renders it per
// request unless the page opts into runtime ISR. An empty list builds nothing
// and caches each path on its first visit (see theses/[slug]/page.tsx).
export function generateStaticParams() {
  return [];
}

type PageProps = { params: Promise<{ slug: string; locale: string }> };

/** Entries of the current issue listed on the journal page; the issue page has them all. */
const TOC_ON_JOURNAL_PAGE = 10;
/** Earlier issues shown here; the issues page lists every one. */
const EARLIER_ISSUES_ON_JOURNAL_PAGE = 8;

const ACCESS_ORDER: AccessStatus[] = ["open", "restricted", "unknown"];

function toSeo(j: JournalSummary): JournalPageSeoInput {
  return {
    slug: j.slug,
    title: j.title,
    // A library translation is not a name of the journal (decision 2026-10-02).
    titleKm: officialTitleKm(j),
    issn: j.issn,
    eIssn: j.e_issn,
    printIssn: j.print_issn,
    publisher: j.publisher_name,
    description: j.description,
    descriptionKm: j.description_km,
    language: j.language,
    coverUrl: j.cover_url,
    articleCount: j.articleCount,
    isIndexable: j.is_indexable,
    accessModel: j.access_model,
    startYear: j.start_year,
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug: rawSlug, locale } = await params;
  const slug = decodeSlugParam(rawSlug);
  const [journal, org] = await Promise.all([getJournalBySlug(slug), getOrgIdentity()]);
  if (!journal) return { title: "Journal not found", robots: { index: false, follow: true } };
  return buildJournalMetadata(toSeo(journal), locale, org);
}

const SECTION_HEADING = "font-khmer-serif text-[20px] font-bold text-text-heading";
const RAIL_HEADING = "text-[12px] font-bold uppercase tracking-[0.12em] text-text-muted";
const RAIL_CARD = "rounded-2xl border border-divider bg-bg-surface p-5";

function ExternalAnchor({ href, label, newTab }: { href: string; label: string; newTab: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-6 items-center gap-1 break-all text-brand underline-offset-2 hover:underline"
    >
      {label}
      <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="sr-only"> {newTab}</span>
    </a>
  );
}

function DefinitionList({ rows }: { rows: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="mt-3 space-y-3 text-[14px]">
      {rows.map((d) => (
        <div key={d.label}>
          <dt className="text-[12px] font-semibold text-text-muted">{d.label}</dt>
          <dd className="mt-0.5 text-text-body">{d.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function JournalPage({ params }: PageProps) {
  const { slug: rawSlug, locale } = await params;
  const slug = decodeSlugParam(rawSlug);
  const journal = await getJournalBySlug(slug);
  if (!journal) notFound();

  const [t, tDetail, overview, ptecAuthors, org] = await Promise.all([
    getTranslations({ locale, namespace: "journals" }),
    getTranslations({ locale, namespace: "publicationDetail" }),
    getJournalOverview(journal.id),
    // The block is supplementary: a failed read hides it, never the page.
    getJournalPtecAuthors(journal.id).catch((e) => {
      console.warn("[journals] PTEC authors unavailable:", e instanceof Error ? e.message : e);
      return [];
    }),
    getOrgIdentity(),
  ]);

  // ── Identity ──────────────────────────────────────────────────────────────
  const title = journalTitle(journal, locale);
  const officialKm = officialTitleKm(journal);
  // The other official spelling of the name, when the publisher has two.
  const otherTitle = officialKm ? (locale === "km" ? journal.title : officialKm) : null;
  const translation = translatedTitleKm(journal);
  const publisher = (locale === "km" && journal.publisher_name_km) || journal.publisher_name;
  const description = (locale === "km" && journal.description_km) || journal.description;
  const aims = (locale === "km" && journal.aims_scope_km) || journal.aims_scope;
  const website = safeExternalUrl(journal.website_url);
  const guidelines = safeExternalUrl(journal.author_guidelines_url);
  const board = safeExternalUrl(journal.editorial_board_url);
  const freqCode = frequencyCode(journal.frequency);
  const frequency = freqCode ? t(`frequencyValue.${freqCode}`) : journal.frequency;
  const country = countryName(journal.country, locale);
  const language = languageName(journal.language, locale);

  // Only identifiers that pass their check digit are shown, each labelled by
  // the field that held it — print and online are different numbers, and two
  // chips both reading "ISSN" did not say which was which.
  const idRows = (
    [
      ["printIssn", journal.print_issn],
      ["eIssn", journal.e_issn],
      ["issn", journal.issn],
      ["issnL", journal.issn_l],
    ] as const
  )
    .map(([key, raw]) => ({ key, value: normalizeIssn(raw) }))
    .filter((r): r is { key: "issn" | "printIssn" | "eIssn" | "issnL"; value: string } => !!r.value)
    .filter((r, i, all) => r.key === "issnL" || all.findIndex((x) => x.value === r.value) === i);
  const chipIssns = idRows.filter((r) => r.key !== "issnL");

  // ── Contents ──────────────────────────────────────────────────────────────
  const current = overview.issues[0] ?? null;
  const currentCount = current ? (overview.issueArticleCounts[current.id] ?? overview.currentIssueArticles.length) : 0;
  const earlier = overview.issues.slice(1, 1 + EARLIER_ISSUES_ON_JOURNAL_PAGE);
  // "Latest articles" used to repeat the current issue verbatim when a journal
  // had one issue. Only articles the table of contents above does not list.
  const more = overview.latestArticles.filter((a) => !current || a.issue_id !== current.id);
  const listed = [...overview.currentIssueArticles.slice(0, TOC_ON_JOURNAL_PAGE), ...more];
  const accessStates = ACCESS_ORDER.filter((s) => listed.some((a) => accessStatus(a.license) === s));

  const authorLinks = ptecAuthors.length > 0 ? await resolveAuthorLinks(ptecAuthors.map((a) => a.name)) : [];
  const hrefByName = new Map(authorLinks.map((l) => [l.name.trim().toLowerCase(), l.href]));

  // ── Rail ──────────────────────────────────────────────────────────────────
  const glance: { label: string; value: React.ReactNode }[] = [
    ...(publisher ? [{ label: t("publisher"), value: publisher }] : []),
    ...idRows.map((r) => ({ label: t(r.key), value: <span className="font-mono">{r.value}</span> })),
    ...(language ? [{ label: t("language"), value: language }] : []),
    ...(country ? [{ label: t("country"), value: country }] : []),
    ...(frequency ? [{ label: t("frequency"), value: frequency }] : []),
    ...(journal.start_year ? [{ label: t("startYearLabel"), value: journal.start_year }] : []),
    ...(journal.subjects.length > 0 ? [{ label: t("subjectsLabel"), value: journal.subjects.join(", ") }] : []),
  ];

  const indexNames = journal.indexed_in.map(indexServiceName).filter((n): n is string => !!n);
  const license = journal.default_license
    ? journal.default_license === "publisher"
      ? t("publisherTerms")
      : (licenseName(journal.default_license) ?? journal.default_license)
    : null;
  const trust: { label: string; value: React.ReactNode }[] = [
    ...(journal.access_model
      ? [
          {
            label: t("accessLabel"),
            value: (
              <>
                <span className="font-semibold">{t(`accessModel.${journal.access_model}`)}</span>
                <span className="mt-0.5 block text-[13px] text-text-muted">{t(`accessModelHint.${journal.access_model}`)}</span>
              </>
            ),
          },
        ]
      : []),
    ...(journal.peer_review ? [{ label: t("peerReviewLabel"), value: t(`peerReview.${journal.peer_review}`) }] : []),
    ...(indexNames.length > 0
      ? [
          {
            label: t("indexedInLabel"),
            value: (
              <ul className="flex flex-wrap gap-1.5">
                {indexNames.map((n) => (
                  <li key={n} className="rounded-full border border-divider px-2.5 py-0.5 text-[12.5px]">
                    {n}
                  </li>
                ))}
              </ul>
            ),
          },
        ]
      : []),
    ...(license ? [{ label: t("licenseLabel"), value: license }] : []),
  ];

  const links = [
    ...(website ? [{ href: website, label: t("website") }] : []),
    ...(guidelines ? [{ href: guidelines, label: t("authorGuidelines") }] : []),
    ...(board ? [{ href: board, label: t("editorialBoard") }] : []),
  ];

  const sections = [
    ...(current ? [{ id: "journal-current", label: t("currentIssue") }] : []),
    ...(earlier.length > 0 ? [{ id: "journal-earlier", label: t("earlierIssues") }] : []),
    ...(more.length > 0 || !current ? [{ id: "journal-more", label: current ? t("moreArticles") : t("latestArticles") }] : []),
    ...(description || aims ? [{ id: "journal-about", label: t("aboutHeading") }] : []),
    ...(ptecAuthors.length > 0 ? [{ id: "journal-ptec-authors", label: t("ptecAuthorsHeading") }] : []),
  ];

  const crumbs = [
    { label: t("breadcrumbHome"), href: "/" },
    { label: t("breadcrumbJournals"), href: JOURNALS_PATH },
    { label: title },
  ];

  const listLabels = {
    openAccess: tDetail("openAccess"),
    licensed: tDetail("accessLicensed"),
    rightsUnstated: tDetail("accessRightsUnstated"),
  };

  const howToRead =
    accessStates.length > 0 ? (
      <>
        <ul className="mt-3 space-y-2.5 text-[14px] leading-6 text-text-body">
          {accessStates.map((s) => (
            <li key={s}>{t(`howToRead.${s}`)}</li>
          ))}
        </ul>
        {accessStates.some((s) => s !== "open") && (
          <p className="mt-3 text-[13.5px] text-text-muted">
            {t("howToReadHelp")}{" "}
            <Link href="/contact" className="font-semibold text-brand underline-offset-2 hover:underline">
              {t("askLibrarian")}
            </Link>
          </p>
        )}
      </>
    ) : null;

  return (
    <section className="min-h-screen bg-bg-body px-4 py-6 sm:px-6 sm:py-10 md:px-12">
      <PageJsonLd
        nodes={[
          journalJsonLd(toSeo(journal), locale, org),
          breadcrumbSchema(
            [
              { name: crumbs[0].label, path: "/" },
              { name: crumbs[1].label, path: JOURNALS_PATH },
              { name: title, path: journalPath(journal.slug) },
            ],
            { locale },
          ),
        ]}
      />
      <div className="mx-auto max-w-[1200px]">
        <JournalBreadcrumb crumbs={crumbs} />

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-x-10">
          <div className="min-w-0 space-y-10">
            {/* ── Masthead ── */}
            <header
              id="journal-masthead"
              className="flex gap-6 rounded-[28px] border border-divider bg-bg-surface px-5 py-7 shadow-sm sm:px-8 sm:py-8"
            >
              {journal.cover_url && (
                <div aria-hidden="true" className="hidden shrink-0 sm:block sm:w-[96px]">
                  <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg border border-divider/60 bg-paper">
                    <Image src={journal.cover_url} alt="" fill sizes="96px" className="object-cover" />
                  </div>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent-text">{t("eyebrowIndexed")}</p>
                <h1 className="mt-2 font-khmer-serif text-[26px] font-bold leading-tight text-text-heading text-balance sm:text-[34px]">
                  {title}
                </h1>
                {otherTitle && (
                  <p lang={locale === "km" ? undefined : "km"} className="mt-1 text-[15px] text-text-muted">
                    {otherTitle}
                  </p>
                )}
                {translation && (
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-text-muted">
                    <span lang="km">{translation}</span>
                    <span className="rounded-full border border-divider px-2 py-0.5 text-[11px] font-semibold text-text-muted">
                      {t("titleTranslation")}
                    </span>
                    <span className="sr-only">{t("titleTranslationHint")}</span>
                  </p>
                )}
                {(publisher || journal.start_year || frequency) && (
                  <p className="mt-3 text-[14px] text-text-body">
                    {[
                      publisher ? <span key="p" className="font-medium">{publisher}</span> : null,
                      journal.start_year ? <span key="y">{t("since", { year: journal.start_year })}</span> : null,
                      frequency ? <span key="f">{frequency}</span> : null,
                    ]
                      .filter(Boolean)
                      .map((node, i) => (
                        <span key={i}>
                          {i > 0 && <span aria-hidden="true" className="mx-1.5 text-text-muted">·</span>}
                          {node}
                        </span>
                      ))}
                  </p>
                )}
                {(chipIssns.length > 0 || journal.access_model) && (
                  <ul className="mt-3 flex flex-wrap gap-2 text-[12.5px] text-text-muted">
                    {chipIssns.map((r) => (
                      <li key={r.value} className="rounded-full border border-divider px-2.5 py-0.5">
                        {t(r.key)} <span className="font-mono">{r.value}</span>
                      </li>
                    ))}
                    {journal.access_model && (
                      <li
                        className={`rounded-full border px-2.5 py-0.5 font-semibold ${
                          journal.access_model === "open"
                            ? "border-success-line bg-success-soft text-success-text"
                            : "border-divider text-text-body"
                        }`}
                      >
                        {t(`accessModel.${journal.access_model}`)}
                      </li>
                    )}
                  </ul>
                )}
                <p className="mt-4 text-[13px] font-semibold text-text-muted">
                  {t("articleCount", { count: journal.articleCount })}
                  {journal.issueCount > 0 && <> · {t("issueCount", { count: journal.issueCount })}</>}
                </p>
                {(journal.articleCount > 0 || website) && (
                  <div className="mt-5 flex flex-wrap gap-3">
                    {journal.articleCount > 0 && (
                      <Link
                        href={journalFilterPath(journal.slug)}
                        className="inline-flex min-h-10 items-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-brand-contrast transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                      >
                        <Search className="h-4 w-4" aria-hidden="true" />
                        {t("searchArticles")}
                      </Link>
                    )}
                    {overview.issues.length > 1 && (
                      <Link
                        href={journalIssuesPath(journal.slug)}
                        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-divider bg-bg-surface px-5 text-sm font-semibold text-text-body transition-colors hover:border-brand/40 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                      >
                        {t("viewAllIssues")}
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    )}
                    {website && (
                      <a
                        href={website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-divider bg-bg-surface px-5 text-sm font-semibold text-text-body transition-colors hover:border-brand/40 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                      >
                        {t("website")}
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                        <span className="sr-only"> {t("opensNewTab")}</span>
                      </a>
                    )}
                  </div>
                )}
              </div>
            </header>

            {/* Phones: how to read comes before the contents it explains. */}
            {howToRead && (
              <details className="rounded-2xl border border-divider bg-bg-surface px-5 py-4 lg:hidden">
                <summary className="cursor-pointer text-[15px] font-semibold text-text-heading">{t("howToReadHeading")}</summary>
                {howToRead}
              </details>
            )}

            {current && (
              <section id="journal-current" aria-labelledby="journal-current-heading" className="scroll-mt-28">
                <h2 id="journal-current-heading" className={SECTION_HEADING}>
                  {t("currentIssue")}
                </h2>
                <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="min-w-0">
                    <Link
                      href={issuePath(journal.slug, current.slug)}
                      className="text-[17px] font-bold text-text-heading hover:text-brand hover:underline"
                    >
                      {issueLabel(current, locale)}
                    </Link>
                    {current.is_special_issue && (
                      <span className="ml-2 rounded-full bg-accent/12 px-2 py-0.5 text-[11px] font-bold text-accent-text">
                        {t("specialIssue")}
                      </span>
                    )}
                    {issueSubtitle(current, locale) && (
                      <span className="block text-[14px] text-text-body">{issueSubtitle(current, locale)}</span>
                    )}
                  </p>
                  <p className="text-[13px] text-text-muted">
                    {[formatJournalDate(current.published_date, locale), t("articleCount", { count: currentCount })]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="mt-4">
                  <IssueToc articles={overview.currentIssueArticles} locale={locale} limit={TOC_ON_JOURNAL_PAGE} />
                </div>
                {currentCount > TOC_ON_JOURNAL_PAGE && (
                  <p className="mt-3">
                    <Link
                      href={issuePath(journal.slug, current.slug)}
                      className="inline-flex items-center gap-1 text-[14px] font-semibold text-brand hover:underline"
                    >
                      {t("viewFullIssue", { count: currentCount })}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </p>
                )}
              </section>
            )}

            {earlier.length > 0 && (
              <section id="journal-earlier" aria-labelledby="journal-earlier-heading" className="scroll-mt-28">
                <div className="flex items-end justify-between gap-4">
                  <h2 id="journal-earlier-heading" className={SECTION_HEADING}>
                    {t("earlierIssues")}
                  </h2>
                  {overview.issues.length > earlier.length + 1 && (
                    <Link
                      href={journalIssuesPath(journal.slug)}
                      className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline"
                    >
                      {t("viewAllIssues")}
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  )}
                </div>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {earlier.map((issue) => (
                    <li key={issue.id}>
                      <Link
                        href={issuePath(journal.slug, issue.slug)}
                        className="flex h-full flex-col rounded-xl border border-divider bg-bg-surface px-4 py-3 text-[14px] transition-colors hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
                      >
                        <span className="font-semibold text-text-heading">{issueLabel(issue, locale)}</span>
                        {issueSubtitle(issue, locale) && (
                          <span className="mt-0.5 text-[13px] text-text-body">{issueSubtitle(issue, locale)}</span>
                        )}
                        <span className="mt-0.5 text-[12.5px] text-text-muted">
                          {[
                            formatJournalDate(issue.published_date, locale),
                            t("articleCount", { count: overview.issueArticleCounts[issue.id] ?? 0 }),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {(more.length > 0 || !current) && (
              <section id="journal-more" aria-labelledby="journal-more-heading" className="scroll-mt-28">
                <h2 id="journal-more-heading" className={SECTION_HEADING}>
                  {current ? t("moreArticles") : t("latestArticles")}
                </h2>
                {more.length === 0 ? (
                  <p className="mt-3 rounded-2xl border border-dashed border-divider bg-bg-surface p-6 text-[14px] text-text-muted">
                    {t("noArticles")}
                  </p>
                ) : (
                  <div className="mt-4 flex flex-col gap-4">
                    {more.map((pub) => (
                      <PublicationListItem key={pub.id} publication={pub} labels={listLabels} />
                    ))}
                  </div>
                )}
              </section>
            )}

            {(description || aims) && (
              <section id="journal-about" aria-labelledby="journal-about-heading" className="scroll-mt-28">
                <h2 id="journal-about-heading" className={SECTION_HEADING}>
                  {t("aboutHeading")}
                </h2>
                {description && (
                  <p className="mt-3 max-w-[70ch] whitespace-pre-line text-[15px] leading-7 text-text-body">{description}</p>
                )}
                {aims && (
                  <>
                    <h3 className="mt-6 text-[16px] font-bold text-text-heading">{t("aimsScopeHeading")}</h3>
                    <p className="mt-2 max-w-[70ch] whitespace-pre-line text-[15px] leading-7 text-text-body">{aims}</p>
                  </>
                )}
              </section>
            )}

            {ptecAuthors.length > 0 && (
              <section id="journal-ptec-authors" aria-labelledby="journal-ptec-heading" className="scroll-mt-28">
                <h2 id="journal-ptec-heading" className={SECTION_HEADING}>
                  {t("ptecAuthorsHeading")}
                </h2>
                <p className="mt-1 text-[14px] text-text-muted">{t("ptecAuthorsIntro")}</p>
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {ptecAuthors.map((a) => {
                    const href = hrefByName.get(a.name.toLowerCase());
                    const name = locale === "km" && a.nameKm ? a.nameKm : a.name;
                    const inner = (
                      <>
                        <span className="font-semibold text-text-heading">{name}</span>
                        <span className="text-[12.5px] text-text-muted">{t("articleCount", { count: a.articleCount })}</span>
                      </>
                    );
                    return (
                      <li key={a.id}>
                        {href ? (
                          <Link
                            href={href}
                            className="flex h-full items-center justify-between gap-3 rounded-xl border border-divider bg-bg-surface px-4 py-3 text-[14px] transition-colors hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
                          >
                            {inner}
                          </Link>
                        ) : (
                          <div className="flex h-full items-center justify-between gap-3 rounded-xl border border-divider bg-bg-surface px-4 py-3 text-[14px]">
                            {inner}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>

          {/* ── Rail: starts level with the masthead ── */}
          <aside aria-label={t("detailsHeading")} className="min-w-0 space-y-4">
            {glance.length > 0 && (
              <section aria-labelledby="journal-glance" className={RAIL_CARD}>
                <h2 id="journal-glance" className={RAIL_HEADING}>
                  {t("atAGlance")}
                </h2>
                <DefinitionList rows={glance} />
              </section>
            )}
            {trust.length > 0 && (
              <section aria-labelledby="journal-trust" className={RAIL_CARD}>
                <h2 id="journal-trust" className={RAIL_HEADING}>
                  {t("trustHeading")}
                </h2>
                <DefinitionList rows={trust} />
              </section>
            )}
            {links.length > 0 && (
              <section aria-labelledby="journal-links" className={RAIL_CARD}>
                <h2 id="journal-links" className={RAIL_HEADING}>
                  {t("linksHeading")}
                </h2>
                <ul className="mt-3 space-y-2 text-[14px]">
                  {links.map((l) => (
                    <li key={l.href}>
                      <ExternalAnchor href={l.href} label={l.label} newTab={t("opensNewTab")} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {howToRead && (
              <section aria-labelledby="journal-how-to-read" className={`${RAIL_CARD} hidden lg:block`}>
                <h2 id="journal-how-to-read" className={RAIL_HEADING}>
                  {t("howToReadHeading")}
                </h2>
                {howToRead}
              </section>
            )}
            {sections.length > 1 && (
              <div className="hidden pt-2 lg:sticky lg:top-[128px] lg:block">
                <ArticleSectionNav sections={sections} variant="rail" topId="journal-masthead" />
              </div>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}
