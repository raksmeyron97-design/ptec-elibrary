// components/ui/search/CatalogSearchForm.tsx
//
// The Physical Library search box. A real GET form: once the app has hydrated,
// next/form turns the submit into a client navigation; before that — a slow
// phone whose bundle has not arrived, or a bundle that failed to load — the
// browser submits `?q=…&in=…` itself and the server renders the result. The
// previous bar was a client component whose input had no `name`, so until
// hydration it submitted nothing, and its only label was the placeholder.
//
// Not "works with JavaScript disabled": this route streams behind its
// loading.tsx, and the swap from skeleton to content is itself an inline
// script, so with scripts off no streamed public page shows its content.
//
// Filters already applied ride along as hidden inputs, so searching inside a
// category stays inside it. `page` deliberately does not: a new query starts
// at page 1.

import Form from "next/form";
import { useTranslations } from "next-intl";
import { CATALOG_SEARCH_SCOPES, type CatalogSearchScope } from "@/lib/catalogs/search-scope";

type Props = {
  /** The locale-prefixed listing path ("/catalogs" or "/km/catalogs"). */
  action: string;
  q?: string;
  scope: CatalogSearchScope;
  /** Active filters to carry into the new search. Empty values are dropped. */
  keep: Record<string, string | undefined>;
};

export default function CatalogSearchForm({ action, q, scope, keep }: Props) {
  const t = useTranslations("catalogs");
  return (
    <Form action={action} prefetch={false} role="search" aria-label={t("searchLandmark")} className="flex w-full flex-col gap-2 sm:flex-row">
      {Object.entries(keep).map(([name, value]) =>
        value ? <input key={name} type="hidden" name={name} value={value} /> : null,
      )}

      <div className="focus-shell flex min-w-0 flex-1 items-stretch overflow-hidden rounded-xl border border-divider bg-bg-surface shadow-sm">
        <label htmlFor="catalog-search-scope" className="sr-only">{t("searchIn")}</label>
        {/* text-base below sm: iOS zooms into any field under 16px on focus. */}
        {/* Keyed so a navigation that changes the query (a removed chip, Back)
            remounts the field with the new value — defaultValue is read once. */}
        <select
          key={scope}
          id="catalog-search-scope"
          name="in"
          defaultValue={scope === "all" ? "" : scope}
          className="max-w-[42%] shrink-0 cursor-pointer border-0 border-r border-divider bg-paper py-0 pl-3 pr-7 text-base text-text-body sm:max-w-none sm:text-sm"
        >
          {CATALOG_SEARCH_SCOPES.map((s) => (
            // "all" submits an empty value, so the default search keeps a clean URL.
            <option key={s} value={s === "all" ? "" : s}>{t(`scope.${s}`)}</option>
          ))}
        </select>

        <div className="relative min-w-0 flex-1">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden
          >
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" strokeLinecap="round" />
          </svg>
          <label htmlFor="catalog-search-q" className="sr-only">{t("searchLabel")}</label>
          <input
            key={q ?? ""}
            id="catalog-search-q"
            name="q"
            type="search"
            defaultValue={q ?? ""}
            autoComplete="off"
            enterKeyHint="search"
            placeholder={t("searchPlaceholder")}
            className="h-11 w-full border-0 bg-transparent pl-9 pr-3 text-base text-text-heading caret-brand placeholder:text-text-muted sm:text-sm"
          />
        </div>
      </div>

      <button
        type="submit"
        className="h-11 shrink-0 rounded-xl bg-brand px-5 text-sm font-semibold text-brand-contrast shadow-sm transition hover:bg-brand-hover active:scale-[0.98]"
      >
        {t("searchButton")}
      </button>
    </Form>
  );
}
