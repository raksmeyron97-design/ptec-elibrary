"use client";

// components/layout/MobileSearchOverlay.tsx
// The phone search overlay. The tab bar's centre tab and the top bar's search
// button open it, so a search is never more than one tap away on any page.
//
// WHY AN OVERLAY AND NOT A LINK TO /search. A tap that navigates cannot raise
// the keyboard: the new page focuses its field from a script after the tap
// has ended, and phones — iOS Safari strictly — only open the keyboard for a
// focus that happens inside the reader's own gesture, so the reader had to tap
// the field a second time. This overlay is mounted (closed) at browser idle,
// so its field already exists when lib/search/open.ts dispatches; the listener
// commits the open state with flushSync and focuses the field in the same call
// stack as the tap. One tap, keyboard up. Before it has loaded, the tab is
// still a link to /search, so a very early tap loses nothing.
//
// It retrieves nothing itself. Suggestions come from the endpoint the /books
// search box already uses (/api/books/suggestions); Enter goes to /search,
// which owns ranking, facets and full-text page hits; recent searches are the
// same device-local list the search page and the homepage hero read
// (lib/recent-searches.ts).
//
// Motion is opacity + transform only, 200 ms ease-out, none under reduced
// motion. The scrim is a plain tint, never a blur: a full-screen backdrop blur
// re-rasterises the page behind it on every frame of the transition, on the
// low-end phones this library is read on.

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createPortal, flushSync } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowLeft,
  BookOpen,
  FileText,
  GraduationCap,
  History,
  Landmark,
  Newspaper,
  PenLine,
  Search,
  Tags,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import type { Suggestion } from "@/app/api/books/suggestions/route";
import { pushRecentSearch, readRecentSearches } from "@/lib/recent-searches";
import { suggestionDetailHref } from "@/lib/search/suggestion-href";
import { SEARCH_OPEN_EVENT, type SearchOpenDetail } from "@/lib/search/open";
import { PHONE_SHELL_QUERY } from "@/lib/nav/shell-routes";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";

const TYPE_ICON: Record<Suggestion["type"], LucideIcon> = {
  book: BookOpen,
  research: GraduationCap,
  publication: FileText,
  catalog: Landmark,
  learning_path: Waypoints,
  post: Newspaper,
  author: PenLine,
  category: Tags,
};

/** Below this many characters the endpoint is not asked. */
const MIN_QUERY = 2;
const DEBOUNCE_MS = 250;
const TRANSITION_MS = 200;
const MAX_RECENT = 6;

type Phase = "closed" | "opening" | "open" | "closing";

function suggestionKey(s: Suggestion): string {
  if ("slug" in s && s.slug) return `${s.type}:${s.slug}`;
  if ("id" in s) return `${s.type}:${s.id}`;
  return `${s.type}:${s.label}`;
}

const ROW =
  "flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors hover:bg-paper active:bg-paper";

export default function MobileSearchOverlay({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const t = useTranslations("nav");
  const tSearch = useTranslations("search");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const titleId = useId();
  const statusId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const closeTimer = useRef<number | undefined>(undefined);

  const [phase, setPhase] = useState<Phase>("closed");
  const [openedPath, setOpenedPath] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [result, setResult] = useState<{ term: string; items: Suggestion[] }>({ term: "", items: [] });

  // The overlay belongs to the page it was opened on: a navigation (a picked
  // suggestion, the browser's Back) closes it by construction.
  const current: Phase = openedPath === pathname ? phase : "closed";
  const isOpen = current === "opening" || current === "open";
  const shown = current === "open";
  const term = query.trim();

  const trapRef = useFocusTrap<HTMLDivElement>(isOpen, { initialFocus: "input[type=search]" });

  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const open = useEffectEvent((detail: SearchOpenDetail) => {
    if (detail.handled || !window.matchMedia(PHONE_SHELL_QUERY).matches) return;
    detail.handled = true;
    window.clearTimeout(closeTimer.current);
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Commit the open state NOW so the field is rendered and focusable while
    // this is still the reader's tap — see the note at the top of the file.
    flushSync(() => {
      setOpenedPath(pathname);
      setPhase("opening");
      setRecent(readRecentSearches().slice(0, MAX_RECENT));
    });
    inputRef.current?.focus({ preventScroll: true });
    // Two frames: let the start state paint, then transition to the end state.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => setPhase((p) => (p === "opening" ? "open" : p))),
    );
  });

  useEffect(() => {
    const onEvent = (event: Event) => open((event as CustomEvent<SearchOpenDetail>).detail);
    window.addEventListener(SEARCH_OPEN_EVENT, onEvent);
    return () => window.removeEventListener(SEARCH_OPEN_EVENT, onEvent);
  }, []);

  const close = useCallback((restoreFocus = true) => {
    setPhase((p) => (p === "closed" ? p : "closing"));
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      setPhase((p) => (p === "closing" ? "closed" : p));
      if (restoreFocus) returnFocusRef.current?.focus({ preventScroll: true });
    }, TRANSITION_MS);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  // The page behind a modal must not scroll under the reader's thumb.
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  // Suggestions, debounced and cancelled on every keystroke. The result is
  // keyed by the term it answers, so a slow reply to an older term is never
  // shown under a newer one.
  useEffect(() => {
    if (!isOpen || term.length < MIN_QUERY) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/books/suggestions?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        const items: unknown = res.ok ? await res.json() : [];
        setResult({ term, items: Array.isArray(items) ? (items as Suggestion[]) : [] });
      } catch (error) {
        if ((error as Error).name !== "AbortError") setResult({ term, items: [] });
      }
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [isOpen, term]);

  function go(value: string) {
    const q = value.trim();
    if (!q) {
      inputRef.current?.focus();
      return;
    }
    pushRecentSearch(q);
    close(false);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  if (typeof document === "undefined") return null;

  const showSuggestions = term.length >= MIN_QUERY;
  const items = result.term === term ? result.items : [];
  const searching = showSuggestions && result.term !== term;

  return createPortal(
    <div data-search-overlay hidden={current === "closed"} className="lg:hidden">
      <div
        aria-hidden="true"
        onClick={() => close()}
        className="fixed inset-0 z-[125] bg-slate-950/50 transition-opacity duration-200 ease-out motion-reduce:transition-none"
        style={{ opacity: shown ? 1 : 0 }}
      />
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // Closing (exit transition): unreachable for focus and AT.
        inert={!isOpen}
        tabIndex={-1}
        className="fixed inset-x-0 top-0 z-[130] flex max-h-[min(88dvh,42rem)] flex-col rounded-b-[24px] bg-bg-surface pt-[env(safe-area-inset-top)] shadow-[0_24px_48px_-16px_rgba(11,21,48,0.45)] outline-none transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none"
        style={{ transform: shown ? "translateY(0)" : "translateY(-0.75rem)", opacity: shown ? 1 : 0 }}
      >
        <h2 id={titleId} className="sr-only">
          {t("searchLibrary")}
        </h2>

        <form
          role="search"
          action={locale === "km" ? "/km/search" : "/search"}
          method="get"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            go(query);
          }}
          className="flex shrink-0 items-center gap-1.5 border-b border-divider px-2 py-2"
        >
          <button
            type="button"
            onClick={() => close()}
            aria-label={t("closeSearch")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-body transition-colors hover:bg-paper active:bg-paper"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <input
            ref={inputRef}
            type="search"
            name="q"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={t("searchLibrary")}
            aria-describedby={statusId}
            placeholder={t("searchOverlayPlaceholder")}
            enterKeyHint="search"
            inputMode="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="focus-field h-11 min-w-0 flex-1 rounded-full border border-divider bg-paper px-4 text-base text-text-heading outline-none placeholder:text-text-muted"
          />
          <button
            type="submit"
            aria-label={t("searchShort")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-brand-contrast transition-colors hover:bg-brand-hover"
          >
            <Search className="h-5 w-5" aria-hidden="true" />
          </button>
        </form>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3 pt-2">
          <p id={statusId} role="status" className="sr-only">
            {searching ? tSearch("suggestSearching") : ""}
          </p>

          {showSuggestions ? (
            <ul role="list" className="space-y-0.5">
              <li>
                <button type="button" onClick={() => go(query)} className={ROW}>
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-contrast"
                  >
                    <Search className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-[1.5] text-text-heading">
                    {t("searchAllFor", { query: term })}
                  </span>
                </button>
              </li>
              {items.map((s) => {
                const Icon = TYPE_ICON[s.type];
                const sub = "sub" in s ? s.sub : "";
                return (
                  <li key={suggestionKey(s)}>
                    <Link
                      href={suggestionDetailHref(s) ?? `/search?q=${encodeURIComponent(s.label)}`}
                      prefetch={false}
                      onClick={() => {
                        pushRecentSearch(s.label);
                        close(false);
                      }}
                      className={ROW}
                    >
                      <span
                        aria-hidden="true"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-glass-selected text-brand"
                      >
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold leading-[1.5] text-text-heading">
                          {s.label}
                        </span>
                        {sub && (
                          <span className="block truncate text-[12.5px] leading-[1.5] text-text-muted">{sub}</span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
              {searching && items.length === 0 && (
                <li aria-hidden="true" className="px-3 py-3 text-[13px] text-text-muted">
                  {tSearch("suggestSearching")}
                </li>
              )}
            </ul>
          ) : recent.length > 0 ? (
            <>
              <p className="px-3 pb-1 pt-1 text-[12px] font-semibold text-text-muted">{tSearch("recentSearches")}</p>
              <ul role="list" className="space-y-0.5">
                {recent.map((entry) => (
                  <li key={entry}>
                    <button type="button" onClick={() => go(entry)} className={ROW}>
                      <History className="h-[18px] w-[18px] shrink-0 text-text-muted" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-[15px] leading-[1.5] text-text-body">{entry}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="px-3 py-3 text-[14px] leading-relaxed text-text-body">{t("searchOverlayHint")}</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
