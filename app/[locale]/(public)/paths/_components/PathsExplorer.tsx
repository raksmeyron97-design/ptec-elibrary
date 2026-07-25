"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import {
  Search, X, SlidersHorizontal, GraduationCap, Layers, Clock, BookMarked,
  ArrowRight, PlayCircle, RotateCcw, Sparkles, CheckCircle2, Signal,
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

  // ── Debounced search input ──
  const [searchValue, setSearchValue] = useState(q);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCommitted = useRef(q);
  useEffect(() => {
    if (q !== lastCommitted.current) { lastCommitted.current = q; setSearchValue(q); }
  }, [q]);
  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);
  function onSearchChange(next: string) {
    setSearchValue(next);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { lastCommitted.current = next.trim(); setParams({ q: next.trim() }); }, 300);
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

  // ── Apply filters + sort ──
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = paths.filter((p) => {
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
  }, [paths, q, audience, subject, difficulty, language, sort, locale]);

  const hasActiveFilters = !!(q || audience || subject || difficulty || language || (sort && sort !== "recommended"));

  const inProgress = useMemo(
    () =>
      progress
        ? Object.values(progress)
            .filter((p) => progressState(p) === "in-progress")
            .sort((a, b) => (b.enrolledAt ?? "").localeCompare(a.enrolledAt ?? ""))
        : [],
    [progress],
  );

  const searchId = useId();

  return (
    <div>
      {/* ── Continue learning rail ── */}
      {progress === null ? (
        <ContinueSkeleton />
      ) : inProgress.length > 0 ? (
        <section aria-labelledby="continue-heading" className="mb-8">
          <h2 id="continue-heading" className="mb-3 flex items-center gap-2 text-[15px] font-bold text-text-heading">
            <PlayCircle className="h-4.5 w-4.5 text-brand" aria-hidden="true" />
            {t("continueHeading")}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {inProgress.slice(0, 3).map((p) => (
              <ContinueCard key={p.pathId} record={p} />
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Featured path ── */}
      {featured && !hasActiveFilters && <FeaturedPath detail={featured} progress={progress?.[featured.id] ?? null} />}

      {/* ── Browse by goal (data-backed quick filters) ── */}
      {audiences.length > 1 && (
        <section aria-labelledby="goal-heading" className="mb-6">
          <h2 id="goal-heading" className="mb-2.5 text-[13px] font-bold uppercase tracking-wide text-text-muted">
            {t("browseByGoal")}
          </h2>
          <div className="flex flex-wrap gap-2">
            {audiences.map((a) => {
              const active = audience === a;
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => setParams({ audience: active ? "" : a })}
                  aria-pressed={active}
                  className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition ${
                    active
                      ? "border-brand bg-brand text-white"
                      : "border-divider bg-bg-surface text-text-muted hover:border-brand/40 hover:text-brand"
                  }`}
                >
                  {a}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Toolbar ── */}
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center">
        <form role="search" onSubmit={(e) => e.preventDefault()} className="relative flex-1">
          <label htmlFor={searchId} className="sr-only">{t("searchLabel")}</label>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
          <input
            id={searchId}
            type="text"
            role="searchbox"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full rounded-xl border border-divider bg-bg-surface py-2.5 pl-10 pr-10 text-[16px] text-text-heading shadow-sm outline-none transition focus:border-brand/50 focus:ring-2 focus:ring-focus-ring/20 placeholder:text-text-muted sm:text-sm"
          />
          {searchValue && (
            <button
              type="button"
              onClick={() => { setSearchValue(""); setParams({ q: "" }); }}
              aria-label={t("clearSearch")}
              className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-text-muted hover:bg-paper hover:text-text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </form>

        <div className="flex flex-wrap items-center gap-2">
          {subjects.length > 1 && (
            <FilterSelect label={t("filterSubject")} value={subject} onChange={(v) => setParams({ subject: v })}
              options={[{ value: "", label: t("allSubjects") }, ...subjects.map((s) => ({ value: s, label: s }))]} />
          )}
          {difficulties.length > 0 && (
            <FilterSelect label={t("filterDifficulty")} value={difficulty} onChange={(v) => setParams({ difficulty: v })}
              options={[{ value: "", label: t("allDifficulties") }, ...difficulties.map((d) => ({ value: d, label: t(`difficulty.${d}`) }))]} />
          )}
          {languages.length > 1 && (
            <FilterSelect label={t("filterLanguage")} value={language} onChange={(v) => setParams({ language: v })}
              options={[{ value: "", label: t("allLanguages") }, ...languages.map((l) => ({ value: l, label: t(`language.${l}`) }))]} />
          )}
          <FilterSelect label={t("sortLabel")} value={sort} onChange={(v) => setParams({ sort: v === "recommended" ? "" : v })} icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
            options={SORT_KEYS.map((k) => ({ value: k, label: t(`sort.${k}`) }))} />
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => setParams({ q: "", audience: "", subject: "", difficulty: "", language: "", sort: "" })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-divider px-3 py-2 text-[12.5px] font-semibold text-text-muted transition hover:border-brand/40 hover:text-brand"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              {t("resetFilters")}
            </button>
          )}
        </div>
      </div>

      {/* ── Result count ── */}
      <p className="mb-4 text-[13px] text-text-muted tabular-nums" aria-live="polite">
        {hasActiveFilters
          ? t("resultCount", { filtered: filtered.length, total: paths.length })
          : t("pathCount", { count: paths.length })}
      </p>

      {/* ── Grid / no-results ── */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-divider bg-bg-surface py-16 text-center">
          <Search className="mx-auto mb-3 h-9 w-9 text-text-muted/40" aria-hidden="true" />
          <p className="text-[14px] font-semibold text-text-heading">{t("noResultsTitle")}</p>
          <p className="mt-1 text-[12.5px] text-text-muted">{t("noResultsHint")}</p>
          <button
            type="button"
            onClick={() => setParams({ q: "", audience: "", subject: "", difficulty: "", language: "", sort: "" })}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand/8 px-4 py-2 text-[13px] font-semibold text-brand transition hover:bg-brand/12"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {t("resetFilters")}
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <PathCard key={p.id} path={p} progress={progress?.[p.id] ?? null} />
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

function ContinueCard({ record }: { record: PathProgressRecord }) {
  const t = useTranslations("paths");
  const locale = useLocale();
  const title = locale === "km" && record.title_km ? record.title_km : record.title;
  const pct = progressPercent(record.completedSteps, record.totalSteps);
  return (
    <Link
      href={`/paths/${record.slug}`}
      className="group flex items-center gap-3 rounded-xl border border-brand/20 bg-brand/[0.04] p-3 transition hover:border-brand/40 hover:bg-brand/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
    >
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-paper">
        {record.cover_url ? (
          <Image src={record.cover_url} alt="" fill sizes="48px" className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center"><GraduationCap className="h-5 w-5 text-brand/40" aria-hidden="true" /></div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-bold text-text-heading">{title}</p>
        {record.nextStep && (
          <p className="mt-0.5 truncate text-[11.5px] text-text-muted">
            {t("continueNext", { step: record.nextStep.stepTitle ?? "—" })}
          </p>
        )}
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper">
            <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
          </div>
          <span className="shrink-0 text-[11px] font-semibold text-text-muted tabular-nums">{pct}%</span>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-brand transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
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

          {resourceTypes.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {resourceTypes.map((rt) => (
                <span key={rt} className="rounded-full bg-paper px-2.5 py-0.5 text-[11px] font-semibold text-text-muted">
                  {t(RESOURCE_TYPE_KEY[rt])}
                </span>
              ))}
            </div>
          )}

          <div className="mt-5">
            <Link
              href={`/paths/${detail.slug}`}
              className="btn-brand-gradient inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14px] font-bold text-white shadow-sm"
            >
              {cta}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>

        <div className="relative hidden min-h-[220px] md:block">
          {detail.cover_url ? (
            <Image src={detail.cover_url} alt="" fill sizes="420px" className="object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-brand/8">
              <GraduationCap className="h-16 w-16 text-brand/25" aria-hidden="true" />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ContinueSkeleton() {
  return (
    <div className="mb-8" aria-hidden="true">
      <div className="mb-3 h-4 w-40 animate-pulse rounded bg-paper" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[72px] animate-pulse rounded-xl border border-divider bg-bg-surface" />
        ))}
      </div>
    </div>
  );
}
