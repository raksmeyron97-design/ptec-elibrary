import { Users, BookOpen, Shield, GraduationCap, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import StatCard from "@/components/admin/dashboard/StatCard";
import type { UsersSummary } from "@/lib/admin/users-shared";
import type { TrendInfo } from "@/lib/admin/dashboard";

/**
 * 6 KPI cards for the Users page. Role cards deep-link into the matching
 * filtered view. Free library → no membership/subscription cards.
 */
export default function UserStats({ summary }: { summary: UsersSummary }) {
  const t = useTranslations("adminUsers.stats");
  const { byRole } = summary;

  const trend: TrendInfo | undefined =
    summary.newLastMonth > 0
      ? {
          direction: summary.newThisMonth >= summary.newLastMonth ? "up" : "down",
          value: `${summary.newThisMonth >= summary.newLastMonth ? "+" : ""}${summary.newThisMonth - summary.newLastMonth}`,
          label: t("vsLastMonth"),
          mode: "absolute",
        }
      : undefined;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <StatCard title={t("total")} value={summary.total} icon={Users} href="/admin/users" tone="blue" />
      <StatCard title={t("readers")} value={byRole.reader} icon={BookOpen} href="/admin/users?role=reader" tone="gray" />
      <StatCard title={t("staff")} value={byRole.staff} icon={Users} href="/admin/users?role=staff" tone="cyan" />
      <StatCard title={t("librarians")} value={byRole.librarian} icon={GraduationCap} href="/admin/users?role=librarian" tone="green" />
      <StatCard title={t("admins")} value={byRole.admin + byRole.super_admin} icon={Shield} href="/admin/users?role=admin" tone="gold" />
      <StatCard title={t("newThisMonth")} value={summary.newThisMonth} icon={UserPlus} trend={trend} tone="purple" />
    </div>
  );
}
