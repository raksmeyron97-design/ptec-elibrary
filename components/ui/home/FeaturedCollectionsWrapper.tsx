import Link from "next/link";
import { getTranslations } from 'next-intl/server';
import { createClient } from "@/lib/supabase/server";
import { SectionTitle } from "@/components/ui/core/SectionTitle";
import FeaturedCollections from "./FeaturedCollections";

async function getDepartmentPills(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("books")
    .select("departments!inner(name)")
    .eq("is_published", true);
  const seen = new Set<string>();
  for (const row of data ?? []) {
    const dept = (row.departments as any)?.name;
    if (dept) seen.add(dept);
  }
  return [...seen].sort((a, b) => a.localeCompare(b)).slice(0, 8);
}

export default async function FeaturedCollectionsWrapper() {
  const [deptPills, t] = await Promise.all([
    getDepartmentPills(),
    getTranslations('home')
  ]);

  if (deptPills.length === 0) return null;

  return (
    <section className="mx-auto max-w-[1400px] px-4 py-10 sm:py-14 md:px-12 md:py-20">
      <div className="mb-6 sm:mb-9 flex items-end justify-between gap-5">
        <SectionTitle as="h2" className="!mb-0">{t('featuredCollections')}</SectionTitle>
        <Link href="/books" className="hidden shrink-0 items-center gap-1.5 text-sm font-semibold text-brand hover:text-gold-700 sm:inline-flex">
          {t('allDepartments')}
        </Link>
      </div>
      <FeaturedCollections departments={deptPills} limit={4} />
    </section>
  );
}
