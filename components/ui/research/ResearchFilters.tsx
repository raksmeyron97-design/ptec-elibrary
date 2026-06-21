"use client";

/* eslint-disable @typescript-eslint/no-unused-vars */

import { useRouter, useSearchParams } from "next/navigation";
import { X, ChevronDown } from "lucide-react";

export default function ResearchFilters({
  departments,
  uniqueCohorts,
  uniqueYears,
}: {
  departments: { id: string; name: string }[];
  uniqueCohorts: string[];
  uniqueYears: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentDept = searchParams.get("dept") || "";
  const currentCohort = searchParams.get("cohort") || "";
  const currentYear = searchParams.get("year") || "";

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/research?${params.toString()}`);
  };

  const hasFilters = !!(currentDept || currentCohort || currentYear);

  const selectClass =
    "cursor-pointer appearance-none bg-transparent py-2 pl-3 pr-8 text-[13px] text-text-body outline-none";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Department */}
      <div className="relative flex items-center overflow-hidden rounded-xl border border-divider bg-bg-surface shadow-sm transition-colors focus-within:border-brand/50">
        <span className="shrink-0 pl-3 text-[11px] font-bold uppercase tracking-wider text-text-muted">
          Dept
        </span>
        <select
          className={selectClass}
          value={currentDept}
          onChange={(e) => updateFilter("dept", e.target.value)}
        >
          <option value="">All</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-text-muted" />
      </div>

      {/* Cohort */}
      <div className="relative flex items-center overflow-hidden rounded-xl border border-divider bg-bg-surface shadow-sm transition-colors focus-within:border-brand/50">
        <span className="shrink-0 pl-3 text-[11px] font-bold uppercase tracking-wider text-text-muted">
          Cohort
        </span>
        <select
          className={selectClass}
          value={currentCohort}
          onChange={(e) => updateFilter("cohort", e.target.value)}
        >
          <option value="">All</option>
          {uniqueCohorts.map((c) => (
            <option key={c} value={c}>
              C{c}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-text-muted" />
      </div>

      {/* Year */}
      <div className="relative flex items-center overflow-hidden rounded-xl border border-divider bg-bg-surface shadow-sm transition-colors focus-within:border-brand/50">
        <span className="shrink-0 pl-3 text-[11px] font-bold uppercase tracking-wider text-text-muted">
          Year
        </span>
        <select
          className={selectClass}
          value={currentYear}
          onChange={(e) => updateFilter("year", e.target.value)}
        >
          <option value="">All</option>
          {uniqueYears.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-text-muted" />
      </div>

      {/* Clear filters */}
      {hasFilters && (
        <button
          onClick={() => router.push("/research")}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-divider bg-bg-surface px-3 py-2 text-[12.5px] font-semibold text-text-muted shadow-sm transition-colors hover:border-danger/40 hover:text-danger"
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </button>
      )}
    </div>
  );
}
