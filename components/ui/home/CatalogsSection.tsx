import { createServiceClient } from "@/lib/supabase/server";
import type { CatalogBook } from "@/lib/catalog";
import CatalogCard from "@/components/ui/books/CatalogCard";
import { SectionTitle } from "@/components/ui/core/SectionTitle";
import Link from "next/link";
import { getTranslations } from 'next-intl/server';

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
    <section className="border-t border-divider/50">
    <div className="mx-auto max-w-[1400px] px-4 py-12 sm:py-16 md:px-12 md:py-20">
      <div className="mb-9 flex items-end justify-between gap-5">
        <SectionTitle as="h2" className="!mb-0">{t('fromTheLibrary')}</SectionTitle>
        <Link href="/catalogs" className="hidden shrink-0 items-center gap-1.5 text-sm font-semibold text-brand hover:text-gold-700 sm:inline-flex">
          {t('allPhysicalBooks')}
        </Link>
      </div>
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 sm:gap-4">
        {recentCatalogs.map((book) => (
          <CatalogCard key={book.slug} book={book} />
        ))}
      </div>
    </div>
    </section>
  );
}
