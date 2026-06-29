"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, X, SlidersHorizontal } from "lucide-react";
import { PROGRAMS, getFacultiesForProgram } from "@/lib/research/programs";

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
  visibleCohorts: Cohort[];
  availableYears: string[];
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
  return (
    <div className="py-4 border-b border-divider last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full group"
      >
        <span className="text-sm font-bold text-text-heading">{title}</span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-text-muted group-hover:text-text-body transition" />
        ) : (
          <ChevronDown className="w-4 h-4 text-text-muted group-hover:text-text-body transition" />
        )}
      </button>
      {open && <div className="mt-3 space-y-1">{children}</div>}
    </div>
  );
}

// ── Radio-style filter item ────────────────────────────────────────────────────

function RadioItem({
  label,
  active,
  onClick,
  count,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-between w-full py-1 group text-left"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className={`w-[18px] h-[18px] rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
            active ? "border-brand" : "border-gray-300 group-hover:border-brand/50"
          }`}
        >
          {active && <span className="w-2 h-2 rounded-full bg-brand" />}
        </span>
        <span
          className={`text-sm leading-snug truncate transition-colors ${
            active
              ? "text-text-heading font-semibold"
              : "text-text-body group-hover:text-text-heading"
          }`}
        >
          {label}
        </span>
      </div>
      {count !== undefined && (
        <span className="text-xs text-text-muted ml-2 shrink-0">{count}</span>
      )}
    </button>
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
  visibleCohorts,
  availableYears,
  hasFilters,
  onNav,
}: {
  currentProgram: string;
  currentFaculty: string;
  currentCohort: string;
  currentYear: string;
  visibleCohorts: Cohort[];
  availableYears: string[];
  hasFilters: boolean;
  onNav: (overrides: Record<string, string | undefined>) => void;
}) {
  const facultyOptions = getFacultiesForProgram(currentProgram);

  return (
    <div className="px-4">
      {/* Clear all */}
      {hasFilters && (
        <div className="flex items-center justify-between py-3 border-b border-divider">
          <span className="text-xs text-text-muted">Filters applied</span>
          <button
            type="button"
            onClick={() =>
              onNav({ program: undefined, faculty: undefined, cohort: undefined, year: undefined })
            }
            className="text-xs text-brand hover:underline flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Clear all
          </button>
        </div>
      )}

      {/* Program */}
      <FilterSection title="Program">
        <RadioItem
          label="All Programs"
          active={!currentProgram}
          onClick={() => onNav({ program: undefined, faculty: undefined, cohort: undefined })}
        />
        {PROGRAMS.map((p) => (
          <RadioItem
            key={p.code}
            label={p.nameEn}
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
      </FilterSection>

      {/* Faculty — only for B.Ed (12+4) */}
      {facultyOptions.length > 0 && (
        <FilterSection title="Faculty">
          <RadioItem
            label="All Faculties"
            active={!currentFaculty}
            onClick={() => onNav({ faculty: undefined })}
          />
          {facultyOptions.map((f) => (
            <RadioItem
              key={f.code}
              label={f.nameEn}
              active={currentFaculty === f.code}
              onClick={() =>
                onNav({ faculty: currentFaculty === f.code ? undefined : f.code })
              }
            />
          ))}
        </FilterSection>
      )}

      {/* Cohort — deduplicate by number when no program selected */}
      <FilterSection title="Cohort">
        <RadioItem
          label="All Cohorts"
          active={!currentCohort}
          onClick={() => onNav({ cohort: undefined })}
        />
        {dedupeByNumber(visibleCohorts).map((c) => (
          <RadioItem
            key={c.id}
            label={c.label ?? `Cohort ${c.number}`}
            active={currentCohort === c.number.toString()}
            onClick={() =>
              onNav({
                cohort: currentCohort === c.number.toString() ? undefined : c.number.toString(),
              })
            }
          />
        ))}
      </FilterSection>

      {/* Academic Year */}
      {availableYears.length > 0 && (
        <FilterSection title="Published Year" defaultOpen={false}>
          <select
            value={currentYear}
            onChange={(e) => onNav({ year: e.target.value || undefined })}
            className="w-full h-9 border border-divider rounded-lg px-3 text-sm text-text-body bg-bg-surface outline-none focus:border-brand transition mt-1"
          >
            <option value="">Select Year</option>
            {availableYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </FilterSection>
      )}
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────

export default function ResearchSidebar({
  currentProgram,
  currentFaculty,
  currentCohort,
  currentYear,
  currentQ,
  currentView,
  visibleCohorts,
  availableYears,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [mobileOpen, setMobileOpen] = useState(false);

  const hasFilters = !!(currentProgram || currentFaculty || currentCohort || currentYear);
  const activeCount = [currentProgram, currentFaculty, currentCohort, currentYear].filter(Boolean).length;

  const nav = (overrides: Record<string, string | undefined>) => {
    const next: Record<string, string> = {};
    if (currentQ) next.q = currentQ;
    if (currentView) next.view = currentView;
    if (currentProgram) next.program = currentProgram;
    if (currentFaculty) next.faculty = currentFaculty;
    if (currentCohort) next.cohort = currentCohort;
    if (currentYear) next.year = currentYear;

    for (const [k, v] of Object.entries(overrides)) {
      if (v) next[k] = v;
      else delete next[k];
    }

    const qs = new URLSearchParams(next).toString();
    setMobileOpen(false);
    startTransition(() => {
      router.push(`/research${qs ? `?${qs}` : ""}`, { scroll: false });
    });
  };

  const panelProps = {
    currentProgram,
    currentFaculty,
    currentCohort,
    currentYear,
    visibleCohorts,
    availableYears,
    hasFilters,
    onNav: nav,
  };

  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────────────────────── */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-4 self-start">
        <div className="bg-bg-surface rounded-xl border border-divider overflow-hidden">
          <FilterPanel {...panelProps} />
        </div>
      </aside>

      {/* ── Mobile: floating filter button ──────────────────────────── */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed bottom-5 right-4 z-20 flex items-center gap-2 bg-brand text-white px-4 py-3 rounded-full shadow-xl text-sm font-semibold"
      >
        <SlidersHorizontal className="w-4 h-4" />
        Filters
        {activeCount > 0 && (
          <span className="bg-white text-brand text-[11px] font-bold rounded-full w-5 h-5 flex items-center justify-center leading-none">
            {activeCount}
          </span>
        )}
      </button>

      {/* ── Mobile: drawer overlay ──────────────────────────────────── */}
      {mobileOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 bg-black/40 z-30 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="lg:hidden fixed left-0 top-0 bottom-0 w-72 bg-bg-surface z-40 overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between px-4 py-4 border-b border-divider">
              <h2 className="font-bold text-text-heading">Filters</h2>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-paper transition"
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
