"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import SmartBookCover from "@/components/ui/books/SmartBookCover";
import { ArrowLink, SectionHeading } from "@/components/ui/dashboard/primitives";
import type { Recommendation, RecommendationsResponse } from "@/app/api/recommendations/route";

// Six fills every breakpoint's grid exactly (2×3, 3×2, 6×1), so no row ends
// on a lone orphan card the way five-in-a-four-column grid did.
const SHOWN = 6;
const GRID = "grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 sm:gap-x-4 xl:grid-cols-6";

function Skeleton() {
  // Same heading block and grid as the loaded state, so the section does not
  // jump when the fetch lands.
  return (
    <div aria-hidden="true">
      <div className="mb-5 h-6 w-52 rounded-md skeleton" />
      <div className={GRID}>
        {Array.from({ length: SHOWN }).map((_, i) => (
          <div key={i}>
            <div className="aspect-[2/3] w-full rounded-xl skeleton" />
            <div className="mt-2.5 h-3.5 w-11/12 rounded skeleton" />
            <div className="mt-1.5 h-3 w-2/3 rounded skeleton" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Item({ item, reason }: { item: Recommendation; reason: string }) {
  return (
    <Link href={`/books/${item.slug}`} prefetch={false} className="focus-field group block rounded-xl">
      <span className="relative block aspect-[2/3] w-full overflow-hidden rounded-xl bg-paper ring-1 ring-divider transition-shadow group-hover:shadow-md">
        <SmartBookCover
          coverUrl={item.coverUrl}
          title={item.title}
          author={item.author}
          category={item.category ?? item.department}
          seed={item.slug}
          variant="card"
          sizes="(max-width:640px) 45vw, (max-width:1280px) 30vw, 200px"
          imgClassName="transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
      </span>
      <span className="mt-2.5 block font-khmer-serif text-[13.5px] font-bold leading-snug text-text-heading line-clamp-2 group-hover:text-brand" dir="auto">
        {item.title}
      </span>
      {item.author && <span className="mt-0.5 block truncate text-[12px] text-text-muted" dir="auto">{item.author}</span>}
      <span className="mt-1 block truncate text-[11.5px] font-medium text-brand/80" dir="auto">{reason}</span>
    </Link>
  );
}

export default function RecommendedBooks({ viewAllHref = "/books" }: { viewAllHref?: string }) {
  const t = useTranslations("dashboard");
  const [data, setData] = useState<RecommendationsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/recommendations", { signal: controller.signal })
      .then(r => (r.ok ? r.json() : null))
      .then((d: RecommendationsResponse | null) => {
        setData(d && Array.isArray(d.items) ? d : { items: [], basedOn: null });
        setLoading(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setData({ items: [], basedOn: null });
        setLoading(false);
      });
    return () => controller.abort();
  }, []);

  if (loading) return <Skeleton />;
  if (!data || data.items.length === 0) return null;

  const reasonText = (r: Recommendation["reason"]) => {
    // Tolerate a response from a build that still sent a sentence.
    if (!r || typeof r !== "object") return typeof r === "string" ? r : "";
    if (r.kind === "recent") return t("reasonRecent", { title: r.title });
    if (r.kind === "topic") return t("reasonTopic", { name: r.name });
    return t("reasonPopular");
  };

  return (
    <section aria-labelledby="recommended-heading">
      <SectionHeading
        id="recommended-heading"
        title={t("recommendedForYou")}
        description={data.basedOn ? t("basedOn", { name: data.basedOn }) : undefined}
        action={<ArrowLink href={viewAllHref}>{t("browseAll")}</ArrowLink>}
      />
      <div className={GRID}>
        {data.items.slice(0, SHOWN).map(item => (
          <Item key={item.id} item={item} reason={reasonText(item.reason)} />
        ))}
      </div>
    </section>
  );
}
