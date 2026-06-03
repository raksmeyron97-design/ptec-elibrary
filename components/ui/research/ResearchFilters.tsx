"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FilterLink } from "@/components/ui/books/ClientNavWrapper";

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

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-text-muted font-medium uppercase tracking-wider">Department</span>
        <div className="flex bg-bg-app border border-divider rounded-lg overflow-hidden">
          <select 
            className="bg-transparent px-3 py-2 text-sm text-text-body outline-none min-w-[150px]"
            value={currentDept}
            onChange={(e) => updateFilter("dept", e.target.value)}
          >
            <option value="">All Departments</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[11px] text-text-muted font-medium uppercase tracking-wider">Cohort</span>
        <div className="flex bg-bg-app border border-divider rounded-lg overflow-hidden">
          <select 
            className="bg-transparent px-3 py-2 text-sm text-text-body outline-none"
            value={currentCohort}
            onChange={(e) => updateFilter("cohort", e.target.value)}
          >
            <option value="">All</option>
            {uniqueCohorts.map(c => <option key={c} value={c}>C{c}</option>)}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[11px] text-text-muted font-medium uppercase tracking-wider">Year</span>
        <div className="flex bg-bg-app border border-divider rounded-lg overflow-hidden">
          <select 
            className="bg-transparent px-3 py-2 text-sm text-text-body outline-none"
            value={currentYear}
            onChange={(e) => updateFilter("year", e.target.value)}
          >
            <option value="">All</option>
            {uniqueYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {hasFilters && (
        <button
          onClick={() => router.push("/research")}
          className="text-xs font-medium text-brand hover:underline ml-2"
        >
          Clear Filters
        </button>
      )}
    </div>
  );
}
