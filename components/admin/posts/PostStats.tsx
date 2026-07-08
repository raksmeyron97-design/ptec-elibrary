import { FileText, CheckCircle2, PenLine, CalendarClock, Eye } from "lucide-react";
import StatCard from "@/components/admin/dashboard/StatCard";
import type { PostsSummary } from "@/lib/admin/posts-shared";

/**
 * 5 KPI cards for the Manage Posts page. Reuses the existing dashboard
 * StatCard (title/value/description/icon/href/tone) instead of a bespoke
 * PostStatCard — the props already match what the spec asked for.
 */
export default function PostStats({ summary }: { summary: PostsSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <StatCard
        title="Total Posts"
        value={summary.total}
        icon={FileText}
        href="/admin/posts"
        tone="blue"
      />
      <StatCard
        title="Live"
        value={summary.live}
        icon={CheckCircle2}
        href="/admin/posts?status=published"
        tone="green"
      />
      <StatCard
        title="Drafts"
        value={summary.drafts}
        icon={PenLine}
        href="/admin/posts?status=draft"
        tone="orange"
      />
      <StatCard
        title="Scheduled"
        value={summary.scheduled}
        icon={CalendarClock}
        href="/admin/posts?status=scheduled"
        tone="purple"
      />
      <StatCard
        title="Total Views"
        value={summary.totalViews.toLocaleString()}
        icon={Eye}
        tone="cyan"
      />
    </div>
  );
}
