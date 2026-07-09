import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/server";
import { mapRowToPublication } from "@/lib/publications";
import PublicationCard from "@/components/ui/publications/PublicationCard";
import HorizontalCarousel from "@/components/ui/core/HorizontalCarousel";

export default async function MoreFromJournal({
  currentId,
  journalName,
}: {
  currentId: string;
  journalName: string | null;
}) {
  if (!journalName) return null;

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("publications_with_stats")
    .select("*")
    .eq("is_published", true)
    .eq("journal_name", journalName)
    .neq("id", currentId)
    .order("publication_date", { ascending: false, nullsFirst: false })
    .limit(10);

  const siblings = (data ?? []).map(mapRowToPublication);
  if (siblings.length === 0) return null;
  const t = await getTranslations("publicationDetail");

  return (
    <section className="mt-16">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="h-[3px] w-8 rounded-full bg-gradient-to-r from-brand to-accent" />
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-text-muted">
              {t("moreFromJournal")}
            </span>
          </div>
          <h2 className="font-khmer-serif text-[22px] font-bold text-text-heading sm:text-[24px]">
            {journalName}
          </h2>
        </div>
        <Link
          href={`/publications?journal=${encodeURIComponent(journalName)}`}
          className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-divider bg-bg-surface px-4 py-2 text-[13px] font-semibold text-text-body shadow-sm transition-colors duration-150 hover:border-brand/40 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
        >
          {t("browseAll")}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <HorizontalCarousel>
        {siblings.map((s) => (
          <div key={s.id} className="w-[220px] shrink-0 sm:w-[240px]">
            <PublicationCard publication={s} />
          </div>
        ))}
      </HorizontalCarousel>
    </section>
  );
}
