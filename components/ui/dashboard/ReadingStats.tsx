import { BarChart3, BookOpen, CheckCircle2, Target, Flame } from "lucide-react";
import type { ReadingStats } from "@/app/actions/reading-analytics";

export default function ReadingStats({ stats }: { stats: ReadingStats | null }) {
  if (!stats || stats.booksStarted === 0) return null;

  const monthDelta = stats.thisMonthBooks - stats.lastMonthBooks;

  return (
    <div className="rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm">
      <p className="mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-text-muted">
        <BarChart3 className="h-3.5 w-3.5" />
        My Stats
      </p>

      <div className="grid grid-cols-2 gap-2 mb-3">
        {[
          { icon: <BookOpen     className="h-3.5 w-3.5" />, value: stats.booksStarted,              label: "Started",    color: "text-sky-500"     },
          { icon: <CheckCircle2 className="h-3.5 w-3.5" />, value: stats.booksCompleted,            label: "Completed",  color: "text-emerald-600" },
          { icon: <Target       className="h-3.5 w-3.5" />, value: `${stats.completionRate}%`,      label: "Completion", color: "text-violet-600"  },
          { icon: <Flame        className="h-3.5 w-3.5" />, value: `${stats.currentStreak}d`,       label: "Streak",     color: "text-orange-500"  },
        ].map(({ icon, value, label, color }) => (
          <div key={label} className="rounded-xl border border-divider bg-paper px-3 py-2.5">
            <span className={color}>{icon}</span>
            <p className="text-[19px] font-bold text-text-heading leading-none mt-1">{value}</p>
            <p className="text-[10px] text-text-muted mt-0.5 font-medium">{label}</p>
          </div>
        ))}
      </div>

      {stats.pagesRead > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-divider bg-paper px-3 py-2 mb-2">
          <span className="text-[12px] text-text-muted">Est. pages read</span>
          <span className="text-[13px] font-bold text-text-heading">{stats.pagesRead.toLocaleString()}</span>
        </div>
      )}

      <div className="flex items-center justify-between rounded-xl border border-divider bg-paper px-3 py-2 mb-2">
        <span className="text-[12px] text-text-muted">This month</span>
        <span className="flex items-center gap-1.5 text-[13px] font-bold text-text-heading">
          {stats.thisMonthBooks} books
          {monthDelta !== 0 && (
            <span className={`text-[10px] font-semibold ${monthDelta > 0 ? "text-emerald-600" : "text-red-500"}`}>
              {monthDelta > 0 ? `+${monthDelta}` : monthDelta}
            </span>
          )}
        </span>
      </div>

      {stats.topSubjects.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted mb-1.5">Top subjects</p>
          <div className="flex flex-wrap gap-1.5">
            {stats.topSubjects.map(({ name }) => (
              <span key={name} className="rounded-full bg-brand/8 px-2.5 py-0.5 text-[11px] font-semibold text-brand">
                {name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
