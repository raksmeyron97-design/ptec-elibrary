"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import {
  Search, X, GraduationCap, Layers, Clock, BookMarked, ArrowRight,
  PlayCircle, RotateCcw, Sparkles, CheckCircle2, Signal, Compass, Loader2,
  Share2, Trophy, ListChecks,
} from "lucide-react";
import type {
  LearningPathSummary,
  LearningPathDetail,
  PathProgressRecord,
  StepResourceType,
} from "@/app/actions/learning-paths";
import { getMyPathProgress } from "@/app/actions/learning-paths";
import { progressState, progressPercent } from "@/lib/learning-paths/format";
import { formatDuration } from "./format-duration";
import PathCard from "./PathCard";
import FilterPills from "./FilterPills";

type SortKey = "recommended" | "newest" | "shortest" | "alpha";
const SORT_KEYS: SortKey[] = ["recommended", "newest", "shortest", "alpha"];
const RESOURCE_TYPE_KEY: Record<StepResourceType, string> = {
  book: "typeEbook",
  research: "typeThesis",
  catalog: "typePhysical",
  publication: "typePublication",
  external: "typeLink",
};

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
  useEffect(() => {
    let alive = true;
    getMyPathProgress()
      .then((records) => {
        if (!alive) return;
        setProgress(Object.fromEntries(records.map((r) => [r.pathId, r])));
      })
      .catch(() => alive && setProgress({}));
    return () => { alive = false; };
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
    if (q !== lastCommitted.current) { lastCommitted.current = q; setSearchValue(q); }
  }, [q]);
  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);
  function onSearchChange(next: string) {
    setSearchValue(next);
    setIsDebouncing(true);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      lastCommitted.current = next.trim();
      setParams({ q: next.trim() });
      setIsDebouncing(false);
    }, 300);
  }

  // ── Facet options (only offer a filter when the data supports it) ──
  const audiences = useMemo(() => uniq(paths.map((p) => p.audience)), [paths]);
  const subjects = useMemo(() => uniq(paths.map((p) => p.subject)), [paths]);
  const difficulties = useMemo(
    () => (["beginner", "intermediate", "advanced"] as const).filter((d) => paths.some((p) => p.difficulty === d)),
    [paths],
  );
  const languages = useMemo(
    () => (["en", "km", "both"] as const).filter((l) => paths.some((p) => p.language === l)),
    [paths],
  );

  const hasActiveFilters = !!(q || audience || subject || difficulty || language || (sort && sort !== "recommended"));

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
    let list = paths.filter((p) => {
      if (featuredId && p.id === featuredId) return false;
      if (audience && p.audience !== audience) return false;
      if (subject && p.subject !== subject) return false;
      if (difficulty && p.difficulty !== difficulty) return false;
      if (language && p.language !== language) return false;
      if (needle) {
        const hay = [p.title, p.title_km, p.description, p.description_km, p.audience, p.subject, ...(p.tags ?? [])]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    list = [...list];
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

  // Fallback picks for a dead-end result set: curator order, excluding
  // nothing — with a handful of paths total, "first three" is the whole point.
  const suggestions = useMemo(
    () => (filtered.length === 0 ? paths.slice(0, 3) : []),
    [filtered.length, paths],
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

  const searchId = useId();

  const clearAll = useCallback(
    () => setParams({ q: "", audience: "", subject: "", difficulty: "", language: "", sort: "" }),
    [setParams],
  );

  // One removable chip per active facet. Built here rather than inline so the
  // toolbar markup stays readable and every chip clears exactly one param.
  const activeChips: { key: string; label: string; clear: () => void }[] = [];
  if (q) activeChips.push({ key: "q", label: t("filterSearchLabel", { query: q }), clear: () => { setSearchValue(""); setParams({ q: "" }); } });
  if (audience) activeChips.push({ key: "audience", label: audience, clear: () => setParams({ audience: "" }) });
  if (subject) activeChips.push({ key: "subject", label: subject, clear: () => setParams({ subject: "" }) });
  if (difficulty) activeChips.push({ key: "difficulty", label: t(`difficulty.${difficulty}`), clear: () => setParams({ difficulty: "" }) });
  if (language) activeChips.push({ key: "language", label: t(`language.${language}`), clear: () => setParams({ language: "" }) });
  if (sort && sort !== "recommended") activeChips.push({ key: "sort", label: t(`sort.${sort}`), clear: () => setParams({ sort: "" }) });

  return (
    <div>
      {/* ── Continue learning ──
          Only ever rendered from client-fetched progress, so nothing here can
          leak into the ISR shell. */}
      {progress === null ? (
        <ContinueSkeleton />
      ) : inProgress.length > 0 || completed.length > 0 ? (
        <section
          aria-labelledby="continue-heading"
          className="mb-8 rounded-2xl border border-brand/15 border-l-4 border-l-brand bg-brand/[0.03] p-4 sm:p-5"
        >
          <h2 id="continue-heading" className="mb-1 flex items-center gap-2 text-[15px] font-bold text-text-heading">
            <PlayCircle className="h-4.5 w-4.5 text-brand" aria-hidden="true" />
            {t("welcomeBack")}
          </h2>

          {inProgress.length > 0 && (
            <>
              <p className="mb-3.5 text-[12.5px] text-text-muted">{t("continueHeading")}</p>
              <ul className="grid list-none gap-3 lg:grid-cols-2">
                {inProgress.slice(0, 4).map((p) => (
                  <li key={p.pathId}>
                    <ContinueCard record={p} />
                  </li>
                ))}
              </ul>
            </>
          )}

          {completed.length > 0 && (
            <div className={inProgress.length > 0 ? "mt-4 border-t border-brand/12 pt-3.5" : "mt-3"}>
              <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-text-muted">
                <Trophy className="h-3.5 w-3.5 text-gold-500" aria-hidden="true" />
                {t("recentlyCompleted")}
              </h3>
              <ul className="flex list-none flex-wrap gap-2">
                {completed.slice(0, 4).map((c) => (
                  <li key={c.pathId}>
                    <Link
                      href={`/paths/${c.slug}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-600/25 bg-emerald-600/8 px-3 py-1.5 text-[12px] font-semibold text-emerald-700 transition hover:bg-emerald-600/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring dark:text-emerald-400"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="max-w-[22ch] truncate">
                        {locale === "km" && c.title_km ? c.title_km : c.title}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ) : null}

      {/* ── Featured path ── */}
      {showFeatured && featured && (
        <FeaturedPath detail={featured} progress={progress?.[featured.id] ?? null} />
      )}

      {/* ── Browse by goal ── */}
      {audiences.length > 1 && (
        <section aria-labelledby="goal-heading" className="mb-6">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <h2 id="goal-heading" className="text-[13px] font-bold uppercase tracking-wide text-text-muted">
              {t("subjectsHeading")}
            </h2>
          </div>
          <FilterPills
            scrollOnMobile
            label={t("subjectsHeading")}
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

      {/* ── Toolbar ── */}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
        <form role="search" onSubmit={(e) => e.preventDefault()} className="relative flex-1">
          <label htmlFor={searchId} className="sr-only">{t("searchLabel")}</label>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
          <input
            ref={searchRef}
            id={searchId}
            type="text"
            role="searchbox"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full rounded-xl border border-divider bg-bg-surface py-3 pl-10 pr-24 text-[16px] text-text-heading shadow-sm outline-none transition focus:border-brand/50 focus:ring-2 focus:ring-focus-ring/20 placeholder:text-text-muted sm:text-[14px]"
          />

          <div className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
            {isDebouncing && (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-text-muted motion-reduce:animate-none" aria-hidden="true" />
                <span className="sr-only" role="status">{t("searching")}</span>
              </>
            )}
            {searchValue ? (
              <button
                type="button"
                onClick={() => { setSearchValue(""); setIsDebouncing(false); setParams({ q: "" }); }}
                aria-label={t("clearSearch")}
                className="flex h-6 w-6 items-center justify-center rounded-full text-text-muted transition hover:bg-paper hover:text-text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : (
              /* Hint, not a control — the shortcut is handled on window. */
              <kbd
                aria-hidden="true"
                className="hidden rounded border border-divider bg-paper px-1.5 py-0.5 text-[10px] font-bold text-text-muted sm:block"
                title={t("searchShortcutHint")}
              >
                /
              </kbd>
            )}
          </div>
        </form>

        {/* Subject stays a native select: there are potentially many subjects,
            and a native control gives a real mobile picker, keyboard type-ahead
            and screen-reader support that a hand-rolled popover would have to
            reimplement. */}
        {subjects.length > 1 && (
          <FilterSelect
            label={t("filterSubject")}
            value={subject}
            onChange={(v) => setParams({ subject: v })}
            options={[{ value: "", label: t("allSubjects") }, ...subjects.map((s) => ({ value: s, label: s }))]}
          />
        )}
      </div>

      {/* ── Facet pills + sort ── */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-2.5">
          {difficulties.length > 0 && (
            <FilterPills
              size="sm"
              label={t("filterDifficulty")}
              value={difficulty}
              onChange={(v) => setParams({ difficulty: v })}
              options={difficulties.map((d) => ({ value: d, label: t(`difficulty.${d}`) }))}
            />
          )}
          {languages.length > 1 && (
            <FilterPills
              size="sm"
              label={t("filterLanguage")}
              value={language}
              onChange={(v) => setParams({ language: v })}
              options={languages.map((l) => ({ value: l, label: t(`language.${l}`) }))}
            />
          )}
        </div>

        {/* Sort as a segmented control: four fixed, mutually exclusive options
            read better side by side than hidden behind a select. */}
        <div
          role="group"
          aria-label={t("sortLabel")}
          className="-mx-4 flex shrink-0 gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
        >
          <div className="inline-flex rounded-xl border border-divider bg-bg-surface p-1 shadow-sm">
            {SORT_KEYS.map((k) => {
              const active = sort === k;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setParams({ sort: k === "recommended" ? "" : k })}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
                    active ? "bg-brand text-brand-contrast shadow-sm" : "text-text-muted hover:text-text-heading"
                  }`}
                >
                  {t(`sort.${k}`)}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Active filters ── */}
      {activeChips.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
            {t("activeFilters")}
          </span>
          {activeChips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/8 py-1 pl-3 pr-1.5 text-[12px] font-semibold text-brand"
            >
              {chip.label}
              <button
                type="button"
                onClick={chip.clear}
                aria-label={t("removeFilter", { label: chip.label })}
                className="flex h-4 w-4 items-center justify-center rounded-full transition hover:bg-brand/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-brand/40 px-3 py-1.5 text-[12px] font-bold text-brand transition hover:bg-brand/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {t("resetFilters")}
          </button>
        </div>
      )}

      {/* ── Result count ── */}
      <p className="mb-4 text-[13px] text-text-muted tabular-nums" aria-live="polite">
        {q
          ? t("showingResultsFor", { count: filtered.length, total: paths.length, query: q })
          : hasActiveFilters
            ? t("resultCount", { filtered: filtered.length, total: paths.length })
            : t("pathCount", { count: paths.length })}
      </p>

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
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand/8 px-4 py-2 text-[13px] font-bold text-brand transition hover:bg-brand/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {t("browseAllPaths")}
          </button>

          {/* Suggestions: the first few paths in curator order, so a dead end
              still offers somewhere to go. Deterministic, not random — a list
              that reshuffles on every keystroke reads as noise. */}
          {suggestions.length > 0 && (
            <div className="mx-auto mt-10 max-w-4xl border-t border-divider pt-8 text-left">
              <h3 className="mb-4 text-center text-[13px] font-bold uppercase tracking-wide text-text-muted">
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
          className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
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
  return [...new Set(values.filter((v): v is string => !!v && v.trim().length > 0))].sort((a, b) => a.localeCompare(b));
}
function localizedTitle(p: LearningPathSummary, locale: string): string {
  return locale === "km" && p.title_km ? p.title_km : p.title;
}

function FilterSelect({
  label, value, onChange, options, icon,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  icon?: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">{label}</label>
      <div className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted">{icon}</div>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className={`h-9 appearance-none rounded-lg border bg-bg-surface py-1.5 pr-7 text-[12.5px] font-semibold shadow-sm outline-none transition focus:border-brand/50 focus:ring-2 focus:ring-focus-ring/20 ${
          value ? "border-brand/40 text-brand" : "border-divider text-text-muted"
        } ${icon ? "pl-8" : "pl-3"}`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.value === "" ? o.label : `${label}: ${o.label}`}</option>
        ))}
      </select>
      <svg className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
      </svg>
    </div>
  );
}

/**
 * A single "pick up where you left off" card: horizontal, with the module the
 * learner is inside as context and an explicit Resume affordance.
 *
 * The Resume control is styled as a button but is NOT a button element — the
 * whole card is already one link, and nesting an interactive element inside it
 * would produce the nested-interactive pattern assistive tech cannot resolve.
 */
function ContinueCard({ record }: { record: PathProgressRecord }) {
  const t = useTranslations("paths");
  const locale = useLocale();
  const title = locale === "km" && record.title_km ? record.title_km : record.title;
  const pct = progressPercent(record.completedSteps, record.totalSteps);
  const moduleName =
    record.nextStep &&
    (locale === "km" && record.nextStep.moduleTitleKm
      ? record.nextStep.moduleTitleKm
      : record.nextStep.moduleTitle);

  return (
    <Link
      href={`/paths/${record.slug}`}
      className="group flex items-center gap-4 rounded-xl border border-brand/20 bg-bg-surface p-3 transition-all duration-200 hover:border-brand/45 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-body motion-safe:hover:-translate-y-px"
    >
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-paper">
        {record.cover_url ? (
          <Image src={record.cover_url} alt="" fill sizes="80px" className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <GraduationCap className="h-6 w-6 text-brand/40" aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-bold text-text-heading">{title}</p>

        {moduleName && (
          <p className="mt-0.5 truncate text-[11.5px] text-text-muted">
            {t("continueModule", { module: moduleName })}
          </p>
        )}

        <div className="mt-2 flex items-center gap-2">
          <div
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("yourProgress")}
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper"
          >
            <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <span className="shrink-0 text-[11px] font-semibold tabular-nums text-text-muted">
            {t("stepsOf", { done: record.completedSteps, total: record.totalSteps })}
          </span>
        </div>
      </div>

      <span
        aria-hidden="true"
        className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand/10 px-2.5 py-1.5 text-[12px] font-bold text-brand transition-colors group-hover:bg-brand group-hover:text-brand-contrast"
      >
        {t("resume")}
        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 motion-safe:group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

function FeaturedPath({ detail, progress }: { detail: LearningPathDetail; progress: PathProgressRecord | null }) {
  const t = useTranslations("paths");
  const locale = useLocale();
  const title = locale === "km" && detail.title_km ? detail.title_km : detail.title;
  const description = locale === "km" && detail.description_km ? detail.description_km : detail.description;
  const duration = formatDuration(detail.durationMinutes, t);
  const state = progressState(progress);
  const cta = state === "completed" ? t("cardReview") : state === "in-progress" ? t("cardContinue") : t("featuredStart");
  const resourceTypes = [...new Set(detail.modules.flatMap((m) => m.steps.map((s) => s.resource_type)))];
  const outcomes = detail.outcomes.slice(0, 3);
  const modulePreview = detail.modules.slice(0, 3).map((m) => ({
    id: m.id,
    label: locale === "km" && m.title_km ? m.title_km : m.title,
  }));

  const [coverFailed, setCoverFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const onShare = useCallback(async () => {
    const url = `${window.location.origin}${locale === "km" ? "/km" : ""}/paths/${detail.slug}`;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
    } catch {
      // Dismissed share sheet or a blocked clipboard — neither is an error
      // worth surfacing; the toast below only fires on the copy path.
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [detail.slug, locale, title]);

  return (
    <section aria-labelledby="featured-heading" className="mb-8 overflow-hidden rounded-3xl border border-brand/20 bg-gradient-to-br from-brand/[0.07] via-bg-surface to-bg-surface shadow-sm">
      <div className="grid gap-0 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="p-6 sm:p-8">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gold-400/50 bg-gold-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-gold-600">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {t("featuredEyebrow")}
          </span>
          <h2 id="featured-heading" className="mt-3 font-khmer-serif text-[clamp(20px,3vw,28px)] font-bold leading-[1.2] text-text-heading">
            {title}
          </h2>
          {description && <p className="mt-2 max-w-[52ch] text-[14px] leading-relaxed text-text-muted">{description}</p>}

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] font-medium text-text-muted">
            {detail.audience && <span className="inline-flex items-center gap-1"><GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />{detail.audience}</span>}
            {detail.difficulty && <span className="inline-flex items-center gap-1"><Signal className="h-3.5 w-3.5" aria-hidden="true" />{t(`difficulty.${detail.difficulty}`)}</span>}
            <span className="inline-flex items-center gap-1"><BookMarked className="h-3.5 w-3.5" aria-hidden="true" />{t("modules", { count: detail.moduleCount })}</span>
            <span className="inline-flex items-center gap-1"><Layers className="h-3.5 w-3.5" aria-hidden="true" />{t("steps", { count: detail.stepCount })}</span>
            {duration && <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{duration}</span>}
          </div>

          {outcomes.length > 0 && (
            <ul className="mt-4 space-y-1.5">
              {outcomes.map((o, i) => {
                const text = locale === "km" && o.km ? o.km : o.en || o.km;
                return (
                  <li key={i} className="flex items-start gap-2 text-[13px] text-text-body">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                    <span>{text}</span>
                  </li>
                );
              })}
            </ul>
          )}

          {modulePreview.length > 0 && (
            <div className="mt-5 rounded-xl border border-divider bg-bg-surface/70 p-3.5">
              <h3 className="mb-2 flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wide text-text-muted">
                <ListChecks className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
                {t("whatsInside")}
              </h3>
              <ol className="list-none space-y-1.5">
                {modulePreview.map((m, i) => (
                  <li key={m.id} className="flex items-start gap-2 text-[13px] text-text-body">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[10px] font-bold tabular-nums text-brand">
                      {i + 1}
                    </span>
                    <span className="line-clamp-1">{m.label}</span>
                  </li>
                ))}
                {detail.moduleCount > modulePreview.length && (
                  <li className="pl-6 text-[12px] text-text-muted">
                    {t("modules", { count: detail.moduleCount - modulePreview.length })}
                  </li>
                )}
              </ol>
            </div>
          )}

          {resourceTypes.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {resourceTypes.map((rt) => (
                <span key={rt} className="rounded-full bg-paper px-2.5 py-0.5 text-[11px] font-semibold text-text-muted">
                  {t(RESOURCE_TYPE_KEY[rt])}
                </span>
              ))}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              href={`/paths/${detail.slug}`}
              className="btn-brand-gradient inline-flex items-center gap-2 rounded-xl px-6 py-3 text-[15px] font-bold text-white shadow-lg shadow-brand/25 transition-shadow hover:shadow-xl hover:shadow-brand/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
            >
              {cta}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>

            <button
              type="button"
              onClick={onShare}
              className="inline-flex items-center gap-2 rounded-xl border border-divider bg-bg-surface px-4 py-3 text-[14px] font-semibold text-text-body transition hover:border-brand/40 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
            >
              <Share2 className="h-4 w-4" aria-hidden="true" />
              {t("share")}
            </button>

            {/* Announced politely and shown inline — a fixed-position toast on
                a page this long can fire well outside the viewport. */}
            <span role="status" aria-live="polite" className={copied ? "" : "sr-only"}>
              {copied ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600/10 px-3 py-2 text-[13px] font-semibold text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("linkCopied")}
                </span>
              ) : ""}
            </span>
          </div>
        </div>

        <div className="relative hidden min-h-[220px] md:block">
          {detail.cover_url && !coverFailed ? (
            <Image
              src={detail.cover_url}
              alt=""
              fill
              priority
              sizes="420px"
              onError={() => setCoverFailed(true)}
              className="object-cover"
            />
          ) : (
            /* Same graceful degradation as the cards: a deleted storage object
               must not leave a broken-image glyph across the hero. */
            <div className="flex h-full w-full items-center justify-center bg-brand/8">
              <GraduationCap className="h-16 w-16 text-brand/25" aria-hidden="true" />
            </div>
          )}
        </div>
      </div>
    </section>
  );
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

function ContinueSkeleton() {
  return (
    <div
      className="mb-8 rounded-2xl border border-brand/15 border-l-4 border-l-brand bg-brand/[0.03] p-4 sm:p-5"
      aria-hidden="true"
    >
      <div className="paths-skeleton mb-3.5 h-4 w-40 rounded" />
      <div className="grid gap-3 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-4 rounded-xl border border-brand/20 bg-bg-surface p-3">
            <div className="paths-skeleton h-20 w-20 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-2">
              <div className="paths-skeleton h-3.5 w-3/4 rounded" />
              <div className="paths-skeleton h-2.5 w-1/2 rounded" />
              <div className="paths-skeleton h-1.5 w-full rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
