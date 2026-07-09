"use client";

import { useState } from "react";
import { Settings2 } from "lucide-react";
import ProgramCohortFields, { type CascadeValues } from "@/app/(admin)/admin/(protected)/theses/_components/ProgramCohortFields";
import CohortYearManager from "@/components/admin/theses/cohorts/CohortYearManager";

export default function ClassificationStep({
  defaultValues,
  onChange,
}: {
  defaultValues?: {
    program?: string | null;
    faculty?: string | null;
    subject?: string | null;
    cohort?: string | null;
    academicYear?: string | null;
  };
  onChange: (values: CascadeValues) => void;
}) {
  const [managerOpen, setManagerOpen] = useState(false);
  // Bumped on close so ProgramCohortFields remounts and refetches — it only
  // loads its lookup lists once on mount, so cohorts/years added in the
  // modal wouldn't otherwise show up until the whole page reloads.
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 rounded-lg border border-divider bg-paper/50 p-3">
        <p className="text-xs text-text-muted">
          Classification controls how this thesis appears on the public thesis page and summary index.
        </p>
        <button
          type="button"
          onClick={() => setManagerOpen(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-divider bg-bg-surface px-3 py-1.5 text-xs font-semibold text-text-body hover:bg-paper"
        >
          <Settings2 className="h-3.5 w-3.5" /> Manage Cohorts &amp; Years
        </button>
      </div>

      <ProgramCohortFields key={refreshKey} defaultValues={defaultValues} onChange={onChange} />

      {managerOpen && (
        <CohortYearManager onClose={() => { setManagerOpen(false); setRefreshKey((k) => k + 1); }} />
      )}
    </div>
  );
}
