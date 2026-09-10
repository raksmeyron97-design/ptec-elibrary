// components/ui/home/StartWithGoal.tsx
// Task-first discovery: six teacher goals, each wired to a REAL destination.
//
// The resolution rules — match on a path's NAME fields only, and let no two
// goals claim the same path — live in lib/home/goals.ts, which is pure and
// unit-tested. Two production mislinks came from matching librarian prose;
// see that file's header for the full account. This component only renders.
//
// Phones get a two-column grid of icon + title. Six full-width cards with
// body copy measured 964 px on a 375 px screen — more than a whole screen of
// scrolling before the next band — for six labels a reader scans in a glance.
// The body line returns from `sm`, where there is room to read it.
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
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
import { splitDuration } from "@/lib/learning-paths/format";
import { resolveGoals, type GoalKey } from "@/lib/home/goals";
import GoalPathProgress from "./GoalPathProgress";
import { HomeSection, SectionHeader, SectionMobileLink } from "./HomeSection";

const GOAL_ICONS: Record<GoalKey, LucideIcon> = {
  Lesson: BookOpen,
  Thesis: GraduationCap,
  Research: FlaskConical,
  Pisa: ClipboardCheck,
  Teacher: Sprout,
  Khmer: Languages,
};

export default async function StartWithGoal({ paths }: { paths: LearningPathSummary[] }) {
  const [t, tPaths] = await Promise.all([getTranslations("home"), getTranslations("paths")]);

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
    <HomeSection surface="surface" labelledBy="goals-title">
      <SectionHeader
        id="goals-title"
        eyebrow={t("goalsEyebrow")}
        title={t("goalsTitle")}
        lede={t("goalsBody")}
        action={{ href: "/paths", label: t("goalsAllPaths") }}
      />

      <ul className="grid grid-cols-2 gap-3 sm:gap-3.5 lg:grid-cols-3">
        {goals.map(({ key, href, path }) => {
          const Icon = GOAL_ICONS[key];
          const duration = path ? durationLabel(path.durationMinutes) : null;
          return (
            <li key={key}>
              <Link
                href={href}
                className="group flex h-full flex-col items-start gap-3 rounded-2xl border border-divider bg-paper p-3.5 transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-[0_8px_28px_-10px_rgba(11,21,53,0.22)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:min-h-[92px] sm:flex-row sm:gap-4 sm:p-4 md:p-5"
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/8 text-brand transition-colors group-hover:bg-brand group-hover:text-brand-contrast sm:h-11 sm:w-11"
                  aria-hidden
                >
                  <Icon className="h-5 w-5 sm:h-[22px] sm:w-[22px]" strokeWidth={1.9} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="font-khmer-serif text-[14px] font-bold leading-snug text-text-heading transition-colors group-hover:text-brand sm:text-[15.5px]">
                      {t(`goal${key}`)}
                    </span>
                    <ArrowRight
                      className="hidden h-3.5 w-3.5 shrink-0 text-text-muted opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100 sm:block"
                      aria-hidden
                    />
                  </span>
                  <span className="mt-1 hidden text-[13px] leading-relaxed text-text-muted sm:block">
                    {t(`goal${key}Body`)}
                  </span>

                  {/* Shape of the path behind the goal — server-rendered, so
                      it is in the prerendered HTML for everyone. */}
                  {path && (
                    <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] font-semibold text-text-muted sm:mt-2">
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
      </ul>

      <SectionMobileLink href="/paths" label={t("goalsAllPaths")} />
    </HomeSection>
  );
}
