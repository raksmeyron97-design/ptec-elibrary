"use client";

import { useTranslations } from "next-intl";
import { ChevronRight, HardDrive } from "lucide-react";

export default function StorageBreadcrumbs({ folder, onNavigate }: { folder: string; onNavigate: (folder: string) => void }) {
  const t = useTranslations("adminStorage.breadcrumb");
  const tCat = useTranslations("adminStorage.categories");
  const segments = folder ? folder.split("/") : [];

  const crumbBtn = "rounded px-1 py-0.5 text-sm font-medium text-text-muted transition hover:bg-paper hover:text-text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/40";
  const crumbCurrent = "rounded px-1 py-0.5 text-sm font-bold text-text-heading";

  return (
    <nav aria-label={t("root")} className="flex flex-wrap items-center gap-1 text-sm">
      <button type="button" onClick={() => onNavigate("")} className={`inline-flex items-center gap-1.5 ${segments.length === 0 ? crumbCurrent : crumbBtn}`}>
        <HardDrive className="h-3.5 w-3.5" aria-hidden="true" />
        {t("root")}
      </button>
      {segments.map((seg, i) => {
        const path = segments.slice(0, i + 1).join("/");
        const isLast = i === segments.length - 1;
        const label = i === 0 && tCat.has(seg) ? tCat(seg) : seg;
        return (
          <span key={path} className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
            <button type="button" onClick={() => onNavigate(path)} disabled={isLast} className={isLast ? crumbCurrent : crumbBtn}>
              {label}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
