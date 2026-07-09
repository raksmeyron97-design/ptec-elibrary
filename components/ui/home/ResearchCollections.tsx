// components/ui/home/ResearchCollections.tsx
// Curated collection cards (config: lib/home-collections.ts) — the librarian's
// editorial voice. Each card: name, one-line scope, live count, and a fan of
// three recent covers for texture. Cards whose department is empty are hidden.
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { getTranslations, getLocale } from "next-intl/server";
import { HOME_COLLECTIONS, type HomeCollection } from "@/lib/home-collections";

type CollectionCard = HomeCollection & {
  count: number;
  covers: string[];
};

async function getCollections(): Promise<CollectionCard[]> {
  const supabase = await createClient();

  const results = await Promise.all(
    HOME_COLLECTIONS.map(async (col) => {
      const { data, count, error } = await supabase
        .from("books")
        .select("cover_url, departments!inner(name)", { count: "exact" })
        .eq("is_published", true)
        .eq("departments.name", col.department)
        .order("created_at", { ascending: false })
        .limit(3);

      if (error) {
        console.error("[ResearchCollections]", error.message);
        return null;
      }
      return {
        ...col,
        count: count ?? 0,
        covers: (data ?? [])
          .map((r) => r.cover_url as string | null)
          .filter((u): u is string => !!u),
      };
    })
  );

  return results.filter((c): c is CollectionCard => !!c && c.count > 0);
}

function CoverFan({ covers, alt }: { covers: string[]; alt: string }) {
  if (covers.length === 0) return null;
  return (
    <div className="flex shrink-0 items-end" aria-hidden>
      {covers.map((url, i) => (
        <div
          key={`${url}-${i}`}
          className="relative overflow-hidden rounded-[6px] border border-divider bg-paper shadow-md"
          style={{
            width: 44,
            height: 62,
            marginLeft: i === 0 ? 0 : -14,
            zIndex: covers.length - i,
            transform: `rotate(${(i - 1) * 4}deg)`,
          }}
        >
          <Image src={url} alt={alt} fill sizes="44px" className="object-cover" />
        </div>
      ))}
    </div>
  );
}

export default async function ResearchCollections() {
  const collections = await getCollections();
  if (collections.length === 0) return null;

  const [t, locale] = await Promise.all([getTranslations("home"), getLocale()]);
  const latinEyebrow = locale === "en" ? "uppercase tracking-[0.2em]" : "tracking-normal";
  const lang = locale === "km" ? "km" : "en";

  return (
    <section className="border-b border-divider/60 bg-paper" aria-labelledby="collections-title">
      <div className="mx-auto max-w-[1400px] px-4 py-12 sm:py-14 md:px-12 md:py-16">
        {/* ── Header ── */}
        <div className="mb-8">
          <div className="mb-2 flex items-center gap-3">
            <span className="h-[3px] w-7 rounded-full bg-gradient-to-r from-accent to-brand" aria-hidden />
            <span className={`text-[11px] font-bold text-accent-text ${latinEyebrow}`}>
              {t("collectionsEyebrow")}
            </span>
          </div>
          <h2
            id="collections-title"
            className="font-khmer-serif font-bold leading-tight tracking-tight text-text-heading"
            style={{ fontSize: "clamp(22px, 2.4vw, 32px)" }}
          >
            {t("collectionsTitle")}
          </h2>
        </div>

        {/* ── Cards ── */}
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 sm:gap-5">
          {collections.map((col) => (
            <li key={col.department}>
              <Link
                href={`/books?dept=${encodeURIComponent(col.department)}`}
                className="group flex h-full items-start justify-between gap-4 rounded-2xl border border-divider bg-bg-surface p-5 transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md sm:p-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
              >
                <span className="min-w-0">
                  <span className="font-khmer-serif block text-[16.5px] font-bold leading-snug text-text-heading transition-colors group-hover:text-brand">
                    {col.label[lang]}
                  </span>
                  <span className="mt-1.5 block text-[13px] leading-relaxed text-text-muted line-clamp-2">
                    {col.description[lang]}
                  </span>
                  <span className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-bold text-brand">
                    {t("categoriesItemCount", { count: col.count })}
                    <svg className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </span>
                </span>
                <CoverFan covers={col.covers} alt="" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
