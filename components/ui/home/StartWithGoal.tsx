// components/ui/home/StartWithGoal.tsx
// Task-first discovery: six teacher goals, each wired to a REAL destination.
//
// The resolution rules — match on a path's NAME fields only, and let no two
// goals claim the same path — live in lib/home/goals.ts, which is pure and
// unit-tested. Two production mislinks came from matching librarian prose;
// see that file's header for the full account. This component only renders.
import { Link } from "@/i18n/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import {
  BookOpen,
  GraduationCap,
  FlaskConical,
  ClipboardCheck,
  Sprout,
  Languages,
  Compass,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import type { LearningPathSummary } from "@/app/actions/learning-paths";
import { splitDuration } from "@/lib/learning-paths/format";
import { resolveGoals, type GoalKey } from "@/lib/home/goals";
import SectionHeader, { SECTION_SHELL } from "./SectionHeader";
import GoalPathProgress from "./GoalPathProgress";

const GOAL_ICONS: Record<GoalKey, LucideIcon> = {
  Lesson: BookOpen,
  Thesis: GraduationCap,
  Research: FlaskConical,
  Pisa: ClipboardCheck,
  Teacher: Sprout,
  Khmer: Languages,
};

export default async function StartWithGoal({
  paths,
  surfaceClass,
}: {
  paths: LearningPathSummary[];
  surfaceClass: string;
}) {
  const [t, tPaths, locale] = await Promise.all([
    getTranslations("home"),
    getTranslations("paths"),
    getLocale(),
  ]);

  /** "2h 30m" / "45m" — same vocabulary the /paths cards use. */
  const durationLabel = (minutes: number | null): string | null => {
    const split = splitDuration(minutes);
    if (!split) return null;
    const { hours, minutes: mins } = split;
    if (hours && mins) return tPaths("durationHm", { h: hours, m: mins });
    if (hours) return tPaths("durationH", { h: hours });
    return tPaths("durationM", { m: mins });
  };

  const goals = resolveGoals(paths);

  return (
    <section className={surfaceClass} aria-labelledby="goals-title">
      <div className={SECTION_SHELL}>
        <SectionHeader
          id="goals-title"
          eyebrow={t("goalsEyebrow")}
          title={t("goalsTitle")}
          body={t("goalsBody")}
          locale={locale}
          action={
            <Link
              href="/paths"
              className="group hidden shrink-0 items-center gap-1.5 rounded-full border border-brand/30 bg-brand/[0.06] px-4 py-2 text-[13px] font-semibold text-brand transition-all hover:border-brand hover:bg-brand hover:text-brand-contrast focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:inline-flex"
            >
              {t("goalsAllPaths")}
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
            </Link>
          }
        />

        {/* ── Goal cards ── */}
        <ul className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map(({ key, href, path }) => {
            const Icon = GOAL_ICONS[key];
            const duration = path ? durationLabel(path.durationMinutes) : null;
            return (
              <li key={key}>
                <Link
                  href={href}
                  className="group flex h-full min-h-[92px] items-start gap-4 rounded-2xl border border-divider bg-bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-[0_8px_28px_-10px_rgba(11,21,53,0.22)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:p-5"
                >
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/8 text-brand transition-colors group-hover:bg-brand group-hover:text-brand-contrast"
                    aria-hidden
                  >
                    <Icon className="h-[22px] w-[22px]" strokeWidth={1.9} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="font-khmer-serif text-[15.5px] font-bold leading-snug text-text-heading transition-colors group-hover:text-brand">
                        {t(`goal${key}`)}
                      </span>
                      <ArrowRight
                        className="h-3.5 w-3.5 shrink-0 text-text-muted opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100"
                        aria-hidden
                      />
                    </span>
                    <span className="mt-1 block text-[13px] leading-relaxed text-text-muted">
                      {t(`goal${key}Body`)}
                    </span>

                    {/* Shape of the path behind the goal — server-rendered, so
                        it is in the prerendered HTML for everyone. */}
                    {path && (
                      <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] font-semibold text-text-muted">
                        <span>{tPaths("modules", { count: path.moduleCount })}</span>
                        {duration && (
                          <>
                            <span aria-hidden>·</span>
                            <span>{duration}</span>
                          </>
                        )}
                      </span>
                    )}

                    {/* Learner's own progress — fills in after hydration only
                        for signed-in, enrolled users. */}
                    {path && <GoalPathProgress slug={path.slug} />}
                  </span>
                </Link>
              </li>
            );
          })}

          {/* Seventh tile, deliberately not a goal. Every card above assumes
              the reader already knows what they came for; a member of the
              public who has never heard of PTEC does not, and the goal grid
              gave them nothing to click. Styled as an invitation rather than a
              peer so it does not compete with the six real tasks. */}
          <li>
            <Link
              href="/books"
              className="group flex h-full min-h-[92px] items-start gap-4 rounded-2xl border border-dashed border-brand/35 bg-brand/[0.04] p-4 transition-all hover:-translate-y-0.5 hover:border-brand hover:bg-brand/[0.08] motion-reduce:transition-none motion-reduce:hover:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:p-5"
            >
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand transition-colors group-hover:bg-brand group-hover:text-brand-contrast"
                aria-hidden
              >
                <Compass className="h-[22px] w-[22px]" strokeWidth={1.9} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="font-khmer-serif text-[15.5px] font-bold leading-snug text-text-heading transition-colors group-hover:text-brand">
                    {t("goalBrowsing")}
                  </span>
                  <ArrowRight
                    className="h-3.5 w-3.5 shrink-0 text-text-muted opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100 motion-reduce:transition-none"
                    aria-hidden
                  />
                </span>
                <span className="mt-1 block text-[13px] leading-relaxed text-text-muted">
                  {t("goalBrowsingBody")}
                </span>
              </span>
            </Link>
          </li>
        </ul>

        {/* Mobile all-paths link */}
        <div className="mt-6 sm:hidden">
          <Link href="/paths" className="inline-flex min-h-[44px] items-center gap-1.5 text-[14px] font-semibold text-brand">
            {t("goalsAllPaths")}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
