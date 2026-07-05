"use client"
 
;
/* eslint-disable @typescript-eslint/no-unused-vars */


import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  addThesisCohort,
  updateThesisCohort,
  deleteThesisCohort,
  addThesisAcademicYear,
  updateThesisAcademicYear,
  deleteThesisAcademicYear,
  addThesisProgram,
  updateThesisProgram,
  deleteThesisProgram,
  addThesisFaculty,
  updateThesisFaculty,
  deleteThesisFaculty,
  type ThesisProgram,
  type ThesisFaculty,
  type ThesisCohort,
  type ThesisAcademicYear,
} from "@/app/actions/theses";
import { Plus, Pencil, Trash2, Check, X, ChevronDown, ChevronRight, Loader2 } from "lucide-react";

interface Props {
  initialPrograms: ThesisProgram[];
  initialFaculties: ThesisFaculty[];
  initialCohorts: ThesisCohort[];
  initialYears: ThesisAcademicYear[];
}

const INPUT_CLASS =
  "h-9 rounded-lg border border-divider bg-bg-surface px-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15";

export default function ManageCohortsClient({ initialPrograms, initialFaculties, initialCohorts, initialYears }: Props) {
  const router = useRouter();
  const [programs, setPrograms] = useState<ThesisProgram[]>(initialPrograms);
  const [faculties, setFaculties] = useState<ThesisFaculty[]>(initialFaculties);
  const [cohorts, setCohorts] = useState<ThesisCohort[]>(initialCohorts);
  const [years, setYears] = useState<ThesisAcademicYear[]>(initialYears);

  // ── Program CRUD state ─────────────────────────────────────────────────────
  const [addingProgram, setAddingProgram] = useState(false);
  const [newProgCode, setNewProgCode] = useState("");
  const [newProgNameEn, setNewProgNameEn] = useState("");
  const [newProgNameKm, setNewProgNameKm] = useState("");
  const [newProgDuration, setNewProgDuration] = useState("4");
  const [newProgHasFaculty, setNewProgHasFaculty] = useState(false);
  const [progAddErr, setProgAddErr] = useState("");
  const [progAddLoading, setProgAddLoading] = useState(false);

  const [editProgId, setEditProgId] = useState<string | null>(null);
  const [editProgNameEn, setEditProgNameEn] = useState("");
  const [editProgNameKm, setEditProgNameKm] = useState("");
  const [editProgLoading, setEditProgLoading] = useState(false);

  const [deleteProgId, setDeleteProgId] = useState<string | null>(null);
  const [deleteProgLoading, setDeleteProgLoading] = useState(false);

  // ── Faculty CRUD state ─────────────────────────────────────────────────────
  const [addingFacultyFor, setAddingFacultyFor] = useState<string | null>(null); // program code
  const [newFacCode, setNewFacCode] = useState("");
  const [newFacNameEn, setNewFacNameEn] = useState("");
  const [newFacNameKm, setNewFacNameKm] = useState("");
  const [newFacHasSubject, setNewFacHasSubject] = useState(false);
  const [facAddErr, setFacAddErr] = useState("");
  const [facAddLoading, setFacAddLoading] = useState(false);

  const [editFacId, setEditFacId] = useState<string | null>(null);
  const [editFacNameEn, setEditFacNameEn] = useState("");
  const [editFacNameKm, setEditFacNameKm] = useState("");
  const [editFacLoading, setEditFacLoading] = useState(false);

  const [deleteFacId, setDeleteFacId] = useState<string | null>(null);
  const [deleteFacLoading, setDeleteFacLoading] = useState(false);

  // ── Cohort CRUD state ─────────────────────────────────────────────────────
  const [addingCohortFor, setAddingCohortFor] = useState<string | null>(null); // program_code
  const [newCohortNum, setNewCohortNum] = useState("");
  const [newCohortLabel, setNewCohortLabel] = useState("");
  const [cohortAddErr, setCohortAddErr] = useState("");
  const [cohortAddLoading, setCohortAddLoading] = useState(false);

  const [editCohortId, setEditCohortId] = useState<string | null>(null);
  const [editCohortLabel, setEditCohortLabel] = useState("");
  const [editCohortLoading, setEditCohortLoading] = useState(false);

  const [deleteCohortId, setDeleteCohortId] = useState<string | null>(null);
  const [deleteCohortLoading, setDeleteCohortLoading] = useState(false);

  // Expand/collapse
  const [expandedProgCode, setExpandedProgCode] = useState<string | null>(null);
  const [expandedCohortId, setExpandedCohortId] = useState<string | null>(null);

  // Add year
  const [addingYearFor, setAddingYearFor] = useState<string | null>(null); // cohort_id
  const [newYearLabel, setNewYearLabel] = useState("");
  const [yearAddErr, setYearAddErr] = useState("");
  const [yearAddLoading, setYearAddLoading] = useState(false);

  const [editYearId, setEditYearId] = useState<string | null>(null);
  const [editYearLabel, setEditYearLabel] = useState("");
  const [editYearLoading, setEditYearLoading] = useState(false);

  const [deleteYearId, setDeleteYearId] = useState<string | null>(null);
  const [deleteYearLoading, setDeleteYearLoading] = useState(false);

  const [globalError, setGlobalError] = useState("");

  function refresh() {
    router.refresh();
  }

  // ── Program actions ────────────────────────────────────────────────────────

  async function handleAddProgram() {
    const code = newProgCode.trim().toLowerCase().replace(/\s+/g, "_");
    if (!code) { setProgAddErr("Program code is required."); return; }
    if (!newProgNameEn.trim()) { setProgAddErr("English name is required."); return; }

    setProgAddLoading(true);
    setProgAddErr("");
    const { data, error } = await addThesisProgram({
      code,
      nameEn: newProgNameEn.trim(),
      nameKm: newProgNameKm.trim() || newProgNameEn.trim(),
      durationYears: parseInt(newProgDuration) || 4,
      hasFaculty: newProgHasFaculty,
    });
    setProgAddLoading(false);
    if (error) { setProgAddErr(error); return; }
    if (data) {
      setPrograms((prev) => [...prev, data].sort((a, b) => a.sort_order - b.sort_order));
    }
    setAddingProgram(false);
    setNewProgCode(""); setNewProgNameEn(""); setNewProgNameKm("");
    setNewProgDuration("4"); setNewProgHasFaculty(false);
    refresh();
  }

  async function handleUpdateProgram(id: string) {
    setEditProgLoading(true);
    const { error } = await updateThesisProgram(id, {
      name_en: editProgNameEn.trim(),
      name_km: editProgNameKm.trim(),
    });
    setEditProgLoading(false);
    if (error) { setGlobalError(error); return; }
    setPrograms((prev) =>
      prev.map((p) => (p.id === id ? { ...p, name_en: editProgNameEn.trim(), name_km: editProgNameKm.trim() } : p))
    );
    setEditProgId(null);
    refresh();
  }

  async function handleDeleteProgram(id: string) {
    setDeleteProgLoading(true);
    const prog = programs.find((p) => p.id === id);
    const { error } = await deleteThesisProgram(id);
    setDeleteProgLoading(false);
    if (error) { setGlobalError(error); return; }
    setPrograms((prev) => prev.filter((p) => p.id !== id));
    if (prog) {
      setFaculties((prev) => prev.filter((f) => f.program_code !== prog.code));
      setCohorts((prev) => prev.filter((c) => c.program_code !== prog.code));
    }
    setDeleteProgId(null);
    refresh();
  }

  // ── Faculty actions ────────────────────────────────────────────────────────

  async function handleAddFaculty(programCode: string) {
    const code = newFacCode.trim().toLowerCase().replace(/\s+/g, "_");
    if (!code) { setFacAddErr("Faculty code is required."); return; }
    if (!newFacNameEn.trim()) { setFacAddErr("English name is required."); return; }

    setFacAddLoading(true);
    setFacAddErr("");
    const { data, error } = await addThesisFaculty({
      programCode,
      code,
      nameEn: newFacNameEn.trim(),
      nameKm: newFacNameKm.trim() || newFacNameEn.trim(),
      hasSubject: newFacHasSubject,
    });
    setFacAddLoading(false);
    if (error) { setFacAddErr(error); return; }
    if (data) {
      setFaculties((prev) => [...prev, data].sort((a, b) => a.sort_order - b.sort_order));
    }
    setAddingFacultyFor(null);
    setNewFacCode(""); setNewFacNameEn(""); setNewFacNameKm(""); setNewFacHasSubject(false);
    refresh();
  }

  async function handleUpdateFaculty(id: string) {
    setEditFacLoading(true);
    const { error } = await updateThesisFaculty(id, {
      name_en: editFacNameEn.trim(),
      name_km: editFacNameKm.trim(),
    });
    setEditFacLoading(false);
    if (error) { setGlobalError(error); return; }
    setFaculties((prev) =>
      prev.map((f) => (f.id === id ? { ...f, name_en: editFacNameEn.trim(), name_km: editFacNameKm.trim() } : f))
    );
    setEditFacId(null);
    refresh();
  }

  async function handleDeleteFaculty(id: string) {
    setDeleteFacLoading(true);
    const { error } = await deleteThesisFaculty(id);
    setDeleteFacLoading(false);
    if (error) { setGlobalError(error); return; }
    setFaculties((prev) => prev.filter((f) => f.id !== id));
    setDeleteFacId(null);
    refresh();
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
    const { data, error } = await addThesisCohort({
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
    const { error } = await updateThesisCohort(id, { label: editCohortLabel.trim() || null });
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
    const { error } = await deleteThesisCohort(id);
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
    const { data, error } = await addThesisAcademicYear({ cohortId, label });
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
    const { error } = await updateThesisAcademicYear(id, { label });
    setEditYearLoading(false);
    if (error) { setGlobalError(error); return; }
    setYears((prev) => prev.map((y) => (y.id === id ? { ...y, label } : y)));
    setEditYearId(null);
    refresh();
  }

  async function handleDeleteYear(id: string) {
    setDeleteYearLoading(true);
    const { error } = await deleteThesisAcademicYear(id);
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
          <button type="button" onClick={() => setGlobalError("")} className="ml-2 font-semibold underline">
            Dismiss
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* PROGRAMS SECTION                                                    */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="rounded-xl border border-divider bg-bg-surface overflow-hidden">
        <div className="flex items-center justify-between gap-4 bg-brand/5 px-5 py-3 border-b border-divider">
          <div>
            <h2 className="text-base font-bold text-text-heading">កម្មវិធី (Programs)</h2>
            <p className="text-xs text-text-muted">Manage all available programs</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setAddingProgram(true);
              setNewProgCode(""); setNewProgNameEn(""); setNewProgNameKm("");
              setNewProgDuration("4"); setNewProgHasFaculty(false); setProgAddErr("");
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-divider bg-bg-surface px-3 py-1.5 text-xs font-medium text-brand hover:bg-brand/5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add Program
          </button>
        </div>

        {/* Add program form */}
        {addingProgram && (
          <div className="px-5 py-3 border-b border-divider bg-brand/5">
            <p className="text-xs font-semibold text-text-body mb-2">New Program</p>
            <div className="flex flex-wrap gap-2 items-start">
              <input
                type="text"
                value={newProgCode}
                onChange={(e) => setNewProgCode(e.target.value)}
                placeholder="Code (e.g. b_ed_12_4) *"
                className={`${INPUT_CLASS} w-40`}
                autoFocus
              />
              <input
                type="text"
                value={newProgNameEn}
                onChange={(e) => setNewProgNameEn(e.target.value)}
                placeholder="English name *"
                className={`${INPUT_CLASS} w-52`}
              />
              <input
                type="text"
                value={newProgNameKm}
                onChange={(e) => setNewProgNameKm(e.target.value)}
                placeholder="ឈ្មោះខ្មែរ"
                className={`${INPUT_CLASS} w-48`}
              />
              <input
                type="number"
                min={1}
                value={newProgDuration}
                onChange={(e) => setNewProgDuration(e.target.value)}
                placeholder="Years"
                className={`${INPUT_CLASS} w-20`}
              />
              <label className="inline-flex items-center gap-1.5 text-xs text-text-body h-9 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newProgHasFaculty}
                  onChange={(e) => setNewProgHasFaculty(e.target.checked)}
                  className="rounded border-divider"
                />
                Has Faculty
              </label>
              <button
                type="button"
                onClick={handleAddProgram}
                disabled={progAddLoading}
                className="inline-flex items-center gap-1.5 h-9 rounded-lg bg-brand px-3 text-xs font-medium text-white hover:bg-brand/90 disabled:opacity-50"
              >
                {progAddLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Save
              </button>
              <button
                type="button"
                onClick={() => { setAddingProgram(false); setProgAddErr(""); }}
                className="inline-flex items-center h-9 rounded-lg border border-divider px-3 text-xs font-medium text-text-muted hover:bg-paper"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {progAddErr && <p className="mt-1.5 text-xs text-red-600">{progAddErr}</p>}
          </div>
        )}

        {/* Programs list */}
        {programs.length === 0 ? (
          <p className="px-5 py-4 text-sm text-text-muted italic">No programs yet. Add one above.</p>
        ) : (
          <ul className="divide-y divide-divider">
            {programs.map((prog) => {
              const isExpanded = expandedProgCode === prog.code;
              const progFaculties = faculties
                .filter((f) => f.program_code === prog.code)
                .sort((a, b) => a.sort_order - b.sort_order);
              const progCohorts = cohorts
                .filter((c) => c.program_code === prog.code)
                .sort((a, b) => a.sort_order - b.sort_order);

              return (
                <li key={prog.id}>
                  {/* Program row */}
                  <div className="flex items-center gap-3 px-5 py-3 hover:bg-paper/50 transition-colors">
                    {/* Expand toggle */}
                    <button
                      type="button"
                      onClick={() => setExpandedProgCode(isExpanded ? null : prog.code)}
                      className="text-text-muted hover:text-brand transition-colors"
                      title={isExpanded ? "Collapse" : "Expand"}
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>

                    {/* Edit program inline */}
                    {editProgId === prog.id ? (
                      <div className="flex flex-1 items-center gap-2">
                        <input
                          type="text"
                          value={editProgNameEn}
                          onChange={(e) => setEditProgNameEn(e.target.value)}
                          placeholder="English name"
                          className={`${INPUT_CLASS} flex-1 max-w-xs`}
                          autoFocus
                        />
                        <input
                          type="text"
                          value={editProgNameKm}
                          onChange={(e) => setEditProgNameKm(e.target.value)}
                          placeholder="ឈ្មោះខ្មែរ"
                          className={`${INPUT_CLASS} flex-1 max-w-xs`}
                        />
                        <button
                          type="button"
                          onClick={() => handleUpdateProgram(prog.id)}
                          disabled={editProgLoading}
                          className="inline-flex items-center gap-1 h-9 rounded-lg bg-brand px-3 text-xs font-medium text-white hover:bg-brand/90 disabled:opacity-50"
                        >
                          {editProgLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditProgId(null)}
                          className="inline-flex items-center h-9 rounded-lg border border-divider px-3 text-xs text-text-muted hover:bg-paper"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-1 items-center gap-3 min-w-0">
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-bold text-text-heading block">{prog.name_en}</span>
                          <span className="text-xs text-text-muted">{prog.name_km}</span>
                        </div>
                        <span className="text-xs text-text-muted shrink-0">
                          {prog.code} · {prog.duration_years}yr{prog.duration_years !== 1 ? "s" : ""}
                          {prog.has_faculty ? " · has faculty" : ""}
                        </span>
                        <span className="text-xs text-text-muted shrink-0">
                          {progFaculties.length} facult{progFaculties.length !== 1 ? "ies" : "y"} · {progCohorts.length} cohort{progCohorts.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                    )}

                    {/* Actions */}
                    {editProgId !== prog.id && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEditProgId(prog.id);
                            setEditProgNameEn(prog.name_en);
                            setEditProgNameKm(prog.name_km);
                          }}
                          className="text-text-muted hover:text-brand transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>

                        {deleteProgId === prog.id ? (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-text-muted">Delete program + all data?</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteProgram(prog.id)}
                              disabled={deleteProgLoading}
                              className="rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                            >
                              {deleteProgLoading ? "…" : "Yes"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteProgId(null)}
                              className="rounded border border-divider px-2 py-0.5 text-xs font-semibold text-text-body hover:bg-paper"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setDeleteProgId(prog.id)}
                            className="text-text-muted hover:text-red-500 transition-colors"
                            title="Delete program"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Expanded: Faculties + Cohorts */}
                  {isExpanded && (
                    <div className="border-t border-divider bg-paper/30">
                      {/* ── Faculties ─────────────────────────────────────── */}
                      {prog.has_faculty && (
                        <div className="px-8 py-3 space-y-2 border-b border-divider">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                              Faculties / Majors
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                setAddingFacultyFor(prog.code);
                                setNewFacCode(""); setNewFacNameEn(""); setNewFacNameKm("");
                                setNewFacHasSubject(false); setFacAddErr("");
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-divider bg-bg-surface px-2.5 py-1 text-xs font-medium text-brand hover:bg-brand/5 transition-colors"
                            >
                              <Plus className="w-3 h-3" /> Add Faculty
                            </button>
                          </div>

                          {/* Add faculty form */}
                          {addingFacultyFor === prog.code && (
                            <div className="flex flex-wrap gap-2 items-start pb-2">
                              <input
                                type="text"
                                value={newFacCode}
                                onChange={(e) => setNewFacCode(e.target.value)}
                                placeholder="Code *"
                                className={`${INPUT_CLASS} w-32`}
                                autoFocus
                              />
                              <input
                                type="text"
                                value={newFacNameEn}
                                onChange={(e) => setNewFacNameEn(e.target.value)}
                                placeholder="English name *"
                                className={`${INPUT_CLASS} w-44`}
                              />
                              <input
                                type="text"
                                value={newFacNameKm}
                                onChange={(e) => setNewFacNameKm(e.target.value)}
                                placeholder="ឈ្មោះខ្មែរ"
                                className={`${INPUT_CLASS} w-40`}
                              />
                              <label className="inline-flex items-center gap-1.5 text-xs text-text-body h-9 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={newFacHasSubject}
                                  onChange={(e) => setNewFacHasSubject(e.target.checked)}
                                  className="rounded border-divider"
                                />
                                Has Subject
                              </label>
                              <button
                                type="button"
                                onClick={() => handleAddFaculty(prog.code)}
                                disabled={facAddLoading}
                                className="inline-flex items-center gap-1 h-9 rounded-lg bg-brand px-3 text-xs font-medium text-white hover:bg-brand/90 disabled:opacity-50"
                              >
                                {facAddLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => { setAddingFacultyFor(null); setFacAddErr(""); }}
                                className="inline-flex items-center h-9 rounded-lg border border-divider px-3 text-xs text-text-muted hover:bg-paper"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                              {facAddErr && <p className="w-full text-xs text-red-600">{facAddErr}</p>}
                            </div>
                          )}

                          {progFaculties.length === 0 ? (
                            <p className="text-xs text-text-muted italic">No faculties yet.</p>
                          ) : (
                            <ul className="space-y-1">
                              {progFaculties.map((fac) => (
                                <li key={fac.id} className="flex items-center gap-3">
                                  {editFacId === fac.id ? (
                                    <div className="flex flex-1 items-center gap-2">
                                      <input
                                        type="text"
                                        value={editFacNameEn}
                                        onChange={(e) => setEditFacNameEn(e.target.value)}
                                        className={`${INPUT_CLASS} w-44`}
                                        autoFocus
                                      />
                                      <input
                                        type="text"
                                        value={editFacNameKm}
                                        onChange={(e) => setEditFacNameKm(e.target.value)}
                                        className={`${INPUT_CLASS} w-40`}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateFaculty(fac.id)}
                                        disabled={editFacLoading}
                                        className="inline-flex items-center gap-1 h-9 rounded-lg bg-brand px-3 text-xs font-medium text-white hover:bg-brand/90 disabled:opacity-50"
                                      >
                                        {editFacLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditFacId(null)}
                                        className="inline-flex items-center h-9 rounded-lg border border-divider px-3 text-xs text-text-muted hover:bg-paper"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  ) : (
                                    <>
                                      <div className="flex-1 min-w-0">
                                        <span className="text-sm text-text-body">{fac.name_km} — {fac.name_en}</span>
                                        {fac.has_subject && <span className="ml-2 text-xs text-brand">(has subjects)</span>}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => { setEditFacId(fac.id); setEditFacNameEn(fac.name_en); setEditFacNameKm(fac.name_km); }}
                                          className="text-text-muted hover:text-brand transition-colors"
                                          title="Edit"
                                        >
                                          <Pencil className="w-3.5 h-3.5" />
                                        </button>
                                        {deleteFacId === fac.id ? (
                                          <div className="flex items-center gap-1">
                                            <span className="text-xs text-text-muted">Delete?</span>
                                            <button
                                              type="button"
                                              onClick={() => handleDeleteFaculty(fac.id)}
                                              disabled={deleteFacLoading}
                                              className="rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                                            >
                                              {deleteFacLoading ? "…" : "Yes"}
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setDeleteFacId(null)}
                                              className="rounded border border-divider px-2 py-0.5 text-xs font-semibold text-text-body hover:bg-paper"
                                            >
                                              No
                                            </button>
                                          </div>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => setDeleteFacId(fac.id)}
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

                      {/* ── Cohorts ──────────────────────────────────────── */}
                      <div className="px-8 py-3 space-y-2">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                            Cohorts
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setAddingCohortFor(prog.code);
                              setNewCohortNum("");
                              setNewCohortLabel("");
                              setCohortAddErr("");
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-divider bg-bg-surface px-2.5 py-1 text-xs font-medium text-brand hover:bg-brand/5 transition-colors"
                          >
                            <Plus className="w-3 h-3" /> Add Cohort
                          </button>
                        </div>

                        {/* Add cohort form */}
                        {addingCohortFor === prog.code && (
                          <div className="flex flex-wrap gap-2 items-start pb-2">
                            <input
                              type="number"
                              min={1}
                              value={newCohortNum}
                              onChange={(e) => setNewCohortNum(e.target.value)}
                              placeholder="Cohort number *"
                              className={`${INPUT_CLASS} w-36`}
                              autoFocus
                            />
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
                            {cohortAddErr && <p className="w-full text-xs text-red-600">{cohortAddErr}</p>}
                          </div>
                        )}

                        {progCohorts.length === 0 ? (
                          <p className="text-xs text-text-muted italic">No cohorts yet.</p>
                        ) : (
                          <ul className="space-y-1">
                            {progCohorts.map((cohort) => {
                              const cohortYears = years
                                .filter((y) => y.cohort_id === cohort.id)
                                .sort((a, b) => a.sort_order - b.sort_order);
                              const isCohortExpanded = expandedCohortId === cohort.id;
                              const displayLabel = cohort.label ?? `Cohort ${cohort.number}`;

                              return (
                                <li key={cohort.id}>
                                  {/* Cohort row */}
                                  <div className="flex items-center gap-3 py-1.5 hover:bg-paper/50 rounded-md transition-colors">
                                    {/* Expand toggle */}
                                    <button
                                      type="button"
                                      onClick={() => setExpandedCohortId(isCohortExpanded ? null : cohort.id)}
                                      className="text-text-muted hover:text-brand transition-colors"
                                      title={isCohortExpanded ? "Collapse" : "Expand"}
                                    >
                                      {isCohortExpanded ? (
                                        <ChevronDown className="w-3.5 h-3.5" />
                                      ) : (
                                        <ChevronRight className="w-3.5 h-3.5" />
                                      )}
                                    </button>

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

                                    {/* Actions */}
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
                                          <Pencil className="w-3.5 h-3.5" />
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
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  {/* Academic years (expanded) */}
                                  {isCohortExpanded && (
                                    <div className="ml-6 border-l-2 border-divider pl-4 py-2 space-y-2">
                                      <div className="flex items-center justify-between mb-1">
                                        <p className="text-xs font-semibold text-text-muted">
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
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
