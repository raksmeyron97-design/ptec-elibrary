// components/ui/home/StartWithGoal.tsx
// Task-first discovery: six teacher goals, each wired to a REAL destination.
//
// The resolution rules — match on a path's NAME fields only, and let no two
// goals claim the same path — live in lib/home/goals.ts, which is pure and
// unit-tested. Two production mislinks came from matching librarian prose;
// see that file's header for the full account. This component only renders.
//
// Rendered as the RIGHT column of the "Start here" band (<StartHere>): one
// list card, a row per goal — icon disc, title, one-line description, the
// size of the path behind it, a chevron. Phones drop the description and the
// size: six titles are what a reader scans there.
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import {
  BookOpen,
  GraduationCap,
  FlaskConical,
  ClipboardCheck,
  Sprout,
  Languages,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import type { LearningPathSummary } from "@/app/actions/learning-paths";
import { splitDuration } from "@/lib/learning-paths/format";
import { resolveGoals, type GoalKey } from "@/lib/home/goals";
import GoalPathProgress from "./GoalPathProgress";

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
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h3 className="font-record text-[19px] font-bold leading-snug text-text-heading">{t("goalsEyebrow")}</h3>
        <Link
          href="/paths"
          className="group inline-flex shrink-0 items-center gap-1 rounded-sm text-[13px] font-semibold text-brand transition-colors hover:text-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
        >
          {t("goalsAllPaths")}
          <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </div>

      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-bg-surface shadow-sm">
        {goals.map(({ key, href, path }) => {
          const Icon = GOAL_ICONS[key];
          const duration = path ? durationLabel(path.durationMinutes) : null;
          return (
            <li key={key}>
              <Link
                href={href}
                className="group flex items-center gap-3.5 px-4 py-3 transition-colors hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring/50 sm:py-3.5"
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/8 text-brand transition-colors group-hover:bg-brand group-hover:text-brand-contrast"
                  aria-hidden
                >
                  <Icon className="h-[19px] w-[19px]" strokeWidth={1.9} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-semibold leading-snug text-text-heading transition-colors group-hover:text-brand">
                    {t(`goal${key}`)}
                  </span>
                  <span className="mt-0.5 hidden truncate text-[12.5px] text-text-muted sm:block">
                    {t(`goal${key}Body`)}
                  </span>
                  {/* Learner's own progress — fills in after hydration only
                      for signed-in, enrolled users. */}
                  {path && <GoalPathProgress slug={path.slug} />}
                </span>
                {/* Shape of the path behind the goal — server-rendered, so
                    it is in the prerendered HTML for everyone. */}
                {path && (
                  <span className="hidden shrink-0 rounded-full bg-paper px-2.5 py-0.5 text-[11.5px] font-semibold text-text-muted sm:inline-flex">
                    {tPaths("modules", { count: path.moduleCount })}
                    {duration && <> · {duration}</>}
                  </span>
                )}
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand"
                  aria-hidden
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
