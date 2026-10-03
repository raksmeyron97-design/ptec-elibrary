"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Link, getPathname, useRouter } from "@/i18n/navigation";
import { useTranslations, useLocale } from "next-intl";
import { pushRecentSearch, readRecent, RECENT_KEY } from "./SearchSuggestions";

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  trending?: string[];
  prompts?: string[];
  askLabel: string;
  /** Tooltip on the `/` key chip (desktop only — phones have no keyboard). */
  hintKeyboard: string;
  /** Centre the chip rows under the bar from md (the centred hero). */
  centered?: boolean;
};

// ─── SparkleIcon (shared with other components) ───────────────────────────────

export function SparkleIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l1.8 5.4L19.2 9l-5.4 1.8L12 16.2l-1.8-5.4L4.8 9l5.4-1.8L12 2z" opacity={0.85} />
      <path d="M19 14l.9 2.7 2.7.9-2.7.9-.9 2.7-.9-2.7-2.7-.9 2.7-.9L19 14z" opacity={0.55} />
    </svg>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PLACEHOLDER_INTERVAL = 3600;

/**
 * Scope options for the hero search.
 *
 * The ids are the SAME values /search reads from `?type=` (its TAB_IDS), so
 * picking a scope here lands on the results page with that tab already active
 * — no translation layer, and no second vocabulary to keep in sync. Labels
 * reuse the `search.tab*` strings for the same reason: the chooser and the
 * tab it selects can never disagree.
 *
 * `all` is represented by omitting the param, matching how the results page
 * itself clears it (`if (type === "all") next.delete("type")`).
 */
const SCOPES = [
  { id: "all", labelKey: "tabAll" },
  { id: "book", labelKey: "tabBooks" },
  { id: "research", labelKey: "tabTheses" },
  { id: "publication", labelKey: "tabPublications" },
  { id: "learning_path", labelKey: "tabLearningPaths" },
  // The Physical library (Phase 9.2): `type=catalog` is what /search reads
  // as that scope, so the chooser needs no second vocabulary.
  { id: "catalog", labelKey: "tabCatalog" },
] as const;

type ScopeId = (typeof SCOPES)[number]["id"];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AskLibraryHero({ trending = [], prompts = [], askLabel, hintKeyboard, centered = false }: Props) {
  const router = useRouter();
  const t = useTranslations("home");
  const tSearch = useTranslations("search");
  const locale = useLocale();
  const inputRef = useRef<HTMLInputElement>(null);

  // Input state
  const [scope, setScope] = useState<ScopeId>("all");
  const [value, setValue] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [promptIdx, setPromptIdx] = useState(0);
  const [promptVisible, setPromptVisible] = useState(true);

  // Load recent searches
  useEffect(() => {
    const items = readRecent().slice(0, 3);
    const id = setTimeout(() => setRecent(items), 0);
    return () => clearTimeout(id);
  }, []);

  // Rotating placeholder
  useEffect(() => {
    const mq = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!mq || mq.matches || prompts.length < 2) return;
    const id = setInterval(() => {
      setPromptVisible(false);
      setTimeout(() => {
        setPromptIdx((i) => (i + 1) % prompts.length);
        setPromptVisible(true);
      }, 250);
    }, PLACEHOLDER_INTERVAL);
    return () => clearInterval(id);
  }, [prompts.length]);

  // Keyboard shortcut: `/` to focus
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA" &&
        // A focused <select> uses printable keys for typeahead — stealing "/"
        // there would break keyboard selection of the scope.
        document.activeElement?.tagName !== "SELECT"
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Handlers ───────────────────────────────────────────────────────────────
  // Search-first: submit to the unified library search (books + theses +
  // publications + physical catalog) — no AI round-trip.

  const searchHref = useCallback(
    (term: string) => {
      const qs = new URLSearchParams({ q: term });
      if (scope !== "all") qs.set("type", scope);
      return `/search?${qs.toString()}`;
    },
    [scope]
  );

  const submit = useCallback(
    (term: string) => {
      const clean = term.trim();
      if (!clean) return;
      pushRecentSearch(clean);
      router.push(searchHref(clean));
    },
    [router, searchHref]
  );

  const clearRecent = () => {
    try { localStorage.removeItem(RECENT_KEY); } catch { /* noop */ }
    setRecent([]);
  };

  const trendingLabel = locale === "en" ? "uppercase tracking-[0.16em]" : "tracking-normal";

  // Label of the currently selected scope, for the chips' accessible names —
  // "Search for X in Theses" is only true if it names the scope actually in
  // effect, so it reads from `scope` rather than being hard-coded.
  const scopeLabelKey = (SCOPES.find((s) => s.id === scope) ?? SCOPES[0]).labelKey;

  // ── Render ─────────────────────────────────────────────────────────────────

  // Plate chip — the hero's one chip style (recent and trending alike).
  const rowAlign = centered ? "md:justify-center" : "";
  const chipClass =
    "inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/18 bg-white/8 px-3 py-1 text-[13px] font-medium text-blue-100 transition-colors hover:bg-white/14 hover:text-white active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400";

  return (
    <div className="w-full">

      {/* ── Search bar ─────────────────────────────────────────────────────
          A real GET form to /search: `q` and `type` are the names the results
          page reads, so with no JavaScript the browser builds the same URL the
          script does (`type=all` parses as "all"). With JavaScript the submit
          handler takes over to record the recent search and drop `type=all`. */}
      <form
        role="search"
        action={getPathname({ href: "/search", locale })}
        method="get"
        className="relative rounded-xl shadow-[0_12px_32px_rgba(11,21,48,.10),0_0_0_1px_rgba(255,255,255,.18)]"
        onSubmit={(e) => {
          e.preventDefault();
          submit(value);
        }}
      >
        {/* One indicator for the whole bar: .focus-shell lights the shell when
            the scope or the field has keyboard focus, as a 3px gold ring, and
            suppresses the inner controls' own outlines. The submit button is
            outside that trigger and keeps the global focus outline. */}
        <div className="focus-shell [--focus-border-color:var(--ptec-accent)] [--focus-ring-shadow:0_0_0_3px_var(--ptec-accent)] relative flex h-16 items-center gap-2 rounded-xl border border-transparent bg-bg-surface p-1.5">

          {/* Scope chooser — narrows the search to one collection. */}
          <div className="relative shrink-0">
            <label htmlFor="hero-search-scope" className="sr-only">
              {t("searchScopeLabel")}
            </label>
            <select
              id="hero-search-scope"
              name="type"
              value={scope}
              onChange={(e) => setScope(e.target.value as ScopeId)}
              // Explicit width, deliberately. A bare <select> sizes itself to
              // its LONGEST option ("Learning Paths"), which ate ~40% of the
              // bar on a 393px phone and pushed the placeholder out of it.
              // Fixed width + ellipsis keeps the input usable; the full label
              // is always visible once the menu is open.
              // 16px below sm: iOS Safari zooms the page into a select, like
              // an input, when its text is under 16px.
              className="h-[52px] w-[92px] cursor-pointer appearance-none overflow-hidden text-ellipsis whitespace-nowrap rounded-lg border-0 bg-paper py-0 pl-3 pr-7 text-base font-semibold text-text-heading outline-none transition-colors sm:w-[132px] sm:text-[13px]"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748B' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 0.5rem center",
                backgroundSize: "0.85rem",
              }}
            >
              {SCOPES.map((s) => (
                <option key={s.id} value={s.id} className="bg-bg-surface text-text-heading">
                  {tSearch(s.labelKey)}
                </option>
              ))}
            </select>
          </div>

          {/* Input + ghost placeholder */}
          <div className="relative min-w-0 flex-1">
            <input
              ref={inputRef}
              type="search"
              name="q"
              aria-label={askLabel}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              // 16px below sm, or iOS zooms the page in on focus.
              className="h-[52px] w-full bg-transparent text-base text-text-heading outline-none placeholder:text-transparent [&::-webkit-search-cancel-button]:appearance-none sm:text-[15px]"
            />
            {!value && (
              // `truncate`: the prompts rotate and are translated, so any of
              // them can outgrow the field — Khmer runs longer than English.
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 flex items-center truncate text-base text-text-muted transition-opacity duration-[250ms] sm:text-[15px]"
                style={{ opacity: promptVisible ? 1 : 0 }}
              >
                <span className="truncate">{prompts[promptIdx] ?? ""}</span>
              </span>
            )}
          </div>

          {/* `/` shortcut chip — desktop only, explained on hover. */}
          <kbd
            title={hintKeyboard}
            className="hidden shrink-0 select-none items-center rounded border border-border bg-paper px-1.5 py-0.5 font-mono text-[11px] text-text-muted lg:flex"
          >
            /
          </kbd>

          {/* Search — the one gold control on the page. Icon-only below sm (a
              48px square): the word stays as the button's name (sr-only), so
              assistive tech hears the same thing at every width. */}
          <button
            type="submit"
            className="flex h-[52px] w-12 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-accent text-[14px] font-bold text-blue-950 transition-[filter,transform] hover:brightness-105 active:translate-y-px sm:w-auto sm:px-5"
          >
            <svg className="h-5 w-5 sm:hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <span className="max-sm:sr-only">{askLabel}</span>
          </button>
        </div>
      </form>

      {/* ── Chips ── */}
      <div className="mt-4 space-y-3">
          {/* Recent searches */}
          {recent.length > 0 && (
            <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${rowAlign}`}>
              <span className={`text-[11px] font-bold text-blue-100 ${trendingLabel}`}>
                {t("recent")}
              </span>
              {recent.map((term) => (
                <button
                  key={`r-${term}`}
                  type="button"
                  onClick={() => submit(term)}
                  aria-label={t("trendingPillLabel", { term, scope: tSearch(scopeLabelKey) })}
                  className={`max-w-[240px] truncate ${chipClass}`}
                >
                  <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 8v4l3 3M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.36 2.64L3 8" />
                    <path d="M3 4v4h4" />
                  </svg>
                  <span className="truncate">{term}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={clearRecent}
                className="cursor-pointer text-[11px] font-semibold text-blue-100 underline-offset-2 hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40"
              >
                {t("clear")}
              </button>
            </div>
          )}

          {/* Trending chips, then Advanced search at the end of the row.
              Phones scroll the chips sideways in one row instead of wrapping
              them into three, and hide the link. */}
          <div className={`-mx-4 flex items-center gap-x-3 gap-y-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden ${rowAlign}`}>
            {trending.length > 0 && (
              <span className={`shrink-0 text-[11px] font-bold text-gold-400 ${trendingLabel}`}>
                {t("trending")}
              </span>
            )}
            {trending.slice(0, 5).map((term) => (
              <Link
                key={`t-${term}`}
                // Honours the chosen scope, like the input and the recent
                // chips — a chip that ignored it would silently widen the
                // search the user just narrowed.
                href={searchHref(term)}
                // Five chips, five DIFFERENT search results pages, all
                // prefetched the moment the hero scrolls into view: MEASURED
                // 39.4 KB compressed each, 197 KB total, to speculate on a
                // click that lands on at most one of them. They are a
                // suggestion, not a route the reader has committed to.
                prefetch={false}
                // Deliberately still a link, not a <button>: it navigates, so
                // keeping the href preserves middle-click and open-in-new-tab.
                // The click also fills the field first, so if the navigation
                // is slow the user can see what they are searching for.
                onClick={() => {
                  setValue(term);
                  pushRecentSearch(term);
                }}
                aria-label={t("trendingPillLabel", { term, scope: tSearch(scopeLabelKey) })}
                className={`shrink-0 whitespace-nowrap ${chipClass}`}
              >
                {term}
              </Link>
            ))}
            <Link
              href="/search"
              className="hidden shrink-0 rounded-sm px-1 text-[13px] font-semibold text-blue-100 underline underline-offset-4 decoration-white/30 transition-colors hover:text-white hover:decoration-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40 sm:inline"
            >
              {t("searchAdvanced")}
            </Link>
          </div>
      </div>
    </div>
  );
}
