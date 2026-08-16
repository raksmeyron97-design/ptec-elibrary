"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Pencil, Users, Clock, PenLine } from "lucide-react";

export default function RolesHeader({
  editMode,
  onEdit,
  lastUpdatedLabel,
  lastUpdatedBy,
}: {
  editMode: boolean;
  onEdit: () => void;
  lastUpdatedLabel: string | null;
  lastUpdatedBy: string | null;
}) {
  const t = useTranslations("adminRoles.header");
  return (
    <header className="mb-8 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        <nav aria-label="Breadcrumb" className="mb-3 text-xs text-text-muted">
          {t("breadcrumbRoot")} <span aria-hidden="true">/</span>{" "}
          <span className="font-semibold text-text-body">{t("breadcrumbCurrent")}</span>
        </nav>

        <h1 className="mb-1 text-2xl font-semibold tracking-tight text-text-heading">
          {t("title")}
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-text-muted">{t("description")}</p>

        {/* Provenance, as a quiet pill rather than a fourth line of prose. */}
        <p className="mt-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-paper px-2.5 py-1 text-xs text-text-muted">
            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {lastUpdatedLabel ? (
              <span>
                {t("lastUpdated")}{" "}
                <time className="font-medium text-text-body">{lastUpdatedLabel}</time>
                {lastUpdatedBy ? (
                  <>
                    {" "}
                    {t("by")}{" "}
                    <span className="font-medium text-text-body">{lastUpdatedBy}</span>
                  </>
                ) : null}
              </span>
            ) : (
              <span>{t("defaultMatrix")}</span>
            )}
          </span>
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        <Link
          href="/admin/users"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-divider bg-bg-surface px-3.5 text-sm font-semibold text-text-body transition hover:bg-paper"
        >
          <Users className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">{t("manageUserRoles")}</span>
          <span className="sm:hidden">{t("usersShort")}</span>
        </Link>

        {/* `Edit permissions` opens inline editing in the matrix; saving lives in
            EditActionBar, so this stays a mode switch rather than a save CTA. */}
        {editMode ? (
          <span className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-gold-50 px-3.5 text-sm font-bold text-gold-700 ring-1 ring-inset ring-gold-300">
            <PenLine className="h-4 w-4" aria-hidden="true" />
            {t("editing")}
          </span>
        ) : (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-hover"
          >
            <Pencil className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
            {t("editPermissions")}
          </button>
        )}
      </div>
    </header>
  );
}
