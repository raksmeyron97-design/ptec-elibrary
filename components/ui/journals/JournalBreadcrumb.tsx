// The visible trail on journal, issue-list and issue pages. Same markup and
// sizes as the article page's trail, so moving between the four levels does
// not shift the header. The JSON-LD BreadcrumbList is built by each page from
// the same crumbs (lib/seo/schema.ts `breadcrumbSchema`).
import { Link } from "@/i18n/navigation";
import Icon from "@/components/ui/core/Icon";

export type JournalCrumb = { label: string; href?: string };

export default function JournalBreadcrumb({ crumbs }: { crumbs: JournalCrumb[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="mb-6 flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-text-muted sm:gap-2 sm:text-[14.5px]"
    >
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <span key={`${i}-${c.label}`} className="inline-flex min-w-0 items-center gap-1.5 sm:gap-2">
            {i > 0 && <Icon name="chevron-right" className="text-[16px] text-divider" />}
            {c.href && !last ? (
              <Link href={c.href} className="max-w-[240px] truncate transition-colors hover:text-brand" title={c.label}>
                {c.label}
              </Link>
            ) : (
              <span
                aria-current={last ? "page" : undefined}
                className="max-w-[260px] truncate font-semibold text-text-heading sm:max-w-[380px]"
                title={c.label}
              >
                {c.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
