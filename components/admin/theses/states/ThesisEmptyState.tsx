"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { FileText, SearchX, Plus } from "lucide-react";
import { EmptyState } from "@/components/admin/kit";
import { CanDo } from "@/components/admin/access/AdminCapabilities";

export function ThesisEmptyState() {
  const t = useTranslations("adminTheses.states");
  return (
    <EmptyState
      icon={<FileText className="h-6 w-6" />}
      title={t("emptyTitle")}
      description={t("emptyBody")}
      action={
        <CanDo action="theses.create">
          <Link
            href="/admin/theses/create"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-hover"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> {t("uploadCta")}
          </Link>
        </CanDo>
      }
    />
  );
}

export function ThesisNoResultsState() {
  const t = useTranslations("adminTheses.states");
  return (
    <EmptyState
      icon={<SearchX className="h-6 w-6" />}
      title={t("noResultsTitle")}
      description={t("noResultsBody")}
      action={
        <Link
          href="/admin/theses"
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-divider bg-bg-surface px-5 text-sm font-semibold text-text-body shadow-sm transition hover:bg-paper"
        >
          {t("clearFilters")}
        </Link>
      }
    />
  );
}
