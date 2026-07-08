import Link from "next/link";
import {
  Activity, Upload, Pencil, FileText, UserPlus, Download, Shield, type LucideIcon,
} from "lucide-react";
import type { ActivityItem } from "@/lib/admin/dashboard";

const TYPE_META: Record<ActivityItem["type"], { icon: LucideIcon; chip: string }> = {
  book_uploaded:   { icon: Upload,   chip: "bg-indigo-50 text-indigo-600" },
  book_edited:     { icon: Pencil,   chip: "bg-blue-50 text-blue-600" },
  post_created:    { icon: FileText, chip: "bg-emerald-50 text-emerald-600" },
  user_registered: { icon: UserPlus, chip: "bg-violet-50 text-violet-600" },
  book_downloaded: { icon: Download, chip: "bg-amber-50 text-amber-600" },
  admin_action:    { icon: Shield,   chip: "bg-slate-100 text-slate-600" },
};

function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Merged feed of admin actions, uploads, downloads, and new registrations. */
export default function RecentActivityFeed({ items }: { items: ActivityItem[] }) {
  return (
    <section
      className="rounded-2xl bg-bg-surface p-5 shadow-sm sm:p-6"
      style={{ border: "1px solid var(--ptec-divider)" }}
      aria-label="Recent activity"
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ background: "#EEF2FF", border: "1px solid #C7D2FE" }}
            aria-hidden="true"
          >
            <Activity className="h-4 w-4 text-indigo-600" />
          </span>
          <div>
            <h2 className="text-base font-bold text-text-heading">Recent activity</h2>
            <p className="text-xs text-text-muted">Latest admin actions, downloads, and sign-ups</p>
          </div>
        </div>
        <Link
          href="/admin/logs"
          className="shrink-0 text-xs font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          View all logs →
        </Link>
      </div>

      {items.length > 0 ? (
        <ul className="divide-y divide-slate-100">
          {items.map((item) => {
            const meta = TYPE_META[item.type];
            const Icon = meta.icon;
            const line = (
              <>
                <span className="font-semibold">{item.actor ?? "Someone"}</span>{" "}
                {item.title}
                {item.description && (
                  <>
                    {": "}
                    <span className="text-text-muted" lang="und">&ldquo;{item.description}&rdquo;</span>
                  </>
                )}
              </>
            );
            return (
              <li key={item.id} className="flex items-center gap-3 py-2.5">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${meta.chip}`}
                  aria-hidden="true"
                >
                  <Icon className="h-4 w-4" />
                </span>
                <p className="min-w-0 flex-1 text-sm leading-relaxed text-text-body">
                  {item.href ? (
                    <Link
                      href={item.href}
                      className="block truncate transition-colors hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                      title={item.description ?? undefined}
                    >
                      {line}
                    </Link>
                  ) : (
                    <span className="block truncate" title={item.description ?? undefined}>{line}</span>
                  )}
                </p>
                <time
                  className="shrink-0 text-xs tabular-nums text-text-muted"
                  dateTime={item.createdAt}
                >
                  {relativeTime(item.createdAt)}
                </time>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-6 text-center text-sm text-text-muted">No activity recorded yet.</p>
      )}
    </section>
  );
}
