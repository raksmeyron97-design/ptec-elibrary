import { createServiceClient } from "@/lib/supabase/server";
import type { CatalogBook } from "@/lib/catalog";
import CatalogCard from "@/components/ui/books/CatalogCard";
import { SectionTitle } from "@/components/ui/core/SectionTitle";
import { Link } from "@/i18n/navigation";
import { getTranslations } from 'next-intl/server';
import { ScrollRevealWrapper, StaggerRevealContainer, StaggerRevealItem } from "@/components/ui/animations/ScrollRevealWrapper";

async function getRecentCatalogs() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("catalog_books")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(6);
  return (data ?? []) as CatalogBook[];
}

export default async function CatalogsSection() {
  const recentCatalogs = await getRecentCatalogs();
  const t = await getTranslations('home');

  if (recentCatalogs.length === 0) return null;

  return (
    <section className="border-t border-divider/50 overflow-hidden">
      <div className="mx-auto max-w-[1400px] px-4 py-12 sm:py-16 md:px-12 md:py-20">
        <ScrollRevealWrapper className="mb-9 flex items-end justify-between gap-5">
          <div>
            <div className="mb-2 flex items-center gap-3">
              <span className="h-[3px] w-7 rounded-full bg-gradient-to-r from-accent to-brand" aria-hidden />
              <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-accent-text">{t('bentoPhysicalLabel')}</span>
            </div>
            <SectionTitle as="h2" className="!mb-0 mt-1">{t('fromTheLibrary')}</SectionTitle>
          </div>
          <Link href="/catalogs" className="group hidden shrink-0 items-center gap-2 rounded-full border border-brand/30 bg-brand/[0.06] px-4 py-[7px] text-[13px] font-semibold text-brand transition-all duration-200 hover:border-brand hover:bg-brand hover:text-white hover:shadow-sm hover:shadow-brand/25 active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:inline-flex">
            {t('allPhysicalBooks')}
            <svg className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </ScrollRevealWrapper>
        <StaggerRevealContainer className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 sm:gap-4">
          {recentCatalogs.map((book) => (
            <StaggerRevealItem key={book.slug} className="h-full">
              <CatalogCard book={book} />
            </StaggerRevealItem>
          ))}
        </StaggerRevealContainer>
      </div>
    </section>
  );
}
