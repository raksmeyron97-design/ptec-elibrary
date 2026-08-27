// components/ui/dashboard/LibrarySnapshot.tsx
// SECONDARY section — 3 real, clickable counts. Replaces the old 4-tile navy
// stat bar. Completed + Lists stay reachable via DashboardTabs' own counts
// rather than duplicated here, keeping this snapshot to what fits one glance.
import { Link } from "@/i18n/navigation";
import { Bookmark, BookOpen, Download } from "lucide-react";
import { getTranslations } from "next-intl/server";

type Props = {
  saved: number;
  inProgress: number;
  downloads: number;
};

export default async function LibrarySnapshot({ saved, inProgress, downloads }: Props) {
  const t = await getTranslations("dashboard");

  const tiles = [
    { icon: Bookmark, value: saved,      label: t("statSaved"),      href: "/dashboard?tab=saved#library" },
    { icon: BookOpen,  value: inProgress, label: t("statInProgress"), href: "/dashboard?tab=reading#library" },
    { icon: Download,  value: downloads,  label: t("statDownloads"),  href: "#downloads" },
  ];

  return (
    <section aria-label={t("myLibrary")}>
      <h2 className="mb-3 text-[13px] font-bold uppercase tracking-widest text-text-muted">{t("myLibrary")}</h2>
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        {tiles.map(({ icon: Icon, value, label, href }) => (
          <Link
            key={label}
            href={href}
            className="focus-field group flex flex-col items-start gap-1.5 rounded-2xl border border-divider bg-bg-surface px-4 py-3.5 transition hover:border-brand/30 hover:bg-brand/5"
          >
            <Icon className="h-4 w-4 text-text-muted transition-colors group-hover:text-brand" aria-hidden="true" />
            <span className="text-[24px] font-bold leading-none tabular-nums text-text-heading">{value}</span>
            <span className="text-[11.5px] font-medium leading-tight text-text-muted">{label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
