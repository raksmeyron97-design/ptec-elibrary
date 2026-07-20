"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, X, UserPlus, Upload } from "lucide-react";
import { withUpdatedParams } from "@/lib/admin/users-url";

export default function UserToolbar({
  totalItems,
  onAddUser,
  onImport,
  exportMenu,
}: {
  totalItems: number;
  onAddUser: () => void;
  onImport: () => void;
  /** Rendered in place of the old Export button (see components/admin/ExportMenu). */
  exportMenu: ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("adminUsers.toolbar");
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  // Debounced URL push 350ms after the user stops typing.
  useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (query === current) return;
    const timer = setTimeout(() => {
      router.push(withUpdatedParams(searchParams, { q: query || null }));
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const secondaryBtn =
    "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-divider bg-bg-surface px-4 text-sm font-semibold text-text-body shadow-sm transition hover:bg-paper";

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <div className="flex flex-1 items-center gap-3 rounded-xl border border-divider bg-bg-surface px-4 py-3 shadow-sm">
        <Search className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
        <label htmlFor="user-search" className="sr-only">{t("searchLabel")}</label>
        <input
          id="user-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="flex-1 bg-transparent text-sm text-text-heading placeholder-text-muted outline-none"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label={t("clearSearch")} className="text-text-muted hover:text-text-body">
            <X className="h-4 w-4" />
          </button>
        )}
        <span className="whitespace-nowrap text-xs text-text-muted" aria-live="polite">
          {t("count", { count: totalItems })}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {exportMenu}
        <button type="button" onClick={onImport} className={secondaryBtn}>
          <Upload className="h-4 w-4" aria-hidden="true" /> <span className="hidden sm:inline">{t("import")}</span>
        </button>
        <button
          type="button"
          onClick={onAddUser}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-hover"
        >
          <UserPlus className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" /> {t("addUser")}
        </button>
      </div>
    </div>
  );
}
