import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, Inbox } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/server";
import { mapRowToPublication, type Publication } from "@/lib/publications";
import PublicationCard from "@/components/ui/publications/PublicationCard";

interface RelatedPublicationsProps {
  currentId: string;
  journalName: string | null;
  keywords: string[];
  firstAuthorId: string | null;
}

/**
 * Cascades through relatedness signals, strongest first, until TARGET items
 * are collected: same journal -> shared keywords (the original single-signal
 * query) -> same first author -> most-viewed fallback.
 */
export default async function RelatedPublications({
  currentId,
  journalName,
  keywords,
  firstAuthorId,
}: RelatedPublicationsProps) {
  const supabase = createServiceClient();
  const TARGET = 6;

  const seen = new Set<string>([currentId]);
  const collected: Publication[] = [];
  const reasons = new Map<string, string>();

  async function pullByJournal() {
    if (collected.length >= TARGET || !journalName) return;
    const { data } = await supabase
      .from("publications_with_stats")
      .select("*")
      .eq("is_published", true)
      .eq("journal_name", journalName)
      .neq("id", currentId)
      .order("publication_date", { ascending: false, nullsFirst: false })
      .limit(12);
    for (const row of data ?? []) {
      if (collected.length >= TARGET) break;
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      const pub = mapRowToPublication(row);
      collected.push(pub);
      reasons.set(pub.id, "journal");
    }
  }

  async function pullByKeywords() {
    if (collected.length >= TARGET || keywords.length === 0) return;
    const { data } = await supabase
      .from("publications_with_stats")
      .select("*")
      .eq("is_published", true)
      .neq("id", currentId)
      .overlaps("keywords", keywords)
      .order("publication_date", { ascending: false, nullsFirst: false })
      .limit(12);
    for (const row of data ?? []) {
      if (collected.length >= TARGET) break;
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      const pub = mapRowToPublication(row);
      collected.push(pub);
      reasons.set(pub.id, "keywords");
    }
  }

  async function pullByAuthor() {
    if (collected.length >= TARGET || !firstAuthorId) return;
    const { data } = await supabase
      .from("publication_authorships")
      .select("publications!inner(*)")
      .eq("author_id", firstAuthorId)
      .eq("publications.is_published", true)
      .neq("publication_id", currentId)
      .limit(12);
    type Row = { publications: Record<string, unknown> & { id: string } };
    for (const row of (data ?? []) as unknown as Row[]) {
      if (collected.length >= TARGET) break;
      const raw = row.publications;
      if (!raw || seen.has(raw.id)) continue;
      seen.add(raw.id);
      const pub = mapRowToPublication(raw);
      collected.push(pub);
      reasons.set(pub.id, "author");
    }
  }

  async function pullPopular() {
    if (collected.length >= TARGET) return;
    const { data } = await supabase
      .from("publications_with_stats")
      .select("*")
      .eq("is_published", true)
      .neq("id", currentId)
      .order("view_count", { ascending: false })
      .limit(12);
    for (const row of data ?? []) {
      if (collected.length >= TARGET) break;
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      const pub = mapRowToPublication(row);
      collected.push(pub);
      reasons.set(pub.id, "popular");
    }
  }

  await pullByJournal();
  await pullByKeywords();
  await pullByAuthor();
  await pullPopular();

  const t = await getTranslations("publicationDetail");
  const reasonLabel: Record<string, string> = {
    journal: t("reasonJournal"),
    keywords: t("reasonKeywords"),
    author: t("reasonAuthor"),
    popular: t("reasonPopular"),
  };

  return (
    <section id="related" className="scroll-mt-20 mt-16 lg:scroll-mt-32" aria-labelledby="related-heading">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="h-[3px] w-8 rounded-full bg-gradient-to-r from-brand to-accent" />
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-text-muted">
              {t("keepReading")}
            </span>
          </div>
          <h2 id="related-heading" className="font-khmer-serif text-[26px] font-bold text-text-heading sm:text-[28px]">
            {t("relatedPublications")}
          </h2>
          <p className="mt-1 text-[13px] text-text-muted">{t("relatedSubtitle")}</p>
        </div>
        <Link
          href="/publications"
          className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-divider bg-bg-surface px-4 py-2 text-[13px] font-semibold text-text-body shadow-sm transition-colors duration-150 hover:border-brand/40 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
        >
          {t("browseAll")}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {collected.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-divider bg-bg-surface py-14 text-center">
          <Inbox className="h-10 w-10 text-text-muted/30" />
          <p className="text-[14px] text-text-muted">{t("noRelated")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 xl:grid-cols-6">
          {collected.map((pub) => {
            const reason = reasons.get(pub.id);
            const label = reason ? reasonLabel[reason] : undefined;
            return (
              <div key={pub.id} className="relative">
                {label && (
                  <span className="pointer-events-none absolute left-3 top-3 z-30 rounded-full bg-brand/90 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow-sm backdrop-blur-sm">
                    {label}
                  </span>
                )}
                <PublicationCard publication={pub} />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
