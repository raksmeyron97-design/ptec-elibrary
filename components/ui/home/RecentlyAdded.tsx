// components/ui/home/RecentlyAdded.tsx
// Cross-content activity feed: the 8 newest items across books, theses, and
// publications, each with a type badge and a dated "added N days ago" stamp.
// Distinct from the Newest Books cover rail — the dates are the message: this
// library is maintained. Rendered fully server-side (locale-aware, no
// hydration drift).
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTranslations, getLocale } from "next-intl/server";

type FeedItem = {
  key: string;
  type: "book" | "thesis" | "publication";
  title: string;
  href: string;
  createdAt: string;
  /** Whole days since createdAt, computed at fetch time. */
  daysAgo: number;
};

async function getRecentItems(): Promise<FeedItem[]> {
  const supabase = await createClient();

  const [booksRes, thesesRes, pubsRes] = await Promise.all([
    supabase
      .from("books")
      .select("slug, title, created_at")
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("research_reports")
      .select("id, slug, title, created_at")
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("publications")
      .select("slug, title, created_at")
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const now = Date.now();
  const withAge = (createdAt: string) => ({
    createdAt,
    daysAgo: Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 86_400_000)),
  });

  const items: FeedItem[] = [
    ...(booksRes.data ?? []).map((b) => ({
      key: `book-${b.slug}`,
      type: "book" as const,
      title: b.title as string,
      href: `/books/${b.slug}`,
      ...withAge(b.created_at as string),
    })),
    ...(thesesRes.data ?? []).map((r) => ({
      key: `thesis-${r.id}`,
      type: "thesis" as const,
      title: r.title as string,
      href: `/theses/${r.slug ?? r.id}`,
      ...withAge(r.created_at as string),
    })),
    ...(pubsRes.data ?? []).map((p) => ({
      key: `pub-${p.slug}`,
      type: "publication" as const,
      title: p.title as string,
      href: `/publications/${p.slug}`,
      ...withAge(p.created_at as string),
    })),
  ];

  return items
    .filter((i) => i.title && i.createdAt)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);
}

const BADGE_STYLE: Record<FeedItem["type"], string> = {
  book: "bg-brand/10 text-brand",
  thesis: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
  publication: "bg-gold-500/15 text-accent-text",
};

export default async function RecentlyAdded() {
  const items = await getRecentItems();
  if (items.length === 0) return null;

  const [t, locale] = await Promise.all([getTranslations("home"), getLocale()]);
  const latinEyebrow = locale === "en" ? "uppercase tracking-[0.2em]" : "tracking-normal";

  const badgeLabel: Record<FeedItem["type"], string> = {
    book: t("recentTypeBook"),
    thesis: t("recentTypeThesis"),
    publication: t("recentTypePublication"),
  };

  const relative = (days: number): string => {
    if (days === 0) return t("today");
    if (days === 1) return t("yesterday");
    if (days < 7) return t("daysAgo", { days });
    return t("weeksAgo", { weeks: Math.floor(days / 7) });
  };

  return (
    <section className="border-b border-divider/60 bg-paper" aria-labelledby="recently-added-title">
      <div className="mx-auto max-w-[1400px] px-4 py-12 sm:py-14 md:px-12 md:py-16">
        {/* ── Header ── */}
        <div className="mb-8">
          <div className="mb-2 flex items-center gap-3">
            <span className="h-[3px] w-7 rounded-full bg-gradient-to-r from-accent to-brand" aria-hidden />
            <span className={`text-[11px] font-bold text-accent-text ${latinEyebrow}`}>
              {t("recentEyebrow")}
            </span>
          </div>
          <h2
            id="recently-added-title"
            className="font-khmer-serif font-bold leading-tight tracking-tight text-text-heading"
            style={{ fontSize: "clamp(22px, 2.4vw, 32px)" }}
          >
            {t("recentTitle")}
          </h2>
        </div>

        {/* ── Feed ── */}
        <ul className="grid gap-x-8 sm:grid-cols-2">
          {items.map((item) => (
            <li
              key={item.key}
              className="relative flex items-center gap-3 border-b border-divider py-3.5"
            >
              <span
                className={`shrink-0 rounded-[6px] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider ${BADGE_STYLE[item.type]}`}
              >
                {badgeLabel[item.type]}
              </span>
              <h3 className="min-w-0 flex-1 text-[14px] font-semibold leading-snug text-text-heading line-clamp-1">
                <Link
                  href={item.href}
                  className="after:absolute after:inset-0 transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 rounded-sm"
                >
                  {item.title}
                </Link>
              </h3>
              <time
                dateTime={item.createdAt}
                title={new Date(item.createdAt).toLocaleDateString(locale === "km" ? "km-KH" : "en-GB")}
                className="shrink-0 text-[12px] font-medium text-text-muted"
              >
                {relative(item.daysAgo)}
              </time>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
