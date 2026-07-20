"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Megaphone, SearchX, Plus } from "lucide-react";
import { EmptyState } from "@/components/admin/kit";

export function AnnouncementEmptyState() {
  const t = useTranslations("adminAnnouncements.empty");
  return (
    <EmptyState
      icon={<Megaphone className="h-6 w-6" />}
      title={t("noneTitle")}
      description={t("noneDescription")}
      action={
        <Link href="/admin/announcements/new" className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-hover">
          <Plus className="h-4 w-4" /> {t("createFirst")}
        </Link>
      }
    />
  );
}

export function AnnouncementNoResultsState() {
  const t = useTranslations("adminAnnouncements.empty");
  return (
    <EmptyState
      icon={<SearchX className="h-6 w-6" />}
      title={t("noResultsTitle")}
      description={t("noResultsDescription")}
    />
  );
}
