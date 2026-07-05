"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, X, SlidersHorizontal } from "lucide-react";
import { getThesisPrograms, getThesisFaculties, type ThesisProgram, type ThesisFaculty } from "@/app/actions/theses";
import type { FacetOption } from "@/components/ui/theses/AdvancedSearchModal";

type Cohort = {
  id: string;
  number: number;
  label: string | null;
  program_code: string;
  sort_order: number;
};

interface Props {
  currentProgram: string;
  currentFaculty: string;
  currentCohort: string;
  currentYear: string;
  currentQ: string;
  currentView: string;
  currentAuthor: string;
  currentAdvisor: string;
  currentKeyword: string;
  visibleCohorts: Cohort[];
  availableYears: string[];
  programCounts: Record<string, number>;
  facultyCounts: Record<string, number>;
  cohortCounts: Record<string, number>;
  yearCounts: Record<string, number>;
  authors: FacetOption[];
  advisors: FacetOption[];
  keywords: FacetOption[];
}

// ── Collapsible section ────────────────────────────────────────────────────────

function FilterSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  return (
    <div className="py-4 border-b border-divider last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full cursor-pointer items-center justify-between rounded-md group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
      >
        <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted transition-colors group-hover:text-text-body">
          {title}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 group-hover:text-text-body ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div id={panelId} className="fade-rise-in mt-3">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Checkbox-style filter row — active state = single-select "checked" ────────

function FilterCheckboxRow({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="checkbox"
      aria-checked={active}
      className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors duration-150 hover:bg-bg-app active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-all duration-150 ${
          active ? "border-brand bg-brand" : "border-divider bg-bg-surface"
        }`}
      >
        <Check
          className={`h-3 w-3 text-brand-contrast transition-transform duration-150 ${active ? "scale-100" : "scale-0"}`}
          strokeWidth={3}
        />
      </span>
      <span className={`min-w-0 flex-1 truncate text-[13px] transition-colors duration-150 ${active ? "font-semibold text-brand" : "text-text-body"}`}>
        {label}
      </span>
      {typeof count === "number" && (
        <span className="shrink-0 text-[11.5px] tabular-nums text-text-muted">{count}</span>
      )}
    </button>
  );
}

/** A checkbox list capped to `initial` rows, with a "Show more" toggle when longer. */
function FacetList({
  options,
  activeValue,
  onToggle,
  initial = 8,
  emptyLabel = "None found",
}: {
  options: FacetOption[];
  activeValue: string;
  onToggle: (value: string) => void;
  initial?: number;
  emptyLabel?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (options.length === 0) {
    return <p className="px-1.5 text-[12.5px] text-text-muted">{emptyLabel}</p>;
  }
  const shown = expanded ? options : options.slice(0, initial);
  return (
    <div className="space-y-0.5">
      {shown.map((opt) => (
        <FilterCheckboxRow
          key={opt.value}
          label={opt.label}
          count={opt.count}
          active={activeValue === opt.value}
          onClick={() => onToggle(opt.value)}
        />
      ))}
      {options.length > initial && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 cursor-pointer rounded-sm px-1.5 text-[12px] font-semibold text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
        >
          {expanded ? "Show less" : `Show all ${options.length}`}
        </button>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function dedupeByNumber(cohorts: Cohort[]): Cohort[] {
  const seen = new Set<number>();
  return cohorts.filter((c) => {
    if (seen.has(c.number)) return false;
    seen.add(c.number);
    return true;
  });
}

// ── Filter panel content (shared between desktop + mobile) ─────────────────────

function FilterPanel({
  currentProgram,
  currentFaculty,
  currentCohort,
  currentYear,
  currentAuthor,
  currentAdvisor,
  currentKeyword,
  visibleCohorts,
  availableYears,
  programCounts,
  facultyCounts,
  cohortCounts,
  yearCounts,
  authors,
  advisors,
  keywords,
  hasFilters,
  onNav,
  programs,
  faculties,
}: Omit<Props, "currentQ" | "currentView"> & {
  hasFilters: boolean;
  onNav: (overrides: Record<string, string | undefined>) => void;
  programs: ThesisProgram[];
  faculties: ThesisFaculty[];
}) {
  const facultyOptions = faculties.filter((f) => f.program_code === currentProgram);

  return (
    <div className="px-4">
      {/* Clear all */}
      {hasFilters && (
        <div className="flex items-center justify-between py-3 border-b border-divider">
          <span className="text-xs text-text-muted">Filters applied</span>
          <button
            type="button"
            onClick={() =>
              onNav({
                program: undefined,
                faculty: undefined,
                cohort: undefined,
                year: undefined,
                author: undefined,
                advisor: undefined,
                keyword: undefined,
              })
            }
            className="flex cursor-pointer items-center gap-1 rounded-sm text-xs text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
          >
            <X className="w-3 h-3" /> Clear all
          </button>
        </div>
      )}

      {/* Program */}
      <FilterSection title="Program">
        <div className="space-y-0.5">
          <FilterCheckboxRow
            label="All Programs"
            active={!currentProgram}
            onClick={() => onNav({ program: undefined, faculty: undefined, cohort: undefined })}
          />
          {programs.map((p) => (
            <FilterCheckboxRow
              key={p.code}
              label={p.name_en}
              count={programCounts[p.code] ?? 0}
              active={currentProgram === p.code}
              onClick={() =>
                onNav({
                  program: currentProgram === p.code ? undefined : p.code,
                  faculty: undefined,
                  cohort: undefined,
                })
              }
            />
          ))}
        </div>
      </FilterSection>

      {/* Faculty — only for programs with faculties */}
      {facultyOptions.length > 0 && (
        <FilterSection title="Faculty">
          <div className="space-y-0.5">
            <FilterCheckboxRow
              label="All Faculties"
              active={!currentFaculty}
              onClick={() => onNav({ faculty: undefined })}
            />
            {facultyOptions.map((f) => (
              <FilterCheckboxRow
                key={f.code}
                label={f.name_en}
                count={facultyCounts[f.code] ?? 0}
                active={currentFaculty === f.code}
                onClick={() => onNav({ faculty: currentFaculty === f.code ? undefined : f.code })}
              />
            ))}
          </div>
        </FilterSection>
      )}

      {/* Cohort — deduplicate by number when no program selected */}
      <FilterSection title="Cohort">
        <div className="space-y-0.5">
          <FilterCheckboxRow
            label="All Cohorts"
            active={!currentCohort}
            onClick={() => onNav({ cohort: undefined })}
          />
          {dedupeByNumber(visibleCohorts).map((c) => (
            <FilterCheckboxRow
              key={c.id}
              label={c.label ?? `Cohort ${c.number}`}
              count={cohortCounts[c.number.toString()] ?? 0}
              active={currentCohort === c.number.toString()}
              onClick={() =>
                onNav({ cohort: currentCohort === c.number.toString() ? undefined : c.number.toString() })
              }
            />
          ))}
        </div>
      </FilterSection>

      {/* Academic Year */}
      {availableYears.length > 0 && (
        <FilterSection title="Published Year" defaultOpen={false}>
          <div className="space-y-0.5">
            <FilterCheckboxRow
              label="Any Year"
              active={!currentYear}
              onClick={() => onNav({ year: undefined })}
            />
            {availableYears.map((y) => (
              <FilterCheckboxRow
                key={y}
                label={y}
                count={yearCounts[y] ?? 0}
                active={currentYear === y}
                onClick={() => onNav({ year: currentYear === y ? undefined : y })}
              />
            ))}
          </div>
        </FilterSection>
      )}

      {/* Author */}
      <FilterSection title="Author" defaultOpen={false}>
        <FacetList
          options={authors}
          activeValue={currentAuthor}
          onToggle={(v) => onNav({ author: currentAuthor === v ? undefined : v })}
        />
      </FilterSection>

      {/* Advisor */}
      <FilterSection title="Advisor" defaultOpen={false}>
        <FacetList
          options={advisors}
          activeValue={currentAdvisor}
          onToggle={(v) => onNav({ advisor: currentAdvisor === v ? undefined : v })}
        />
      </FilterSection>

      {/* Keyword */}
      <FilterSection title="Keyword" defaultOpen={false}>
        <FacetList
          options={keywords}
          activeValue={currentKeyword}
          onToggle={(v) => onNav({ keyword: currentKeyword === v ? undefined : v })}
        />
      </FilterSection>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────

export default function ThesisSidebar({
  currentProgram,
  currentFaculty,
  currentCohort,
  currentYear,
  currentQ,
  currentView,
  currentAuthor,
  currentAdvisor,
  currentKeyword,
  visibleCohorts,
  availableYears,
  programCounts,
  facultyCounts,
  cohortCounts,
  yearCounts,
  authors,
  advisors,
  keywords,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [mobileOpen, setMobileOpen] = useState(false);

  const [programs, setPrograms] = useState<ThesisProgram[]>([]);
  const [faculties, setFaculties] = useState<ThesisFaculty[]>([]);

  useEffect(() => {
    getThesisPrograms().then(({ data }) => setPrograms(data ?? []));
    getThesisFaculties().then(({ data }) => setFaculties(data ?? []));
  }, []);

  const hasFilters = !!(
    currentProgram ||
    currentFaculty ||
    currentCohort ||
    currentYear ||
    currentAuthor ||
    currentAdvisor ||
    currentKeyword
  );
  const activeCount = [
    currentProgram,
    currentFaculty,
    currentCohort,
    currentYear,
    currentAuthor,
    currentAdvisor,
    currentKeyword,
  ].filter(Boolean).length;

  const nav = (overrides: Record<string, string | undefined>) => {
    const next: Record<string, string> = {};
    if (currentQ) next.q = currentQ;
    if (currentView) next.view = currentView;
    if (currentProgram) next.program = currentProgram;
    if (currentFaculty) next.faculty = currentFaculty;
    if (currentCohort) next.cohort = currentCohort;
    if (currentYear) next.year = currentYear;
    if (currentAuthor) next.author = currentAuthor;
    if (currentAdvisor) next.advisor = currentAdvisor;
    if (currentKeyword) next.keyword = currentKeyword;

    for (const [k, v] of Object.entries(overrides)) {
      if (v) next[k] = v;
      else delete next[k];
    }

    const qs = new URLSearchParams(next).toString();
    setMobileOpen(false);
    startTransition(() => {
      router.push(`/theses${qs ? `?${qs}` : ""}`, { scroll: false });
    });
  };

  const panelProps = {
    currentProgram,
    currentFaculty,
    currentCohort,
    currentYear,
    currentAuthor,
    currentAdvisor,
    currentKeyword,
    visibleCohorts,
    availableYears,
    programCounts,
    facultyCounts,
    cohortCounts,
    yearCounts,
    authors,
    advisors,
    keywords,
    hasFilters,
    onNav: nav,
    programs,
    faculties,
  };

  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────────────────────── */}
      <aside className="hidden lg:block w-72 shrink-0 sticky top-4 self-start max-h-[calc(100vh-2rem)] overflow-y-auto">
        <div className="bg-bg-surface rounded-2xl border border-divider overflow-hidden shadow-sm">
          <FilterPanel {...panelProps} />
        </div>
      </aside>

      {/* ── Mobile: floating filter button ──────────────────────────── */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={mobileOpen}
        className="lg:hidden fixed bottom-5 right-4 z-20 flex cursor-pointer items-center gap-2 rounded-full bg-brand px-4 py-3 text-sm font-semibold text-white shadow-xl transition-transform duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      >
        <SlidersHorizontal className="w-4 h-4" />
        Filters
        {activeCount > 0 && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] font-bold leading-none text-brand">
            {activeCount}
          </span>
        )}
      </button>

      {/* ── Mobile: drawer overlay ──────────────────────────────────── */}
      {mobileOpen && (
        <>
          <div
            className="modal-backdrop-in lg:hidden fixed inset-0 z-30 bg-black/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Filters"
            className="drawer-slide-in lg:hidden fixed left-0 top-0 bottom-0 z-40 w-72 overflow-y-auto bg-bg-surface shadow-2xl"
          >
            <div className="flex items-center justify-between px-4 py-4 border-b border-divider">
              <h2 className="font-bold text-text-heading">Filters</h2>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close filters"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
              >
                <X className="w-5 h-5 text-text-muted" />
              </button>
            </div>
            <FilterPanel {...panelProps} />
          </div>
        </>
      )}
    </>
  );
}
