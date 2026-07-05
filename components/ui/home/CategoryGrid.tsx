// components/ui/home/CategoryGrid.tsx
// Homepage slot 3 — subject taxonomy tiles with live item counts. Subject
// browsing is the #2 discovery path after search, so it sits directly under
// the publications rail. Tiles land on pre-filtered results, not a menu.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTranslations, getLocale } from "next-intl/server";

async function getDepartmentCounts(): Promise<{ name: string; count: number }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("books")
    .select("departments!inner(name)")
    .eq("is_published", true);

  if (error) {
    console.error("[CategoryGrid]", error.message);
    return [];
  }

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const name = (row.departments as unknown as { name: string } | null)?.name;
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 7);
}

function BookOpenIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

export default async function CategoryGrid() {
  const departments = await getDepartmentCounts();
  if (departments.length === 0) return null;

  const [t, locale] = await Promise.all([getTranslations("home"), getLocale()]);
  const latinEyebrow = locale === "en" ? "uppercase tracking-[0.2em]" : "tracking-normal";

  return (
    <section className="border-b border-divider/60 bg-paper" aria-labelledby="category-grid-title">
      <div className="mx-auto max-w-[1400px] px-4 py-12 sm:py-14 md:px-12 md:py-16">
        {/* ── Header ── */}
        <div className="mb-8">
          <div className="mb-2 flex items-center gap-3">
            <span className="h-[3px] w-7 rounded-full bg-gradient-to-r from-accent to-brand" aria-hidden />
            <span className={`text-[11px] font-bold text-accent-text ${latinEyebrow}`}>
              {t("categoriesEyebrow")}
            </span>
          </div>
          <h2
            id="category-grid-title"
            className="font-khmer-serif font-bold leading-tight tracking-tight text-text-heading"
            style={{ fontSize: "clamp(22px, 2.4vw, 32px)" }}
          >
            {t("categoriesSectionTitle")}
          </h2>
        </div>

        {/* ── Tiles ── */}
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {departments.map(({ name, count }) => (
            <li key={name}>
              <Link
                href={`/books?dept=${encodeURIComponent(name)}`}
                className="group flex min-h-[72px] items-center gap-3.5 rounded-xl border border-divider bg-bg-surface px-4 py-3.5 transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/8 text-brand transition-colors group-hover:bg-brand group-hover:text-brand-contrast"
                  aria-hidden
                >
                  <BookOpenIcon />
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-bold leading-snug text-text-heading line-clamp-2 group-hover:text-brand transition-colors">
                    {name}
                  </span>
                  <span className="mt-0.5 block text-[12px] font-medium text-text-muted">
                    {t("categoriesItemCount", { count })}
                  </span>
                </span>
              </Link>
            </li>
          ))}

          {/* All-subjects tile */}
          <li>
            <Link
              href="/books"
              className="group flex min-h-[72px] items-center justify-between gap-3 rounded-xl border border-brand/25 bg-brand/5 px-4 py-3.5 transition-all hover:-translate-y-0.5 hover:border-brand hover:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
            >
              <span className="text-[14px] font-bold text-brand">
                {t("categoriesAll")}
              </span>
              <svg
                className="h-4 w-4 shrink-0 text-brand transition-transform group-hover:translate-x-0.5"
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}
                strokeLinecap="round" strokeLinejoin="round" aria-hidden
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
          </li>
        </ul>
      </div>
    </section>
  );
}
