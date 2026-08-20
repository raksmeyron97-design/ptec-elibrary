// components/ui/home/NewArrivals.tsx
// "New this week" — the most recently ADDED items across all three digital
// types, ranked purely by when they joined the library.
//
// Distinct from <ThisWeekAtPtec>, which is curated (editor's pick + a
// publication + a path + a post). This one makes no editorial claim: it is a
// chronological window on the collection, so a reader who visits weekly can
// see what is actually new.
import { Link } from "@/i18n/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { getRecentAdditions, type RecentItem, type RecentItemType } from "@/lib/home-data";
import RecentCover from "./RecentCover";

// Route + badge per type. Both reuse what the rest of the site already
// established — the palette and labels are the search results' TYPE_BADGE, so
// a thesis looks like a thesis wherever a reader meets one.
const TYPE_META: Record<
  RecentItemType,
  { hrefBase: string; labelKey: "badgeBook" | "badgeThesis" | "badgePublication"; badgeClass: string }
> = {
  book: {
    hrefBase: "/books",
    labelKey: "badgeBook",
    badgeClass:
      "bg-blue-500/15 text-blue-700 border-blue-500/25 dark:bg-blue-400/10 dark:text-blue-300 dark:border-blue-400/25",
  },
  thesis: {
    hrefBase: "/theses",
    labelKey: "badgeThesis",
    badgeClass:
      "bg-green-600/15 text-green-800 border-green-600/25 dark:bg-green-400/10 dark:text-green-300 dark:border-green-400/25",
  },
  publication: {
    hrefBase: "/publications",
    labelKey: "badgePublication",
    badgeClass:
      "bg-cyan-600/15 text-cyan-800 border-cyan-500/25 dark:bg-cyan-400/10 dark:text-cyan-300 dark:border-cyan-400/25",
  },
};

/**
 * Cambodia time, so "added" dates agree with the rest of the site's clock
 * (lib/library-hours.ts) rather than with whatever region the server runs in.
 * Returns a plain string: `{date}` is an ICU placeholder, and placeholders
 * take primitives — passing a React element needs t.rich plus a real
 * <tag> in the message, which this copy does not have.
 */
function addedLabel(item: RecentItem, locale: string): string {
  return new Intl.DateTimeFormat(locale === "km" ? "km-KH" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Phnom_Penh",
  }).format(new Date(item.addedAt));
}

export default async function NewArrivals() {
  // `failed` names sources whose query errored, as opposed to sources that
  // simply had nothing to give. The strip still renders whatever succeeded —
  // a broken publications query must not take books and theses down with it —
  // but the two states are no longer indistinguishable to anything reading
  // this data. See RecentAdditions in lib/home-data.ts.
  const { items } = await getRecentAdditions(4);
  // Nothing added yet — render nothing rather than an empty shelf.
  if (items.length === 0) return null;

  const [t, tSearch, locale] = await Promise.all([
    getTranslations("home"),
    getTranslations("search"),
    getLocale(),
  ]);
  const latinEyebrow = locale === "en" ? "uppercase tracking-[0.2em]" : "tracking-normal";

  return (
    <section className="border-b border-divider/60 bg-bg-surface" aria-labelledby="new-arrivals-title">
      <div className="mx-auto max-w-[1400px] px-4 py-12 sm:py-14 md:px-12 md:py-16">
        {/* ── Header ── */}
        <div className="mb-8">
          <div className="mb-2 flex items-center gap-3">
            <span className="h-[3px] w-7 rounded-full bg-gradient-to-r from-brand to-accent" aria-hidden />
            <span className={`text-[11px] font-bold text-brand ${latinEyebrow}`}>
              {t("newArrivalsEyebrow")}
            </span>
          </div>
          <h2
            id="new-arrivals-title"
            className="font-khmer-serif font-bold leading-tight tracking-tight text-text-heading"
            style={{ fontSize: "clamp(22px, 2.4vw, 32px)" }}
          >
            {t("newArrivalsTitle")}
          </h2>
          <p className="mt-2 text-[14.5px] leading-relaxed text-text-muted">{t("newArrivalsBody")}</p>
        </div>

        {/* ── Cards ── */}
        <ul className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
          {items.map((item) => {
            const meta = TYPE_META[item.type];
            return (
              <li key={`${item.type}-${item.id}`}>
                <Link
                  href={`${meta.hrefBase}/${item.slug}`}
                  className="group flex h-full flex-col overflow-hidden rounded-2xl border border-divider bg-paper transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-[0_12px_36px_-12px_rgba(11,21,53,0.25)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <div className="relative aspect-[3/4] w-full overflow-hidden bg-bg-surface">
                    <RecentCover
                      src={item.coverUrl}
                      title={item.title}
                      author={item.author}
                      // Two per row on phones, four from lg — sized so a phone
                      // never downloads a desktop-width cover.
                      sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 300px"
                    />
                    <span
                      className={`absolute right-2 top-2 rounded-full border px-2 py-0.5 text-[10.5px] font-bold backdrop-blur-sm ${meta.badgeClass}`}
                    >
                      {tSearch(meta.labelKey)}
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col p-3.5">
                    <h3 className="font-khmer-serif text-[14.5px] font-bold leading-snug text-text-heading transition-colors line-clamp-2 group-hover:text-brand">
                      {item.title}
                    </h3>
                    {item.author && (
                      <p className="mt-1 text-[12.5px] text-text-muted line-clamp-1">{item.author}</p>
                    )}
                    <p className="mt-auto pt-2.5 text-[11.5px] font-medium text-text-muted">
                      {t("newArrivalsAdded", { date: addedLabel(item, locale) })}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
