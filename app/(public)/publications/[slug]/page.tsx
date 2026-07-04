import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import type { AppRole } from "@/lib/types/roles";
import { ADMIN_PANEL_ROLES } from "@/lib/types/roles";
import { getPublicationBySlug } from "@/app/actions/publications";
import { mapRowToPublication } from "@/lib/publications";
import type { PublicationAffiliation, Publication } from "@/lib/publications";
import { toCitationLine, citationYear, authorList } from "@/lib/citations";
import PublicationViewPing from "@/components/ui/publications/PublicationViewPing";
import CitePublication from "@/components/ui/publications/CitePublication";
import PDFViewer from "@/components/ui/reader/PDFViewerClient";
import PublicationCard from "@/components/ui/publications/PublicationCard";
import Icon from "@/components/ui/core/Icon";
import ShareButton from "@/components/ui/books/ShareButton";
import ThesisTabs, { type ThesisTab } from "@/components/ui/theses/ThesisTabs";
import ReferenceList from "@/components/ui/theses/ReferenceList";
import JsonLd from "@/components/seo/JsonLd";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/seo/site";
import {
  Download,
  Eye,
  Pencil,
  Building2,
  CalendarDays,
  FileText,
  Mail,
  ScrollText,
  Scale,
} from "lucide-react";

export const revalidate = 3600;

type PageProps = { params: Promise<{ slug: string }> };

const TYPE_LABELS: Record<string, string> = {
  article: "Article",
  review: "Review",
  account: "Account",
  editorial: "Editorial",
};

function truncate(text: string | null | undefined, max: number): string {
  if (!text) return "";
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function citationDate(pub: Publication): string {
  const raw = pub.publication_date ?? pub.published_at ?? pub.created_at;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return String(new Date().getFullYear());
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { data: pub } = await getPublicationBySlug(slug);

  if (!pub) {
    return { title: "Publication not found" };
  }

  const canonicalUrl = `${SITE_URL}/publications/${slug}`;
  const description = truncate(pub.abstract, 160) || "Journal article from Phnom Penh Teacher Education College.";
  const authors = authorList(pub);
  const pdfUrl = `${SITE_URL}/api/publications/${slug}/file`;

  // Google Scholar citation_* meta tags — required for indexing
  const citationOther: Record<string, string | string[]> = {
    citation_title: pub.title,
    citation_publication_date: citationDate(pub),
    citation_pdf_url: pdfUrl,
    citation_language: pub.language,
  };
  if (authors.length > 0) citationOther.citation_author = authors;
  if (pub.journal_name) citationOther.citation_journal_title = pub.journal_name;
  if (pub.volume) citationOther.citation_volume = pub.volume;
  if (pub.issue_no) citationOther.citation_issue = pub.issue_no;
  if (pub.page_start) citationOther.citation_firstpage = pub.page_start;
  if (pub.page_end) citationOther.citation_lastpage = pub.page_end;
  if (pub.doi) citationOther.citation_doi = pub.doi;
  if (pub.abstract) citationOther.citation_abstract = pub.abstract;
  if (pub.keywords.length > 0) citationOther.citation_keywords = pub.keywords.join("; ");

  return {
    title: pub.title,
    description,
    keywords: pub.keywords.length > 0 ? pub.keywords : undefined,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title: pub.title,
      description,
      type: "article",
      url: canonicalUrl,
      images: pub.cover_url ? [{ url: pub.cover_url, alt: pub.title }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title: pub.title,
      description,
      images: pub.cover_url ? [pub.cover_url] : undefined,
    },
    other: citationOther,
  };
}

export default async function PublicationDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const { data: pub, error } = await getPublicationBySlug(slug);

  if (error || !pub) {
    notFound();
  }

  const supabase = await createClient();

  // Admin-only edit link — best-effort, non-blocking
  let isAdmin = false;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      isAdmin = ADMIN_PANEL_ROLES.includes((profile?.role ?? "reader") as AppRole);
    }
  } catch { /* non-fatal */ }

  // ── Affiliations for superscript markers ──────────────────────────────────
  const authorships = pub.authorships ?? [];
  const affiliationIds = [...new Set(authorships.flatMap((a) => a.affiliation_ids))];
  let affiliations: PublicationAffiliation[] = [];
  if (affiliationIds.length > 0) {
    const { data: affRows } = await supabase
      .from("publication_affiliations")
      .select("id, name, name_km, city, country")
      .in("id", affiliationIds);
    affiliations = (affRows ?? []) as PublicationAffiliation[];
  }
  // Stable superscript numbering: order of first appearance in the byline
  const markerFor = new Map<string, number>();
  for (const a of authorships) {
    for (const affId of a.affiliation_ids) {
      if (!markerFor.has(affId)) markerFor.set(affId, markerFor.size + 1);
    }
  }
  const orderedAffiliations = [...markerFor.entries()]
    .map(([id, marker]) => ({ marker, affiliation: affiliations.find((x) => x.id === id) }))
    .filter((x): x is { marker: number; affiliation: PublicationAffiliation } => !!x.affiliation);
  const correspondingAuthors = authorships.filter((a) => a.is_corresponding);

  // ── Related by keyword overlap ────────────────────────────────────────────
  let related: Publication[] = [];
  if (pub.keywords.length > 0) {
    const { data: relatedRows } = await supabase
      .from("publications_with_stats")
      .select("*")
      .eq("is_published", true)
      .neq("id", pub.id)
      .overlaps("keywords", pub.keywords)
      .order("publication_date", { ascending: false, nullsFirst: false })
      .limit(5);
    related = (relatedRows ?? []).map(mapRowToPublication);
  }

  const citationLine = toCitationLine(pub);
  const publishedOn = formatDate(pub.publication_date ?? pub.published_at);
  const fileHref = `/api/publications/${slug}/file`;
  const shareUrl = `${SITE_URL}/publications/${slug}`;
  const year = citationYear(pub);

  // ── Tab content ───────────────────────────────────────────────────────────
  const abstractPanel = (
    <div className="max-w-3xl">
      <h2 className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em] text-text-muted">
        Abstract
      </h2>

      {pub.cover_url && (
        <div className="relative float-none mb-5 w-full overflow-hidden rounded-xl border border-divider sm:float-left sm:mb-4 sm:mr-6 sm:w-[240px]">
          <Image
            src={pub.cover_url}
            alt={`Graphical abstract for ${pub.title}`}
            width={480}
            height={360}
            className="h-auto w-full object-cover"
          />
        </div>
      )}

      <p className="font-sans text-[15px] leading-8 text-text-body sm:text-[15.5px]">
        {pub.abstract || "No abstract provided."}
      </p>

      {pub.abstract_km && (
        <p className="mt-4 font-khmer-serif text-[15px] leading-8 text-text-body clear-both">
          {pub.abstract_km}
        </p>
      )}

      {pub.keywords.length > 0 && (
        <div className="mt-7 clear-both border-t border-divider pt-5">
          <h3 className="mb-2.5 text-[12px] font-bold uppercase tracking-[0.14em] text-text-muted">
            Keywords
          </h3>
          <div className="flex flex-wrap gap-2">
            {pub.keywords.map((kw) => (
              <Link
                key={kw}
                href={`/publications?keyword=${encodeURIComponent(kw)}`}
                className="rounded-full border border-divider bg-paper px-3 py-1 text-[12.5px] font-medium text-text-body transition-colors hover:border-brand/40 hover:bg-brand/5 hover:text-brand"
              >
                {kw}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const tabs: ThesisTab[] = [{ id: "abstract", label: "Abstract", content: abstractPanel }];

  if (pub.pdf_url) {
    tabs.push({
      id: "fulltext",
      label: "Full Text",
      lazy: true,
      content: (
        <div className="-m-1">
          <PDFViewer
            title={pub.title}
            pdfUrl={fileHref}
            bookId={pub.id}
            totalPages={100}
            initialProgressPct={0}
            initialMaxProgressPct={0}
            allowDownload={true}
          />
        </div>
      ),
    });
  }

  const referenceStrings = pub.references.map((r) => {
    const link = r.url ?? (r.doi ? `https://doi.org/${r.doi}` : null);
    return link && !r.text.includes(link) ? `${r.text} ${link}` : r.text;
  });
  tabs.push({
    id: "references",
    label: "References",
    badge: referenceStrings.length || undefined,
    content: <ReferenceList references={referenceStrings} />,
  });

  if (pub.files?.length) {
    tabs.push({
      id: "supporting",
      label: "Supporting Info",
      badge: pub.files.length,
      content: (
        <ul className="max-w-3xl space-y-2">
          {pub.files.map((f) => (
            <li key={f.id}>
              <a
                href={f.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 rounded-xl border border-divider bg-bg-surface px-4 py-3 transition-colors hover:border-brand/40 hover:bg-brand/5"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/8 text-brand">
                  <FileText className="h-4.5 w-4.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-text-heading transition-colors group-hover:text-brand">
                    {f.label}
                  </span>
                  <span className="text-[11.5px] uppercase text-text-muted">
                    {f.file_type ?? "file"}
                    {f.size_bytes ? ` · ${(f.size_bytes / (1024 * 1024)).toFixed(1)} MB` : ""}
                  </span>
                </span>
                <Download className="h-4 w-4 shrink-0 text-text-muted transition-colors group-hover:text-brand" />
              </a>
            </li>
          ))}
        </ul>
      ),
    });
  }

  // ── JSON-LD (ScholarlyArticle) ────────────────────────────────────────────
  const scholarlyArticleSchema = {
    "@context": "https://schema.org",
    "@type": "ScholarlyArticle",
    headline: pub.title,
    abstract: pub.abstract || undefined,
    author: authorList(pub).length > 0
      ? authorList(pub).map((name) => ({ "@type": "Person", name }))
      : { "@type": "Organization", name: "Unknown Author" },
    datePublished: pub.publication_date ?? pub.published_at ?? pub.created_at ?? undefined,
    keywords: pub.keywords.length > 0 ? pub.keywords.join(", ") : undefined,
    image: pub.cover_url || `${SITE_URL}/og-image.jpg`,
    url: shareUrl,
    isAccessibleForFree: true,
    ...(pub.journal_name
      ? {
          isPartOf: {
            "@type": "Periodical",
            name: pub.journal_name,
          },
        }
      : {}),
    ...(pub.license ? { license: pub.license } : {}),
    publisher: {
      "@type": "EducationalOrganization",
      name: "Phnom Penh Teacher Education College",
      url: SITE_URL,
    },
    ...(pub.doi
      ? {
          identifier: {
            "@type": "PropertyValue",
            propertyID: "DOI",
            value: pub.doi,
          },
        }
      : {}),
  };

  return (
    <section className="min-h-screen bg-bg-body px-4 py-6 sm:px-6 sm:py-10 md:px-12">
      <JsonLd data={scholarlyArticleSchema} />
      <PublicationViewPing id={pub.id} />
      <div className="mx-auto max-w-[1200px]">
        {/* ── Breadcrumb + admin ── */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <nav
            aria-label="Breadcrumb"
            className="flex flex-wrap items-center gap-1.5 overflow-hidden text-[13px] font-medium text-text-muted sm:gap-2 sm:text-[14.5px]"
          >
            <Link href="/" className="transition-colors hover:text-brand">Home</Link>
            <Icon name="chevron-right" className="text-[16px] text-divider" />
            <Link href="/publications" className="transition-colors hover:text-brand">Publications</Link>
            <Icon name="chevron-right" className="text-[16px] text-divider" />
            <span className="max-w-[200px] truncate font-semibold text-text-heading sm:max-w-[340px]" title={pub.title}>
              {pub.title}
            </span>
          </nav>
          {isAdmin && (
            <Link
              href={`/admin/publications/edit/${pub.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-divider bg-bg-surface px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:border-brand hover:text-brand"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit publication
            </Link>
          )}
        </div>

        {/* ── Article header ── */}
        <header className="gradient-top-border mb-7 overflow-hidden rounded-[28px] border border-divider bg-bg-surface p-5 shadow-sm sm:p-7 md:p-9">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand/8 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-brand">
              <span className="h-1.5 w-1.5 rounded-full bg-brand/60" />
              {pub.journal_name ?? TYPE_LABELS[pub.article_type] ?? "Article"}
              {pub.journal_name && (
                <span className="ml-1 rounded-full bg-brand/10 px-2 py-px text-[9.5px] normal-case tracking-normal">
                  {TYPE_LABELS[pub.article_type] ?? pub.article_type}
                </span>
              )}
            </span>
            {pub.doi && (
              <a
                href={pub.doi.startsWith("http") ? pub.doi : `https://doi.org/${pub.doi}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[11.5px] text-text-muted transition-colors hover:text-brand"
              >
                DOI: {pub.doi.replace(/^https?:\/\/doi\.org\//, "")}
              </a>
            )}
          </div>

          <h1 className="mt-3 font-khmer-serif text-[clamp(24px,4vw,36px)] font-bold leading-[1.28] text-text-heading">
            {pub.title}
          </h1>
          {pub.title_km && (
            <p className="mt-1.5 font-khmer-serif text-[clamp(16px,2.5vw,22px)] font-semibold leading-snug text-text-muted">
              {pub.title_km}
            </p>
          )}

          {/* Byline with superscript affiliation markers */}
          {authorships.length > 0 ? (
            <p className="mt-4 text-[15px] leading-7 text-text-body sm:text-[16.5px]">
              {authorships.map((a, i) => (
                <span key={a.author.id}>
                  <span className="font-semibold text-text-heading">{a.author.full_name}</span>
                  {a.affiliation_ids.length > 0 && (
                    <sup className="ml-0.5 text-[11px] text-text-muted">
                      {a.affiliation_ids.map((id) => markerFor.get(id)).filter(Boolean).join(",")}
                    </sup>
                  )}
                  {a.is_corresponding && <sup className="text-[11px] text-brand">*</sup>}
                  {i < authorships.length - 1 && <span className="text-text-muted">, </span>}
                </span>
              ))}
            </p>
          ) : pub.author_names ? (
            <p className="mt-4 text-[15px] text-text-body sm:text-[16.5px]">
              <span className="font-semibold text-text-heading">{pub.author_names}</span>
            </p>
          ) : null}

          {/* Affiliation panel (collapsible) */}
          {(orderedAffiliations.length > 0 || correspondingAuthors.length > 0) && (
            <details className="group mt-3 rounded-xl border border-divider bg-paper/50 open:bg-paper/80">
              <summary className="cursor-pointer select-none px-4 py-2.5 text-[12.5px] font-semibold text-text-muted transition-colors hover:text-brand">
                Affiliations & corresponding author
              </summary>
              <div className="space-y-2 border-t border-divider px-4 py-3">
                {orderedAffiliations.map(({ marker, affiliation }) => (
                  <p key={affiliation.id} className="flex gap-2 text-[13px] leading-6 text-text-body">
                    <sup className="mt-1.5 shrink-0 font-bold text-text-muted">{marker}</sup>
                    <span>
                      {affiliation.name}
                      {affiliation.name_km && <span className="ml-1.5 text-text-muted">({affiliation.name_km})</span>}
                      {[affiliation.city, affiliation.country].filter(Boolean).length > 0 && (
                        <span className="text-text-muted">
                          {" — "}
                          {[affiliation.city, affiliation.country].filter(Boolean).join(", ")}
                        </span>
                      )}
                    </span>
                  </p>
                ))}
                {correspondingAuthors.map((a) => (
                  <p key={a.author.id} className="flex items-center gap-2 text-[13px] text-text-body">
                    <sup className="font-bold text-brand">*</sup>
                    <span className="font-medium">{a.author.full_name}</span>
                    {a.author.email && (
                      <a
                        href={`mailto:${a.author.email}`}
                        className="inline-flex items-center gap-1 text-brand hover:underline"
                      >
                        <Mail className="h-3.5 w-3.5" /> {a.author.email}
                      </a>
                    )}
                    {a.author.orcid && (
                      <a
                        href={`https://orcid.org/${a.author.orcid.replace(/^https?:\/\/orcid\.org\//, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-[11px] text-text-muted hover:text-brand"
                      >
                        ORCID: {a.author.orcid.replace(/^https?:\/\/orcid\.org\//, "")}
                      </a>
                    )}
                  </p>
                ))}
              </div>
            </details>
          )}

          {/* Citation line */}
          {citationLine && (
            <p className="mt-4 text-[13.5px] text-text-muted">
              <span className="font-semibold text-text-body">Cite this: </span>
              <em>{citationLine}</em>
            </p>
          )}

          {/* Meta chips */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {publishedOn && (
              <MetaChip icon={<CalendarDays className="h-3.5 w-3.5" />}>{publishedOn}</MetaChip>
            )}
            {pub.license && (
              <MetaChip icon={<Scale className="h-3.5 w-3.5" />}>{pub.license}</MetaChip>
            )}
            {pub.language && (
              <MetaChip icon={<ScrollText className="h-3.5 w-3.5" />}>
                {pub.language === "km" ? "ភាសាខ្មែរ" : "English"}
              </MetaChip>
            )}
          </div>

          {/* Actions */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {pub.pdf_url && (
              <a
                href={`${fileHref}?download=1`}
                className="btn-brand-gradient inline-flex items-center justify-center gap-2 rounded-[14px] px-6 py-3 text-[15px] font-bold text-white"
              >
                <Download className="h-[18px] w-[18px]" />
                Download PDF
              </a>
            )}
            <ShareButton url={shareUrl} />
          </div>
        </header>

        {/* ── Body: tabs + sidebar ── */}
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="min-w-0">
            <ThesisTabs tabs={tabs} defaultTab="abstract" />
          </div>

          {/* Sidebar */}
          <aside className="space-y-5">
            {/* Graphical abstract / cover */}
            {pub.cover_url && (
              <div className="overflow-hidden rounded-2xl border border-divider/60 bg-paper shadow-sm">
                <div className="relative aspect-[3/4] w-full">
                  <Image
                    src={pub.cover_url}
                    alt={pub.title}
                    fill
                    sizes="(max-width: 768px) 100vw, 240px"
                    className="object-cover"
                  />
                </div>
              </div>
            )}

            {/* Cite this */}
            <CitePublication publication={pub} />

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center shadow-sm dark:border-emerald-800/30 dark:bg-emerald-950/20">
                <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                  <Eye className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
                </div>
                <div className="text-[20px] font-bold text-emerald-800 dark:text-emerald-300">{(pub.view_count || 0) + 1}</div>
                <div className="text-[11px] uppercase tracking-wider text-emerald-600 dark:text-emerald-500">Views</div>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center shadow-sm dark:border-amber-800/30 dark:bg-amber-950/20">
                <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                  <Download className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                </div>
                <div className="text-[20px] font-bold text-amber-800 dark:text-amber-300">{pub.download_count || 0}</div>
                <div className="text-[11px] uppercase tracking-wider text-amber-600 dark:text-amber-500">Downloads</div>
              </div>
            </div>

            {/* Article information */}
            <div className="gradient-top-border overflow-hidden rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm">
              <h3 className="mb-3 text-[13px] font-bold uppercase tracking-wider text-text-heading">
                Article information
              </h3>
              <dl className="space-y-2.5 text-[13px]">
                <InfoRow label="Type" value={TYPE_LABELS[pub.article_type] ?? pub.article_type} />
                {pub.journal_name && <InfoRow label="Journal" value={pub.journal_name} />}
                {pub.volume && <InfoRow label="Volume" value={pub.issue_no ? `${pub.volume} (${pub.issue_no})` : pub.volume} />}
                {(pub.page_start || pub.article_no) && (
                  <InfoRow
                    label="Pages"
                    value={pub.page_start ? [pub.page_start, pub.page_end].filter(Boolean).join("–") : pub.article_no}
                  />
                )}
                {year && <InfoRow label="Year" value={year} />}
                {publishedOn && <InfoRow label="Published" value={publishedOn} />}
                {pub.license && <InfoRow label="License" value={pub.license} />}
                {pub.copyright && <InfoRow label="Copyright" value={pub.copyright} />}
                {pub.doi && (
                  <InfoRow
                    label="DOI"
                    value={
                      <a
                        href={pub.doi.startsWith("http") ? pub.doi : `https://doi.org/${pub.doi}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all font-mono text-brand hover:underline"
                      >
                        {pub.doi.replace(/^https?:\/\/doi\.org\//, "")}
                      </a>
                    }
                  />
                )}
              </dl>
            </div>

            {/* Affiliations quick view */}
            {orderedAffiliations.length > 0 && (
              <div className="gradient-top-border overflow-hidden rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm">
                <h3 className="mb-3 inline-flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-text-heading">
                  <Building2 className="h-4 w-4 text-brand" /> Affiliations
                </h3>
                <ul className="space-y-2 text-[12.5px] leading-5 text-text-body">
                  {orderedAffiliations.map(({ marker, affiliation }) => (
                    <li key={affiliation.id} className="flex gap-2">
                      <sup className="mt-1 shrink-0 font-bold text-text-muted">{marker}</sup>
                      <span>{affiliation.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>

        {/* ── Related by keyword ── */}
        {related.length > 0 && (
          <div className="mt-10">
            <h2 className="mb-4 font-khmer-serif text-xl font-bold text-text-heading">
              Related publications
            </h2>
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 sm:gap-5">
              {related.map((r) => (
                <PublicationCard key={r.id} publication={r} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-text-muted">{label}</dt>
      <dd className="min-w-0 text-right font-medium text-text-heading">{value}</dd>
    </div>
  );
}

function MetaChip({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-divider bg-paper px-2.5 py-1.5 text-[12.5px] font-medium text-text-body">
      <span className="text-text-muted">{icon}</span>
      {children}
    </span>
  );
}
