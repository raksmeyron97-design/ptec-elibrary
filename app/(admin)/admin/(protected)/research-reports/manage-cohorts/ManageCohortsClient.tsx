"use client"
 
;
/* eslint-disable @typescript-eslint/no-unused-vars */


import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  addResearchCohort,
  updateResearchCohort,
  deleteResearchCohort,
  addResearchAcademicYear,
  updateResearchAcademicYear,
  deleteResearchAcademicYear,
  type ResearchCohort,
  type ResearchAcademicYear,
} from "@/app/actions/research";
import { PROGRAMS } from "@/lib/research/programs";
import { Plus, Pencil, Trash2, Check, X, ChevronDown, ChevronRight, Loader2 } from "lucide-react";

interface Props {
  initialCohorts: ResearchCohort[];
  initialYears: ResearchAcademicYear[];
}

const INPUT_CLASS =
  "h-9 rounded-lg border border-divider bg-bg-surface px-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15";

export default function ManageCohortsClient({ initialCohorts, initialYears }: Props) {
  const router = useRouter();
  const [cohorts, setCohorts] = useState<ResearchCohort[]>(initialCohorts);
  const [years, setYears] = useState<ResearchAcademicYear[]>(initialYears);

  // Add cohort
  const [addingCohortFor, setAddingCohortFor] = useState<string | null>(null); // program_code
  const [newCohortNum, setNewCohortNum] = useState("");
  const [newCohortLabel, setNewCohortLabel] = useState("");
  const [cohortAddErr, setCohortAddErr] = useState("");
  const [cohortAddLoading, setCohortAddLoading] = useState(false);

  // Edit cohort
  const [editCohortId, setEditCohortId] = useState<string | null>(null);
  const [editCohortLabel, setEditCohortLabel] = useState("");
  const [editCohortLoading, setEditCohortLoading] = useState(false);

  // Delete cohort
  const [deleteCohortId, setDeleteCohortId] = useState<string | null>(null);
  const [deleteCohortLoading, setDeleteCohortLoading] = useState(false);

  // Expand/collapse cohort to show years
  const [expandedCohortId, setExpandedCohortId] = useState<string | null>(null);

  // Add year
  const [addingYearFor, setAddingYearFor] = useState<string | null>(null); // cohort_id
  const [newYearLabel, setNewYearLabel] = useState("");
  const [yearAddErr, setYearAddErr] = useState("");
  const [yearAddLoading, setYearAddLoading] = useState(false);

  // Edit year
  const [editYearId, setEditYearId] = useState<string | null>(null);
  const [editYearLabel, setEditYearLabel] = useState("");
  const [editYearLoading, setEditYearLoading] = useState(false);

  // Delete year
  const [deleteYearId, setDeleteYearId] = useState<string | null>(null);
  const [deleteYearLoading, setDeleteYearLoading] = useState(false);

  const [globalError, setGlobalError] = useState("");

  function refresh() {
    router.refresh();
  }

  // ── Cohort actions ─────────────────────────────────────────────────────────

  async function handleAddCohort(programCode: string) {
    const num = parseInt(newCohortNum.trim(), 10);
    if (isNaN(num) || num < 1) {
      setCohortAddErr("Enter a valid cohort number (≥ 1).");
      return;
    }
    setCohortAddLoading(true);
    setCohortAddErr("");
    const { data, error } = await addResearchCohort({
      programCode,
      number: num,
      label: newCohortLabel.trim() || undefined,
    });
    setCohortAddLoading(false);
    if (error) { setCohortAddErr(error); return; }
    if (data) {
      setCohorts((prev) => [...prev, data].sort((a, b) => a.sort_order - b.sort_order));
    }
    setAddingCohortFor(null);
    setNewCohortNum("");
    setNewCohortLabel("");
    refresh();
  }

  async function handleUpdateCohort(id: string) {
    setEditCohortLoading(true);
    const { error } = await updateResearchCohort(id, { label: editCohortLabel.trim() || null });
    setEditCohortLoading(false);
    if (error) { setGlobalError(error); return; }
    setCohorts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, label: editCohortLabel.trim() || null } : c))
    );
    setEditCohortId(null);
    refresh();
  }

  async function handleDeleteCohort(id: string) {
    setDeleteCohortLoading(true);
    const { error } = await deleteResearchCohort(id);
    setDeleteCohortLoading(false);
    if (error) { setGlobalError(error); return; }
    setCohorts((prev) => prev.filter((c) => c.id !== id));
    setYears((prev) => prev.filter((y) => y.cohort_id !== id));
    setDeleteCohortId(null);
    if (expandedCohortId === id) setExpandedCohortId(null);
    refresh();
  }

  // ── Year actions ───────────────────────────────────────────────────────────

  async function handleAddYear(cohortId: string) {
    const label = newYearLabel.trim();
    if (!label) { setYearAddErr("Year label is required."); return; }
    setYearAddLoading(true);
    setYearAddErr("");
    const { data, error } = await addResearchAcademicYear({ cohortId, label });
    setYearAddLoading(false);
    if (error) { setYearAddErr(error); return; }
    if (data) setYears((prev) => [...prev, data]);
    setAddingYearFor(null);
    setNewYearLabel("");
    refresh();
  }

  async function handleUpdateYear(id: string) {
    const label = editYearLabel.trim();
    if (!label) return;
    setEditYearLoading(true);
    const { error } = await updateResearchAcademicYear(id, { label });
    setEditYearLoading(false);
    if (error) { setGlobalError(error); return; }
    setYears((prev) => prev.map((y) => (y.id === id ? { ...y, label } : y)));
    setEditYearId(null);
    refresh();
  }

  async function handleDeleteYear(id: string) {
    setDeleteYearLoading(true);
    const { error } = await deleteResearchAcademicYear(id);
    setDeleteYearLoading(false);
    if (error) { setGlobalError(error); return; }
    setYears((prev) => prev.filter((y) => y.id !== id));
    setDeleteYearId(null);
    refresh();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {globalError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {globalError}
          <button onClick={() => setGlobalError("")} className="ml-2 font-semibold underline">
            Dismiss
          </button>
        </div>
      )}

      {PROGRAMS.map((prog) => {
        const progCohorts = cohorts
          .filter((c) => c.program_code === prog.code)
          .sort((a, b) => a.sort_order - b.sort_order);

        return (
          <section
            key={prog.code}
            className="rounded-xl border border-divider bg-bg-surface overflow-hidden"
          >
            {/* Program header */}
            <div className="flex items-center justify-between gap-4 bg-paper px-5 py-3 border-b border-divider">
              <div>
                <h2 className="text-sm font-bold text-text-heading">{prog.nameEn}</h2>
                <p className="text-xs text-text-muted">{prog.nameKm}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAddingCohortFor(prog.code);
                  setNewCohortNum("");
                  setNewCohortLabel("");
                  setCohortAddErr("");
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-divider bg-bg-surface px-3 py-1.5 text-xs font-medium text-brand hover:bg-brand/5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add Cohort
              </button>
            </div>

            {/* Add cohort form */}
            {addingCohortFor === prog.code && (
              <div className="px-5 py-3 border-b border-divider bg-brand/5">
                <p className="text-xs font-semibold text-text-body mb-2">New cohort for {prog.nameEn}</p>
                <div className="flex flex-wrap gap-2 items-start">
                  <div>
                    <input
                      type="number"
                      min={1}
                      value={newCohortNum}
                      onChange={(e) => setNewCohortNum(e.target.value)}
                      placeholder="Cohort number *"
                      className={`${INPUT_CLASS} w-36`}
                      autoFocus
                    />
                  </div>
                  <input
                    type="text"
                    value={newCohortLabel}
                    onChange={(e) => setNewCohortLabel(e.target.value)}
                    placeholder="Display label (optional)"
                    className={`${INPUT_CLASS} w-48`}
                  />
                  <button
                    type="button"
                    onClick={() => handleAddCohort(prog.code)}
                    disabled={cohortAddLoading}
                    className="inline-flex items-center gap-1.5 h-9 rounded-lg bg-brand px-3 text-xs font-medium text-white hover:bg-brand/90 disabled:opacity-50"
                  >
                    {cohortAddLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAddingCohortFor(null); setCohortAddErr(""); }}
                    className="inline-flex items-center h-9 rounded-lg border border-divider px-3 text-xs font-medium text-text-muted hover:bg-paper"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                {cohortAddErr && <p className="mt-1.5 text-xs text-red-600">{cohortAddErr}</p>}
              </div>
            )}

            {/* Cohorts list */}
            {progCohorts.length === 0 ? (
              <p className="px-5 py-4 text-sm text-text-muted italic">No cohorts yet. Add one above.</p>
            ) : (
              <ul className="divide-y divide-divider">
                {progCohorts.map((cohort) => {
                  const cohortYears = years
                    .filter((y) => y.cohort_id === cohort.id)
                    .sort((a, b) => a.sort_order - b.sort_order);
                  const isExpanded = expandedCohortId === cohort.id;
                  const displayLabel = cohort.label ?? `Cohort ${cohort.number}`;

                  return (
                    <li key={cohort.id}>
                      {/* Cohort row */}
                      <div className="flex items-center gap-3 px-5 py-3 hover:bg-paper/50 transition-colors">
                        {/* Expand toggle */}
                        <button
                          type="button"
                          onClick={() => setExpandedCohortId(isExpanded ? null : cohort.id)}
                          className="text-text-muted hover:text-brand transition-colors"
                          title={isExpanded ? "Collapse" : "Expand"}
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>

                        {/* Edit cohort inline */}
                        {editCohortId === cohort.id ? (
                          <div className="flex flex-1 items-center gap-2">
                            <input
                              type="text"
                              value={editCohortLabel}
                              onChange={(e) => setEditCohortLabel(e.target.value)}
                              placeholder="Display label (blank = use number)"
                              className={`${INPUT_CLASS} flex-1 max-w-xs`}
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => handleUpdateCohort(cohort.id)}
                              disabled={editCohortLoading}
                              className="inline-flex items-center gap-1 h-9 rounded-lg bg-brand px-3 text-xs font-medium text-white hover:bg-brand/90 disabled:opacity-50"
                            >
                              {editCohortLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditCohortId(null)}
                              className="inline-flex items-center h-9 rounded-lg border border-divider px-3 text-xs text-text-muted hover:bg-paper"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-1 items-center gap-3 min-w-0">
                            <span className="text-sm font-medium text-text-heading">
                              ជំនាន់ទី {cohort.number}
                            </span>
                            {cohort.label && (
                              <span className="text-xs text-text-muted truncate">({cohort.label})</span>
                            )}
                            <span className="ml-auto text-xs text-text-muted shrink-0">
                              {cohortYears.length} year{cohortYears.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                        )}

                        {/* Actions (hidden during edit mode) */}
                        {editCohortId !== cohort.id && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setEditCohortId(cohort.id);
                                setEditCohortLabel(cohort.label ?? "");
                              }}
                              className="text-text-muted hover:text-brand transition-colors"
                              title="Edit label"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>

                            {deleteCohortId === cohort.id ? (
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-text-muted">Delete + all years?</span>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCohort(cohort.id)}
                                  disabled={deleteCohortLoading}
                                  className="rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                                >
                                  {deleteCohortLoading ? "…" : "Yes"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteCohortId(null)}
                                  className="rounded border border-divider px-2 py-0.5 text-xs font-semibold text-text-body hover:bg-paper"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setDeleteCohortId(cohort.id)}
                                className="text-text-muted hover:text-red-500 transition-colors"
                                title="Delete cohort"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Academic years (expanded) */}
                      {isExpanded && (
                        <div className="border-t border-divider bg-paper/50 px-8 py-3 space-y-2">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                              Academic Years
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                setAddingYearFor(cohort.id);
                                setNewYearLabel("");
                                setYearAddErr("");
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-divider bg-bg-surface px-2.5 py-1 text-xs font-medium text-brand hover:bg-brand/5 transition-colors"
                            >
                              <Plus className="w-3 h-3" /> Add Year
                            </button>
                          </div>

                          {/* Add year form */}
                          {addingYearFor === cohort.id && (
                            <div className="flex flex-wrap gap-2 items-start pb-2">
                              <input
                                type="text"
                                value={newYearLabel}
                                onChange={(e) => setNewYearLabel(e.target.value)}
                                placeholder="e.g. 2025-2026"
                                className={`${INPUT_CLASS} w-40`}
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => handleAddYear(cohort.id)}
                                disabled={yearAddLoading}
                                className="inline-flex items-center gap-1 h-9 rounded-lg bg-brand px-3 text-xs font-medium text-white hover:bg-brand/90 disabled:opacity-50"
                              >
                                {yearAddLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => { setAddingYearFor(null); setYearAddErr(""); }}
                                className="inline-flex items-center h-9 rounded-lg border border-divider px-3 text-xs text-text-muted hover:bg-paper"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                              {yearAddErr && <p className="w-full text-xs text-red-600">{yearAddErr}</p>}
                            </div>
                          )}

                          {cohortYears.length === 0 ? (
                            <p className="text-xs text-text-muted italic">No academic years yet.</p>
                          ) : (
                            <ul className="space-y-1">
                              {cohortYears.map((yr) => (
                                <li key={yr.id} className="flex items-center gap-3">
                                  {editYearId === yr.id ? (
                                    <div className="flex flex-1 items-center gap-2">
                                      <input
                                        type="text"
                                        value={editYearLabel}
                                        onChange={(e) => setEditYearLabel(e.target.value)}
                                        className={`${INPUT_CLASS} w-40`}
                                        autoFocus
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateYear(yr.id)}
                                        disabled={editYearLoading}
                                        className="inline-flex items-center gap-1 h-9 rounded-lg bg-brand px-3 text-xs font-medium text-white hover:bg-brand/90 disabled:opacity-50"
                                      >
                                        {editYearLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditYearId(null)}
                                        className="inline-flex items-center h-9 rounded-lg border border-divider px-3 text-xs text-text-muted hover:bg-paper"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  ) : (
                                    <>
                                      <span className="text-sm text-text-body flex-1">{yr.label}</span>
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => { setEditYearId(yr.id); setEditYearLabel(yr.label); }}
                                          className="text-text-muted hover:text-brand transition-colors"
                                          title="Edit"
                                        >
                                          <Pencil className="w-3.5 h-3.5" />
                                        </button>
                                        {deleteYearId === yr.id ? (
                                          <div className="flex items-center gap-1">
                                            <span className="text-xs text-text-muted">Delete?</span>
                                            <button
                                              type="button"
                                              onClick={() => handleDeleteYear(yr.id)}
                                              disabled={deleteYearLoading}
                                              className="rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                                            >
                                              {deleteYearLoading ? "…" : "Yes"}
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setDeleteYearId(null)}
                                              className="rounded border border-divider px-2 py-0.5 text-xs font-semibold text-text-body hover:bg-paper"
                                            >
                                              No
                                            </button>
                                          </div>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => setDeleteYearId(yr.id)}
                                            className="text-text-muted hover:text-red-500 transition-colors"
                                            title="Delete"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    </>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
