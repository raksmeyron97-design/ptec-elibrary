import { Link } from "@/i18n/navigation";
import Icon from "@/components/ui/core/Icon";
import BreadcrumbNav from "@/components/ui/core/BreadcrumbNav";
import PageJsonLd from "@/components/seo/PageJsonLd";
import type { BrowseThesisRow } from "@/lib/theses/browse";
import { scriptOf } from "@/lib/theses/script";

/**
 * A research browse page (SEO Phase 3.5): one year or one programme, every
 * work in it as a plain link. Server-rendered, no filters, no pagination —
 * its job is to be a short, crawlable path to each thesis.
 */
export default function ThesisBrowseView({
  heading,
  description,
  rows,
  crumbs,
  jsonLd,
}: {
  heading: string;
  description: string;
  rows: readonly BrowseThesisRow[];
  crumbs: { home: string; theses: string };
  jsonLd: Record<string, unknown>[];
}) {
  return (
    <main className="min-h-screen bg-bg-body px-4 py-8 md:px-12">
      <PageJsonLd nodes={jsonLd} />
      <div className="mx-auto max-w-[960px]">
        <BreadcrumbNav className="mb-6 flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-text-muted sm:gap-2">
          <Link href="/" className="focus-field rounded-sm transition-colors hover:text-brand">
            {crumbs.home}
          </Link>
          <Icon name="chevron-right" className="text-[16px] text-divider" />
          <Link href="/theses" className="focus-field rounded-sm transition-colors hover:text-brand">
            {crumbs.theses}
          </Link>
          <Icon name="chevron-right" className="text-[16px] text-divider" />
          <span className="font-semibold text-text-heading">{heading}</span>
        </BreadcrumbNav>

        <header className="mb-8">
          <h1 className="text-[clamp(24px,4vw,34px)] font-bold leading-[1.25] tracking-tight text-text-heading [text-wrap:balance]">
            {heading}
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-text-muted">{description}</p>
        </header>

        <ul className="grid gap-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-xl border border-divider bg-bg-surface p-4">
              <Link
                href={`/theses/${row.slug}`}
                lang={scriptOf(row.title)}
                className="focus-field rounded-sm text-[15.5px] font-semibold text-text-heading transition-colors hover:text-brand"
              >
                {row.title}
              </Link>
              {(row.author_names || row.academic_year) && (
                <p className="mt-1 text-[13px] text-text-muted">
                  {[row.author_names, row.academic_year].filter(Boolean).join(" · ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
