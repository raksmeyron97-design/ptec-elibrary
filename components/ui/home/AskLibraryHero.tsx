"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { useTranslations, useLocale } from "next-intl";
import { pushRecentSearch, readRecent, RECENT_KEY } from "./SearchSuggestions";

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  trending?: string[];
  prompts?: string[];
  askLabel: string;
  hint: string;
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
] as const;

type ScopeId = (typeof SCOPES)[number]["id"];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AskLibraryHero({ trending = [], prompts = [], askLabel, hint }: Props) {
  const router = useRouter();
  const t = useTranslations("home");
  const tSearch = useTranslations("search");
  const locale = useLocale();
  const inputRef = useRef<HTMLInputElement>(null);

  // Input state
  const [scope, setScope] = useState<ScopeId>("all");
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
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

  return (
    <div className="w-full max-w-xl">

      {/* ── Command bar ───────────────────────────────────────────────────── */}
      <form
        role="search"
        className="relative z-[9999]"
        onSubmit={(e) => {
          e.preventDefault();
          submit(value);
        }}
      >

        {/* Ambient glow bed */}
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-6 rounded-[22px] bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.15)_0%,transparent_70%)] transition-opacity duration-[350ms]"
          style={{ opacity: focused ? 1 : 0.45 }}
        />

        {/* Gradient ring */}
        <div className="relative rounded-2xl bg-gradient-to-r from-gold-400 via-blue-400/40 to-cyan-300 p-[2px]">

          {/* Inner bar */}
          {/* Inset variant + cyan tokens: the hero's own gradient ring already
              occupies the outer edge, and brand blue is invisible on this navy. */}
          <div className="focus-shell focus-inset [--focus-border-color:var(--color-cyan-300,#67E8F9)] relative flex items-center gap-2 rounded-[14px] bg-[#121C3A] px-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">

            {/* Scope chooser — narrows the search to one collection.
                Own focus-visible outline rather than the shared .focus-shell
                ring: the shell wraps three focusable controls (select, input,
                submit), so letting it light up would show one indicator for
                whichever of them has focus. The submit button is handled the
                same way. */}
            <div className="relative z-10 shrink-0">
              <label htmlFor="hero-search-scope" className="sr-only">
                {t("searchScopeLabel")}
              </label>
              <select
                id="hero-search-scope"
                value={scope}
                onChange={(e) => setScope(e.target.value as ScopeId)}
                // Explicit width, deliberately. A bare <select> sizes itself to
                // its LONGEST option ("Learning Paths"), which ate ~40% of the
                // bar on a 393px phone and pushed the placeholder out of it.
                // Fixed width + ellipsis keeps the input usable; the full label
                // is always visible once the menu is open.
                className="h-10 w-[92px] cursor-pointer appearance-none overflow-hidden text-ellipsis whitespace-nowrap rounded-lg border border-white/15 bg-white/5 py-0 pl-3 pr-7 text-[13px] font-semibold text-blue-50 outline-none transition-colors hover:border-cyan-400/50 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 sm:w-[132px]"
                style={{
                  // Inline so the caret follows the control's own colour rather
                  // than needing a second background utility per theme.
                  backgroundImage:
                    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2367E8F9' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 0.5rem center",
                  backgroundSize: "0.85rem",
                }}
              >
                {SCOPES.map((s) => (
                  // Options inherit the OS menu surface, not the navy bar, so
                  // they need an explicit dark background to stay readable.
                  <option key={s.id} value={s.id} className="bg-[#121C3A] text-blue-50">
                    {tSearch(s.labelKey)}
                  </option>
                ))}
              </select>
            </div>

            <span aria-hidden className="relative z-10 h-6 w-px shrink-0 bg-white/12" />

            {/* Search icon */}
            <span className="relative z-10 hidden shrink-0 text-cyan-300 sm:block">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </span>

            {/* Input + ghost placeholder */}
            <div className="relative z-10 flex-1">
              <input
                ref={inputRef}
                type="search"
                aria-label={askLabel}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                className="h-14 w-full bg-transparent text-[15px] text-white outline-none placeholder:text-transparent [&::-webkit-search-cancel-button]:appearance-none"
              />
              {!value && (
                // `truncate`: the prompts rotate and are translated, so any of
                // them can outgrow the field — Khmer runs longer than English.
                // Without it the ghost text wrapped to five lines and spilled
                // out of the bar on a phone.
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 flex items-center truncate text-[15px] text-blue-300/80 transition-opacity duration-[250ms]"
                  style={{ opacity: promptVisible ? 1 : 0 }}
                >
                  <span className="truncate">{prompts[promptIdx] ?? ""}</span>
                </span>
              )}
            </div>

            {/* / kbd hint */}
            <kbd className="relative z-10 hidden shrink-0 select-none items-center rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[11px] font-mono text-blue-300/60 lg:flex">
              /
            </kbd>

            {/* Search button */}
            <button
              type="submit"
              className="relative z-10 ml-1 h-10 shrink-0 cursor-pointer rounded-xl bg-gradient-to-b from-gold-400 to-gold-500 px-5 text-[14px] font-bold text-blue-950 transition-all hover:brightness-110 active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400"
              style={{ boxShadow: "0 2px 0 rgba(0,0,0,0.25), 0 0 28px -6px rgba(245,158,11,0.75)" }}
            >
              {askLabel}
            </button>
          </div>
        </div>
      </form>

      {/* ── Hint + secondary paths ── */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <p className="text-[12px] text-blue-300/70">{hint}</p>
        <span className="hidden h-3 w-px bg-white/15 sm:block" aria-hidden />
        <Link
          href="/search"
          className="text-[12px] font-semibold text-blue-200/80 underline-offset-2 transition-colors hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40 rounded-sm"
        >
          {t("searchAdvanced")}
        </Link>
        <Link
          href="/books"
          className="text-[12px] font-semibold text-blue-200/80 underline-offset-2 transition-colors hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40 rounded-sm"
        >
          {t("searchBrowseAll")}
        </Link>
      </div>

      {/* ── Chips ── */}
      <div className="mt-4 space-y-3 animate-[fade-rise-in_0.2s_ease-out]">
          {/* Recent searches */}
          {recent.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-300">
                {t("recent")}
              </span>
              {recent.map((term) => (
                <button
                  key={`r-${term}`}
                  type="button"
                  onClick={() => submit(term)}
                  aria-label={t("trendingPillLabel", { term, scope: tSearch(scopeLabelKey) })}
                  className="inline-flex max-w-[240px] cursor-pointer items-center gap-1.5 truncate rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[13px] text-blue-50 backdrop-blur-sm transition-colors hover:border-cyan-400/50 hover:bg-white/10 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                >
                  <svg className="h-3 w-3 shrink-0 text-blue-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 8v4l3 3M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.36 2.64L3 8" />
                    <path d="M3 4v4h4" />
                  </svg>
                  <span className="truncate">{term}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={clearRecent}
                className="cursor-pointer text-[11px] font-semibold text-blue-300/80 underline-offset-2 hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40"
              >
                {t("clear")}
              </button>
            </div>
          )}

          {/* Trending chips */}
          {trending.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className={`text-[11px] font-bold text-gold-400 ${trendingLabel}`}>
                {t("trending")}
              </span>
              {trending.slice(0, 5).map((term) => (
                <Link
                  key={`t-${term}`}
                  // Honours the chosen scope, like the input and the recent
                  // chips — a chip that ignored it would silently widen the
                  // search the user just narrowed.
                  href={searchHref(term)}
                  // Deliberately still a link, not a <button>: it navigates, so
                  // keeping the href preserves middle-click and open-in-new-tab.
                  // The click also fills the field first, so if the navigation
                  // is slow the user can see what they are searching for.
                  onClick={() => {
                    setValue(term);
                    pushRecentSearch(term);
                  }}
                  aria-label={t("trendingPillLabel", { term, scope: tSearch(scopeLabelKey) })}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-gold-500/25 bg-gold-500/10 px-3 py-1 text-[13px] font-medium text-gold-100 backdrop-blur-sm transition-colors hover:border-gold-500/60 hover:bg-gold-500/20 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400"
                >
                  <svg className="h-3 w-3 shrink-0 text-gold-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m3 17 6-6 4 4 8-8" />
                    <path d="M21 7h-6m6 0v6" />
                  </svg>
                  {term}
                </Link>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
