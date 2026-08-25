// components/ui/home/CategoryGrid.tsx
// Homepage slot 3 — subject taxonomy tiles with live item counts. Subject
// browsing is the #2 discovery path after search, so it sits directly under
// the publications rail. Tiles land on pre-filtered results, not a menu.
//
// The subjects are the library's REAL departments (getDepartmentCountsCached),
// never a hand-written list. A static list would drift from the collection and
// send readers to empty result pages; here a subject exists on the homepage
// exactly when it has something to show, and the count is the true one.
import { Link } from "@/i18n/navigation";
import { getDepartmentCountsCached } from "@/lib/home-data";
import { getTranslations, getLocale } from "next-intl/server";
import { StaggerGrid, StaggerItem } from "@/components/ui/animations/StaggerGrid";
import {
  GraduationCap,
  FlaskConical,
  BookOpen,
  Users,
  Baby,
  Brain,
  Languages,
  Palette,
  type LucideIcon,
} from "lucide-react";

// Icon + colour per subject, assigned deterministically so a department keeps
// the same identity between renders and pages. Keyword match first (so
// "Primary Education" reliably gets the graduation cap); anything unmatched
// falls back to a stable hash of the name rather than a random pick.
const THEMES: { Icon: LucideIcon; plate: string }[] = [
  { Icon: GraduationCap, plate: "bg-brand/10 text-brand" },
  { Icon: FlaskConical, plate: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" },
  { Icon: BookOpen, plate: "bg-accent/12 text-accent-text" },
  { Icon: Users, plate: "bg-indigo-500/12 text-indigo-700 dark:text-indigo-300" },
  { Icon: Baby, plate: "bg-rose-500/12 text-rose-700 dark:text-rose-300" },
  { Icon: Brain, plate: "bg-violet-500/12 text-violet-700 dark:text-violet-300" },
  { Icon: Languages, plate: "bg-cyan-500/12 text-cyan-700 dark:text-cyan-300" },
  { Icon: Palette, plate: "bg-orange-500/12 text-orange-700 dark:text-orange-300" },
];

// Keywords are matched against the department name in either language.
// Khmer entries are matched on a prefix that is stable across the two valid
// subscript orderings ("វិទ្យាសាស្ត្រ" / "វិទ្យាសាស្រ្ត" both start "វិទ្យាសា"),
// because the database holds whichever the cataloguer typed.
const KEYWORD_THEME: { match: string[]; index: number }[] = [
  { match: ["primary", "បឋម"], index: 0 },
  { match: ["stem", "science", "math", "វិទ្យាសា", "គណិត"], index: 1 },
  { match: ["khmer", "literature", "អក្សរ"], index: 2 },
  { match: ["classroom", "management", "ថ្នាក់រៀន", "គ្រប់គ្រង"], index: 3 },
  { match: ["child", "early", "កុមារ"], index: 4 },
  { match: ["psycholog", "ចិត្តវិទ្យា"], index: 5 },
  { match: ["language", "english", "ភាសា"], index: 6 },
];

/**
 * Assign one theme per subject, in one pass, so no two cards in the grid share
 * an icon+colour. Keyword matches are honoured first; everything else takes the
 * next theme nobody claimed. Two cards wearing the same identity reads as a
 * bug, which is what a purely per-item lookup produced when a keyword missed.
 */
function assignThemes(names: string[]): { Icon: LucideIcon; plate: string }[] {
  const taken = new Set<number>();
  const chosen: (number | null)[] = names.map((name) => {
    const hay = name.toLowerCase();
    const keyed = KEYWORD_THEME.find((k) => k.match.some((m) => hay.includes(m)));
    if (keyed && !taken.has(keyed.index)) {
      taken.add(keyed.index);
      return keyed.index;
    }
    return null;
  });

  return chosen.map((index) => {
    if (index !== null) return THEMES[index];
    // Next free theme; once all are spoken for, wrap (a grid that long has
    // bigger legibility problems than a repeated icon).
    const free = THEMES.findIndex((_, i) => !taken.has(i));
    const pick = free === -1 ? taken.size % THEMES.length : free;
    taken.add(pick);
    return THEMES[pick];
  });
}

export default async function CategoryGrid() {
  const departments = await getDepartmentCountsCached();
  if (departments.length === 0) return null;

  const [t, locale] = await Promise.all([getTranslations("home"), getLocale()]);
  const latinEyebrow = locale === "en" ? "uppercase tracking-[0.2em]" : "tracking-normal";
  const themes = assignThemes(departments.map((d) => d.name));

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
        <StaggerGrid as="ul" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {departments.map(({ name, count }, i) => {
            const { Icon, plate } = themes[i];
            return (
              <StaggerItem as="li" key={name}>
                <Link
                  href={`/books?dept=${encodeURIComponent(name)}`}
                  aria-label={t("categoriesCardLabel", { subject: name })}
                  className="group flex min-h-[92px] items-center gap-4 rounded-xl border border-divider bg-bg-surface px-5 py-4 transition-all duration-200 hover:-translate-y-1 hover:border-brand/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
                >
                  <span
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105 ${plate}`}
                    aria-hidden
                  >
                    <Icon className="h-6 w-6" strokeWidth={1.9} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-khmer-serif text-[15px] font-bold leading-snug text-text-heading line-clamp-2 transition-colors group-hover:text-brand">
                      {name}
                    </span>
                    <span className="mt-0.5 block text-[12.5px] font-medium text-text-muted">
                      {t("categoriesItemCount", { count })}
                    </span>
                  </span>
                  <svg
                    className="h-4 w-4 shrink-0 text-text-muted transition-all group-hover:translate-x-0.5 group-hover:text-brand"
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}
                    strokeLinecap="round" strokeLinejoin="round" aria-hidden
                  >
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </Link>
              </StaggerItem>
            );
          })}

          {/* All-subjects tile */}
          <StaggerItem as="li">
            <Link
              href="/books"
              className="group flex min-h-[92px] items-center justify-between gap-3 rounded-xl border border-brand/25 bg-brand/5 px-5 py-4 transition-all duration-200 hover:-translate-y-1 hover:border-brand hover:bg-brand/10 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
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
          </StaggerItem>
        </StaggerGrid>
      </div>
    </section>
  );
}
