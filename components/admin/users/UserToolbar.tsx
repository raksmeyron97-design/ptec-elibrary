"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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
  // Lazy initializer: read the URL param once on mount, not on every render.
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

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

  function clearSearch() {
    setQuery("");
    // WCAG 3.2 / keyboard flow: pressing "clear" must not strand focus on a
    // button that just vanished — return it to the input the user was editing.
    inputRef.current?.focus();
  }

  const secondaryBtn =
    "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-divider bg-bg-surface px-4 text-sm font-semibold text-text-body shadow-sm transition hover:bg-paper";

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      {/* Unified search shell: the container (not the inner input) owns the
          border / background / shadow and the entire focus + hover response.
          `focus-shell` (app/globals.css) suppresses the input's own fallback
          outline so focus reads as one component, never a double border. */}
      <div className="focus-shell group flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-divider bg-bg-surface px-4 py-2.5 shadow-sm transition-[color,background-color,border-color,box-shadow] duration-150 hover:border-text-muted/40 focus-within:border-brand focus-within:shadow-md focus-within:ring-2 focus-within:ring-focus-ring/25 motion-reduce:transition-none">
        <Search
          className="h-4 w-4 shrink-0 text-text-muted transition-colors duration-150 group-focus-within:text-brand motion-reduce:transition-none"
          aria-hidden="true"
        />
        <label htmlFor="user-search" className="sr-only">
          {t("searchLabel")}
        </label>
        <input
          ref={inputRef}
          id="user-search"
          // type="text" + role="searchbox" (not native type="search") matches
          // this app's search-field convention (see PostsSearch.tsx): a native
          // search input triggers Chromium's history UI, which injects a
          // caret-color style after mount and causes a hydration mismatch.
          type="text"
          role="searchbox"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          // 16px on mobile prevents iOS Safari's focus zoom; borderless +
          // transparent so only the shell renders a border. min-w-0 lets the
          // field shrink instead of overflowing at 320px.
          className="min-w-0 flex-1 border-none bg-transparent text-[16px] text-text-heading outline-none placeholder:text-text-muted sm:text-sm"
        />
        {query && (
          <button
            type="button"
            onClick={clearSearch}
            aria-label={t("clearSearch")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors duration-150 hover:bg-paper hover:text-text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring motion-reduce:transition-none"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        {/* Subtle divider so the count reads as metadata, not a second field. */}
        <span aria-hidden="true" className="h-5 w-px shrink-0 bg-divider" />
        <span
          className="shrink-0 whitespace-nowrap text-xs text-text-muted"
          aria-live="polite"
        >
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
