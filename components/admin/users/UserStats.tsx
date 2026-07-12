import { Users, BookOpen, Shield, GraduationCap, UserPlus } from "lucide-react";
import StatCard from "@/components/admin/dashboard/StatCard";
import type { UsersSummary } from "@/lib/admin/users-shared";
import type { TrendInfo } from "@/lib/admin/dashboard";

/**
 * 6 KPI cards for the Users page. Role cards deep-link into the matching
 * filtered view. Free library → no membership/subscription cards.
 */
export default function UserStats({ summary }: { summary: UsersSummary }) {
  const { byRole } = summary;

  const trend: TrendInfo | undefined =
    summary.newLastMonth > 0
      ? {
          direction: summary.newThisMonth >= summary.newLastMonth ? "up" : "down",
          value: `${summary.newThisMonth >= summary.newLastMonth ? "+" : ""}${summary.newThisMonth - summary.newLastMonth}`,
          label: "vs last month",
        }
      : undefined;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <StatCard title="Total Users" value={summary.total} icon={Users} href="/admin/users" tone="blue" />
      <StatCard title="Readers" value={byRole.reader} icon={BookOpen} href="/admin/users?role=reader" tone="gray" />
      <StatCard title="Staff" value={byRole.staff} icon={Users} href="/admin/users?role=staff" tone="cyan" />
      <StatCard title="Librarians" value={byRole.librarian} icon={GraduationCap} href="/admin/users?role=librarian" tone="green" />
      <StatCard title="Admins" value={byRole.admin + byRole.super_admin} icon={Shield} href="/admin/users?role=admin" tone="gold" />
      <StatCard title="New This Month" value={summary.newThisMonth} icon={UserPlus} trend={trend} tone="purple" />
    </div>
  );
}
