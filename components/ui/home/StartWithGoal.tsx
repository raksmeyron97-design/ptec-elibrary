// components/ui/home/StartWithGoal.tsx
// Task-first discovery: six teacher goals, each wired to a REAL destination.
// When a published learning path matches the goal it links there; otherwise it
// falls back to a curated, always-valid library route (search / listing filter)
// — never a decorative dead end.
import { Link } from "@/i18n/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import {
  BookOpen,
  GraduationCap,
  FlaskConical,
  ClipboardCheck,
  Sprout,
  Languages,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import type { LearningPathSummary } from "@/app/actions/learning-paths";

type Goal = {
  key: string; // i18n suffix: goal{Key} / goal{Key}Body
  Icon: LucideIcon;
  /** Lowercase keywords matched against published-path metadata. */
  match: string[];
  /** Curated route used when no learning path matches. */
  fallback: string;
};

const GOALS: Goal[] = [
  { key: "Lesson", Icon: BookOpen, match: ["lesson", "teach", "pedagog", "classroom"], fallback: "/search?q=lesson%20planning" },
  { key: "Thesis", Icon: GraduationCap, match: ["thesis", "dissertation", "research report"], fallback: "/theses" },
  { key: "Research", Icon: FlaskConical, match: ["research method", "action research", "research skill"], fallback: "/search?q=research%20methods" },
  { key: "Pisa", Icon: ClipboardCheck, match: ["pisa", "assessment"], fallback: "/search?q=PISA" },
  { key: "Teacher", Icon: Sprout, match: ["professional", "development", "in-service", "continuing"], fallback: "/paths" },
  { key: "Khmer", Icon: Languages, match: ["khmer"], fallback: "/books?language=Khmer" },
];

function resolveHref(goal: Goal, paths: LearningPathSummary[]): string {
  const hay = (p: LearningPathSummary) =>
    [p.title, p.title_km, p.audience, p.description].filter(Boolean).join(" ").toLowerCase();
  const hit = paths.find((p) => goal.match.some((kw) => hay(p).includes(kw)));
  return hit ? `/paths/${hit.slug}` : goal.fallback;
}

export default async function StartWithGoal({ paths }: { paths: LearningPathSummary[] }) {
  const [t, locale] = await Promise.all([getTranslations("home"), getLocale()]);
  const latinEyebrow = locale === "en" ? "uppercase tracking-[0.2em]" : "tracking-normal";

  return (
    <section className="border-b border-divider/60 bg-paper" aria-labelledby="goals-title">
      <div className="mx-auto max-w-[1400px] px-4 py-12 sm:py-14 md:px-12 md:py-16">
        {/* ── Header ── */}
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <div className="mb-2 flex items-center gap-3">
              <span className="h-[3px] w-7 rounded-full bg-gradient-to-r from-brand to-accent" aria-hidden />
              <span className={`text-[11px] font-bold text-brand ${latinEyebrow}`}>{t("goalsEyebrow")}</span>
            </div>
            <h2
              id="goals-title"
              className="font-khmer-serif font-bold leading-tight tracking-tight text-text-heading"
              style={{ fontSize: "clamp(22px, 2.4vw, 32px)" }}
            >
              {t("goalsTitle")}
            </h2>
            <p className="mt-2 text-[14.5px] leading-relaxed text-text-muted">{t("goalsBody")}</p>
          </div>
          <Link
            href="/paths"
            className="group hidden shrink-0 items-center gap-1.5 rounded-full border border-brand/30 bg-brand/[0.06] px-4 py-2 text-[13px] font-semibold text-brand transition-all hover:border-brand hover:bg-brand hover:text-brand-contrast focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:inline-flex"
          >
            {t("goalsAllPaths")}
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </div>

        {/* ── Goal cards ── */}
        <ul className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {GOALS.map((goal) => {
            const href = resolveHref(goal, paths);
            return (
              <li key={goal.key}>
                <Link
                  href={href}
                  className="group flex h-full min-h-[92px] items-start gap-4 rounded-2xl border border-divider bg-bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-[0_8px_28px_-10px_rgba(11,21,53,0.22)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:p-5"
                >
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/8 text-brand transition-colors group-hover:bg-brand group-hover:text-brand-contrast"
                    aria-hidden
                  >
                    <goal.Icon className="h-[22px] w-[22px]" strokeWidth={1.9} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="font-khmer-serif text-[15.5px] font-bold leading-snug text-text-heading transition-colors group-hover:text-brand">
                        {t(`goal${goal.key}`)}
                      </span>
                      <ArrowRight
                        className="h-3.5 w-3.5 shrink-0 text-text-muted opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100"
                        aria-hidden
                      />
                    </span>
                    <span className="mt-1 block text-[13px] leading-relaxed text-text-muted">
                      {t(`goal${goal.key}Body`)}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Mobile all-paths link */}
        <div className="mt-6 sm:hidden">
          <Link href="/paths" className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand">
            {t("goalsAllPaths")}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
