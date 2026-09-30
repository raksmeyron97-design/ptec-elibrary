import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/** Below this many items a hub is "sparse" (SEO Phase 3.8, finding F11). */
export const SPARSE_COLLECTION_MIN = 5;

type Hub = "theses" | "journals" | "posts";

const RELATED: Record<Hub, { href: string; label: "eBooks" | "theses" | "journals" | "learningPaths" }[]> = {
  theses: [
    { href: "/books", label: "eBooks" },
    { href: "/journals", label: "journals" },
    { href: "/paths", label: "learningPaths" },
  ],
  journals: [
    { href: "/theses", label: "theses" },
    { href: "/books", label: "eBooks" },
    { href: "/paths", label: "learningPaths" },
  ],
  posts: [
    { href: "/books", label: "eBooks" },
    { href: "/theses", label: "theses" },
    { href: "/paths", label: "learningPaths" },
  ],
};

/**
 * A hub that holds only a few items says what the collection is for, how to
 * add to it, and where the rest of the library is (SEO Phase 3.8). Production
 * publishes one thesis, one article and two posts: a page with one card and
 * nothing else reads as abandoned to a visitor and as thin to a crawler. Every
 * string is the homepage's own "Grow the collection" copy and the menu's
 * names — nothing new to translate. Renders nothing once the hub is not
 * sparse, and nothing for an empty collection, which has its own empty state.
 */
export default async function SparseCollectionNotice({
  hub,
  total,
  locale,
  show = true,
}: {
  hub: Hub;
  /** Items in the whole collection, or null when the count could not be read. */
  total: number | null;
  locale: string;
  show?: boolean;
}) {
  if (!show || total === null || total <= 0 || total >= SPARSE_COLLECTION_MIN) return null;
  const [tHome, tNav] = await Promise.all([
    getTranslations({ locale, namespace: "home" }),
    getTranslations({ locale, namespace: "nav" }),
  ]);
  return (
    <aside className="mt-8 rounded-2xl border border-divider bg-bg-surface p-5 sm:p-6" aria-labelledby={`sparse-${hub}`}>
      <p className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-brand">{tHome("growEyebrow")}</p>
      <h2 id={`sparse-${hub}`} className="mt-1.5 text-[18px] font-bold text-text-heading">
        {tHome("growTitle")}
      </h2>
      <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-text-body">{tHome("growBody")}</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px]">
        <Link href="/?action=deposit#contribute" className="focus-field rounded-sm font-semibold text-brand hover:underline">
          {tHome("growDepositCta")} →
        </Link>
        {RELATED[hub].map((r) => (
          <Link key={r.href} href={r.href} className="focus-field rounded-sm text-text-body hover:text-brand hover:underline">
            {tNav(r.label)}
          </Link>
        ))}
      </div>
    </aside>
  );
}
