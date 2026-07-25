import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus, ExternalLink, GraduationCap, CheckCircle2, FileEdit, Archive, Users, Trophy } from "lucide-react";
import { adminGetPaths, adminGetPathStats } from "@/app/actions/learning-paths";
import { PageHeader } from "@/components/admin/kit";
import PathsAdminClient from "./PathsAdminClient";

export const dynamic = "force-dynamic";

export default async function AdminPathsPage() {
  const [t, paths, stats] = await Promise.all([
    getTranslations("adminPaths"),
    adminGetPaths(),
    adminGetPathStats(),
  ]);

  const metrics = [
    { key: "total", label: t("metrics.total"), value: stats.total, icon: GraduationCap, tone: "text-brand" },
    { key: "published", label: t("metrics.published"), value: stats.published, icon: CheckCircle2, tone: "text-emerald-600" },
    { key: "drafts", label: t("metrics.drafts"), value: stats.draft + stats.scheduled, icon: FileEdit, tone: "text-amber-600" },
    { key: "archived", label: t("metrics.archived"), value: stats.archived, icon: Archive, tone: "text-text-muted" },
    { key: "learners", label: t("metrics.activeLearners"), value: stats.activeLearners, icon: Users, tone: "text-brand" },
  ];

  return (
    <div className="mx-auto max-w-[1280px]">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/paths"
              target="_blank"
              className="inline-flex items-center gap-1.5 rounded-xl border border-divider px-3.5 py-2.5 text-sm font-semibold text-text-muted transition hover:border-brand/40 hover:text-brand"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" /> {t("viewPublic")}
            </Link>
            <Link
              href="/admin/paths/create"
              className="btn-brand-gradient inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> {t("newPath")}
            </Link>
          </div>
        }
      />

      {/* ── Summary metrics (data-backed) ── */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {metrics.map((m) => (
          <div key={m.key} className="rounded-xl border border-divider bg-bg-surface p-4">
            <div className="flex items-center gap-2 text-[12px] font-semibold text-text-muted">
              <m.icon className={`h-4 w-4 ${m.tone}`} aria-hidden="true" />
              {m.label}
            </div>
            <p className="mt-1.5 text-[26px] font-bold text-text-heading tabular-nums">{m.value}</p>
          </div>
        ))}
      </div>

      {stats.mostStarted && (
        <div className="mb-6 inline-flex items-center gap-2 rounded-xl border border-divider bg-bg-surface px-4 py-2.5 text-[13px]">
          <Trophy className="h-4 w-4 text-gold-500" aria-hidden="true" />
          <span className="font-semibold text-text-muted">{t("metrics.mostStarted")}:</span>
          <Link href={`/paths/${stats.mostStarted.slug}`} target="_blank" className="font-bold text-text-heading hover:text-brand">
            {stats.mostStarted.title}
          </Link>
          <span className="text-text-muted">({t("metrics.learnersCount", { count: stats.mostStarted.count })})</span>
        </div>
      )}

      <PathsAdminClient paths={paths} />
    </div>
  );
}
