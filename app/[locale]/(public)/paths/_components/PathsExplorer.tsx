"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Compass, RotateCcw } from "lucide-react";
import type {
  LearningPathSummary,
  LearningPathDetail,
  PathProgressRecord,
} from "@/app/actions/learning-paths";
import { getMyPathProgress } from "@/app/actions/learning-paths";
import { progressState } from "@/lib/learning-paths/format";
import PathCard from "./PathCard";
import FilterPills from "./FilterPills";
import PathFilterBar, { type FacetSelect } from "./PathFilterBar";
import FeaturedPath from "./FeaturedPath";
import ContinueRail, { ContinueRailSkeleton } from "./ContinueRail";

type SortKey = "recommended" | "newest" | "shortest" | "alpha";
const SORT_KEYS: SortKey[] = ["newest", "shortest", "alpha"];

/* ── "Has this device seen progress before?" ──────────────────────────────
   Remembers, on this device only, that the visitor had path progress last
   time. It gates nothing but the loading skeleton — the real data is always
   re-fetched — so a stale or missing value costs at most one layout shift,
   never a wrong render.

   Exposed as an external store rather than read in an effect. localStorage is
   exactly what `useSyncExternalStore` is for: it gives the server (and the
   hydrating client's first render) the `false` snapshot, so the markup cannot
   mismatch, then re-renders with the real value — without a setState in an
   effect body and the cascading render that comes with it. The cached read
   keeps `getSnapshot` cheap and referentially stable, which the hook requires. */
const PROGRESS_HINT_KEY = "ptec.paths.hasProgress";

let progressHint: boolean | null = null;
const progressHintListeners = new Set<() => void>();

function readProgressHint(): boolean {
  if (progressHint === null) {
    try {
      progressHint = localStorage.getItem(PROGRESS_HINT_KEY) === "1";
    } catch {
      progressHint = false; // private mode / storage disabled
    }
  }
  return progressHint;
}

function writeProgressHint(next: boolean): void {
  try {
    if (next) localStorage.setItem(PROGRESS_HINT_KEY, "1");
    else localStorage.removeItem(PROGRESS_HINT_KEY);
  } catch {
    /* ignored — the hint is an optimisation, never a correctness input */
  }
  if (progressHint !== next) {
    progressHint = next;
    for (const l of progressHintListeners) l();
  }
}

function subscribeProgressHint(onChange: () => void): () => void {
  progressHintListeners.add(onChange);
  return () => {
    progressHintListeners.delete(onChange);
  };
}

export default function PathsExplorer({
  paths,
  featured,
}: {
  paths: LearningPathSummary[];
  featured: LearningPathDetail | null;
}) {
  const t = useTranslations("paths");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── Per-user progress (client island — keeps the page shell cacheable) ──
  const [progress, setProgress] = useState<Record<string, PathProgressRecord> | null>(null);
  const expectProgress = useSyncExternalStore(
    subscribeProgressHint,
    readProgressHint,
    () => false, // server + first hydrating render: assume nothing to resume
  );

  useEffect(() => {
    let alive = true;
    getMyPathProgress()
      .then((records) => {
        if (!alive) return;
        setProgress(Object.fromEntries(records.map((r) => [r.pathId, r])));
        writeProgressHint(records.length > 0);
      })
      .catch(() => alive && setProgress({}));
    return () => {
      alive = false;
    };
  }, []);

  // ── Filter state, sourced from the URL ──
  const q = searchParams.get("q") ?? "";
  const audience = searchParams.get("audience") ?? "";
  const subject = searchParams.get("subject") ?? "";
  const difficulty = searchParams.get("difficulty") ?? "";
  const language = searchParams.get("language") ?? "";
  const sort = (searchParams.get("sort") as SortKey) ?? "recommended";

  const setParams = useCallback(
    (patch: Record<string, string>) => {
      const p = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) p.set(k, v);
        else p.delete(k);
      }
      const qs = p.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [router, searchParams],
  );

  // ── Keyboard shortcut: "/" or Ctrl/Cmd+K focuses search ──
  // Guarded against firing while the visitor is typing somewhere else, and
  // against contenteditable, so it never steals a keystroke mid-word.
  const searchRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const typing =
        !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
      const combo = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      const slash = e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey;
      if (combo || slash) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Debounced search input ──
  const [searchValue, setSearchValue] = useState(q);
  const [isDebouncing, setIsDebouncing] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCommitted = useRef(q);
  useEffect(() => {
    if (q !== lastCommitted.current) {
      lastCommitted.current = q;
      setSearchValue(q);
    }
  }, [q]);
  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);

  const onSearchChange = useCallback(
    (next: string) => {
      setSearchValue(next);
      setIsDebouncing(true);
      if (searchTimer.current) clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(() => {
        lastCommitted.current = next.trim();
        setParams({ q: next.trim() });
        setIsDebouncing(false);
      }, 300);
    },
    [setParams],
  );

  const clearSearch = useCallback(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setSearchValue("");
    setIsDebouncing(false);
    lastCommitted.current = "";
    setParams({ q: "" });
  }, [setParams]);

  // ── Facet options (only offer a filter when the data supports it) ──
  const audiences = useMemo(() => uniq(paths.map((p) => p.audience)), [paths]);
  const subjects = useMemo(() => uniq(paths.map((p) => p.subject)), [paths]);
  const difficulties = useMemo(
    () =>
      (["beginner", "intermediate", "advanced"] as const).filter((d) =>
        paths.some((p) => p.difficulty === d),
      ),
    [paths],
  );
  const languages = useMemo(
    () => (["en", "km", "both"] as const).filter((l) => paths.some((p) => p.language === l)),
    [paths],
  );

  const hasActiveFilters = !!(q || audience || subject || difficulty || language || sort !== "recommended");

  // The featured card is only rendered on the unfiltered view; whenever it is
  // on screen its path must come OUT of the grid below, or the lead item is
  // shown twice on the same screen. (Latent until getFeaturedPath gained its
  // fallback — before that the slot was empty on this library's data, so the
  // duplicate never appeared.)
  const showFeatured = !!featured && !hasActiveFilters;
  const featuredId = showFeatured ? featured!.id : null;

  // ── Apply filters + sort ──
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = paths.filter((p) => {
      if (featuredId && p.id === featuredId) return false;
      if (audience && p.audience !== audience) return false;
      if (subject && p.subject !== subject) return false;
      if (difficulty && p.difficulty !== difficulty) return false;
      if (language && p.language !== language) return false;
      if (needle) {
        // Tags are no longer printed on the card, but they stay in the
        // haystack — a curator's tag is often exactly what a visitor types.
        const hay = [p.title, p.title_km, p.description, p.description_km, p.audience, p.subject, ...(p.tags ?? [])]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    switch (sort) {
      case "newest":
        list.sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
        break;
      case "shortest":
        list.sort((a, b) => (a.durationMinutes ?? Infinity) - (b.durationMinutes ?? Infinity));
        break;
      case "alpha":
        list.sort((a, b) => localizedTitle(a, locale).localeCompare(localizedTitle(b, locale)));
        break;
      default:
        list.sort((a, b) => a.position - b.position);
    }
    return list;
  }, [paths, q, audience, subject, difficulty, language, sort, locale, featuredId]);

  const inProgress = useMemo(
    () =>
      progress
        ? Object.values(progress)
            .filter((p) => progressState(p) === "in-progress")
            .sort((a, b) => (b.enrolledAt ?? "").localeCompare(a.enrolledAt ?? ""))
        : [],
    [progress],
  );

  const completed = useMemo(
    () =>
      progress
        ? Object.values(progress)
            .filter((p) => progressState(p) === "completed")
            .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))
        : [],
    [progress],
  );

  // Fallback picks for a dead-end result set: curator order, excluding
  // nothing — with a handful of paths total, "first three" is the whole point.
  const suggestions = useMemo(
    () => (filtered.length === 0 ? paths.slice(0, 3) : []),
    [filtered.length, paths],
  );

  const clearAll = useCallback(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setSearchValue("");
    setIsDebouncing(false);
    lastCommitted.current = "";
    setParams({ q: "", audience: "", subject: "", difficulty: "", language: "", sort: "" });
  }, [setParams]);

  // Every refinement in one list, in the order they appear in the bar. Facets
  // the collection cannot support are dropped rather than rendered empty.
  const facets: FacetSelect[] = [];
  if (subjects.length > 1) {
    facets.push({
      key: "subject",
      label: t("filterSubject"),
      value: subject,
      allLabel: t("allSubjects"),
      options: subjects.map((s) => ({ value: s, label: s })),
    });
  }
  if (difficulties.length > 1) {
    facets.push({
      key: "difficulty",
      label: t("filterDifficulty"),
      value: difficulty,
      allLabel: t("allDifficulties"),
      options: difficulties.map((d) => ({ value: d, label: t(`difficulty.${d}`) })),
    });
  }
  if (languages.length > 1) {
    facets.push({
      key: "language",
      label: t("filterLanguage"),
      value: language,
      allLabel: t("allLanguages"),
      options: languages.map((l) => ({ value: l, label: t(`language.${l}`) })),
    });
  }
  // Sort is always offered, and its "unset" option is a real order rather than
  // an absence — which is why it reads "Recommended" instead of "All".
  facets.push({
    key: "sort",
    label: t("sortLabel"),
    value: sort === "recommended" ? "" : sort,
    allLabel: t("sort.recommended"),
    options: SORT_KEYS.map((k) => ({ value: k, label: t(`sort.${k}`) })),
  });

  return (
    <div>
      {/* ── Continue learning ── */}
      {progress === null ? (
        expectProgress ? <ContinueRailSkeleton /> : null
      ) : (
        <ContinueRail inProgress={inProgress} completed={completed} />
      )}

      {/* ── Featured lead ── */}
      {showFeatured && featured && (
        <FeaturedPath detail={featured} progress={progress?.[featured.id] ?? null} />
      )}

      {/* ── Browse by goal ──
          Audience is the one facet with editorial weight: it is how the
          collection is organised for a reader ("I am a trainee", "I teach
          already"), not a way to narrow a result set. It keeps its pills, and
          its counts, above the refinement bar. */}
      {audiences.length > 1 && (
        <section aria-labelledby="goal-heading" className="mb-5">
          <h2
            id="goal-heading"
            className="mb-2.5 text-[11.5px] font-bold uppercase tracking-[0.13em] text-text-muted"
          >
            {t("browseByGoal")}
          </h2>
          <FilterPills
            scrollOnMobile
            label={t("browseByGoal")}
            value={audience}
            onChange={(v) => setParams({ audience: v })}
            options={audiences.map((a) => ({
              value: a,
              label: a,
              icon: <Compass className="h-3 w-3" aria-hidden="true" />,
              count: paths.filter((p) => p.audience === a).length,
            }))}
          />
        </section>
      )}

      {/* ── Search + refinements ── */}
      <PathFilterBar
        regionLabel={t("filterBarLabel")}
        searchRef={searchRef}
        searchValue={searchValue}
        searchLabel={t("searchLabel")}
        searchPlaceholder={t("searchPlaceholder")}
        clearSearchLabel={t("clearSearch")}
        searchingLabel={t("searching")}
        shortcutHint={t("searchShortcutHint")}
        isDebouncing={isDebouncing}
        onSearchChange={onSearchChange}
        onClearSearch={clearSearch}
        facets={facets}
        onFacetChange={(key, value) => setParams({ [key]: value })}
      />

      {/* ── Result count + the single reset ──
          There is no chip row above this any more. Every active refinement is
          shown by the control that set it, one line up and still on screen —
          chips restated the same state a third time (pressed pill, selected
          option, chip) and cost a whole band of vertical space. What chips did
          uniquely carry was "clear everything", so that survives here. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-[13px] tabular-nums text-text-muted" aria-live="polite">
          {q
            ? t("showingResultsFor", { count: filtered.length, total: paths.length, query: q })
            : hasActiveFilters
              ? t("resultCount", { filtered: filtered.length, total: paths.length })
              : t("pathCount", { count: paths.length })}
        </p>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-text-muted underline decoration-text-muted/40 underline-offset-4 transition-colors duration-150 hover:text-brand hover:decoration-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {t("resetFilters")}
          </button>
        )}
      </div>

      {/* ── Grid / no-results ── */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-divider bg-bg-surface px-5 py-14 text-center">
          <EmptyShelf />
          <p className="mt-4 text-[15px] font-bold text-text-heading">
            {q ? t("noResultsForQuery", { query: q }) : t("noResultsTitle")}
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-text-muted">
            {t("tryRemovingFilters")}
          </p>

          <button
            type="button"
            onClick={clearAll}
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand/8 px-4 py-2 text-[13px] font-bold text-brand transition-colors duration-150 hover:bg-brand/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {t("browseAllPaths")}
          </button>

          {/* Suggestions: the first few paths in curator order, so a dead end
              still offers somewhere to go. Deterministic, not random — a list
              that reshuffles on every keystroke reads as noise. */}
          {suggestions.length > 0 && (
            <div className="mx-auto mt-10 max-w-4xl border-t border-divider pt-8 text-left">
              <h3 className="mb-4 text-center text-[11.5px] font-bold uppercase tracking-[0.13em] text-text-muted">
                {t("youMightLike")}
              </h3>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {suggestions.map((p, i) => (
                  <PathCard key={p.id} path={p} progress={progress?.[p.id] ?? null} index={i} />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div
          /* `key` on the grid restarts the entrance animation whenever the
             result set changes, which is what makes a filter change read as a
             crossfade rather than rows silently swapping in place. */
          key={`${q}|${audience}|${subject}|${difficulty}|${language}|${sort}`}
          className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {filtered.map((p, i) => (
            <PathCard key={p.id} path={p} progress={progress?.[p.id] ?? null} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function uniq(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v && v.trim().length > 0))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function localizedTitle(p: LearningPathSummary, locale: string): string {
  return locale === "km" && p.title_km ? p.title_km : p.title;
}

/**
 * Inline empty-shelf figure for the no-results state. Drawn rather than
 * imported so it themes with the page and costs no request; purely decorative,
 * so it is hidden from assistive tech — the message below it carries the
 * meaning.
 */
function EmptyShelf() {
  return (
    <svg
      viewBox="0 0 120 84"
      className="mx-auto h-20 w-auto text-brand/30"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {/* shelf */}
      <path d="M12 62h96" />
      <path d="M20 62V22M100 62V22" />
      {/* a couple of leaning volumes, one gap where a path would sit */}
      <rect x="28" y="34" width="11" height="28" rx="2" />
      <rect x="43" y="28" width="11" height="34" rx="2" />
      <path d="M62 62 66 31l10 2.6L72 62z" />
      {/* the missing one, dashed */}
      <rect x="82" y="36" width="11" height="26" rx="2" strokeDasharray="4 4" opacity="0.55" />
    </svg>
  );
}
