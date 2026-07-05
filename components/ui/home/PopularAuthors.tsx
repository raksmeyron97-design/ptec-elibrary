// components/ui/home/PopularAuthors.tsx
// Compact wayfinding rail: the five most-published authors, linking into the
// unified library search (which indexes author names across books, theses,
// catalog, and publications). Initials avatars — no author photos exist, and
// empty photo circles read as broken.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTranslations, getLocale } from "next-intl/server";

async function getPopularAuthors(): Promise<{ name: string; count: number }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("books")
    .select("authors!inner(name)")
    .eq("is_published", true);

  if (error) {
    console.error("[PopularAuthors]", error.message);
    return [];
  }

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const name = (row.authors as unknown as { name: string } | null)?.name?.trim();
    if (name && name.toLowerCase() !== "unknown") {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

// Deterministic brand-family hue from the author name; fixed saturation and
// lightness keep every generated avatar readable against white text.
function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  const hue = 200 + (Math.abs(hash) % 80); // 200–280: blue → indigo band
  return `hsl(${hue} 55% 38%)`;
}

function initialsOf(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => [...p][0] ?? "")
    .join("");
}

export default async function PopularAuthors() {
  const authors = await getPopularAuthors();
  if (authors.length === 0) return null;

  const [t, locale] = await Promise.all([getTranslations("home"), getLocale()]);
  const latinEyebrow = locale === "en" ? "uppercase tracking-[0.2em]" : "tracking-normal";

  return (
    <section className="border-b border-divider/60 bg-bg-surface" aria-labelledby="popular-authors-title">
      <div className="mx-auto max-w-[1400px] px-4 py-10 sm:py-12 md:px-12">
        {/* ── Header (compact — this is a wayfinding row, not a directory) ── */}
        <div className="mb-6">
          <div className="mb-2 flex items-center gap-3">
            <span className="h-[3px] w-7 rounded-full bg-gradient-to-r from-accent to-brand" aria-hidden />
            <span className={`text-[11px] font-bold text-accent-text ${latinEyebrow}`}>
              {t("authorsEyebrow")}
            </span>
          </div>
          <h2
            id="popular-authors-title"
            className="font-khmer-serif font-bold leading-tight tracking-tight text-text-heading"
            style={{ fontSize: "clamp(20px, 2vw, 26px)" }}
          >
            {t("authorsTitle")}
          </h2>
        </div>

        {/* ── Chips ── */}
        <ul className="flex gap-3 overflow-x-auto pb-1 scrollbar-none sm:grid sm:grid-cols-3 lg:grid-cols-5 sm:overflow-visible">
          {authors.map(({ name, count }) => (
            <li key={name} className="min-w-[200px] shrink-0 sm:min-w-0">
              <Link
                href={`/search?q=${encodeURIComponent(name)}`}
                aria-label={t("authorsWorksLabel", { name, count })}
                className="group flex items-center gap-3 rounded-xl border border-divider bg-paper px-3.5 py-3 transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
                  style={{ background: avatarColor(name) }}
                  aria-hidden
                >
                  {initialsOf(name)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-bold text-text-heading transition-colors group-hover:text-brand">
                    {name}
                  </span>
                  <span className="block text-[11.5px] font-medium text-text-muted">
                    {t("authorsWorks", { count })}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
