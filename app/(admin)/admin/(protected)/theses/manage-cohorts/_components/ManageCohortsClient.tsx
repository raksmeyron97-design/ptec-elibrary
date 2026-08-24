"use client"
 
;
/* eslint-disable @typescript-eslint/no-unused-vars */


import { useTranslations } from "next-intl";
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
import { ConfirmDialog } from "@/components/admin/kit";
import { INPUT_CLASS as KIT_INPUT_CLASS } from "@/components/admin/kit/form";

/** What the one shared confirmation dialog is currently asking about. */
type PendingDelete =
  | { kind: "program"; id: string; name: string; faculties: number; cohorts: number }
  | { kind: "faculty"; id: string; name: string }
  | { kind: "cohort"; id: string; name: string; years: number }
  | { kind: "year"; id: string; name: string };

interface Props {
  initialPrograms: ThesisProgram[];
  initialFaculties: ThesisFaculty[];
  initialCohorts: ThesisCohort[];
  initialYears: ThesisAcademicYear[];
}

/**
 * Compact variant of the shared admin control. These rows are dense inline
 * editors inside a tree, so they run at h-9 rather than the kit's h-11 — the
 * border, radius, focus treatment and placeholder colour all come from
 * `INPUT_CLASS` so they cannot drift away from the rest of the panel.
 */
const COMPACT_INPUT = KIT_INPUT_CLASS.replace("h-11", "h-9").replace("px-4", "px-3");

export default function ManageCohortsClient({ initialPrograms, initialFaculties, initialCohorts, initialYears }: Props) {
  const router = useRouter();
  const [programs, setPrograms] = useState<ThesisProgram[]>(initialPrograms);
  const [faculties, setFaculties] = useState<ThesisFaculty[]>(initialFaculties);
  const [cohorts, setCohorts] = useState<ThesisCohort[]>(initialCohorts);
  const t = useTranslations("adminThesisForm.cohorts");
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

  // Deletion state is shared. Four independent id+loading pairs each drove
  // their own inline "Delete? yes/no", which named neither the record nor what
  // else went with it — removing a program silently takes its faculties and
  // cohorts too.
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deleting, setDeleting] = useState(false);

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


  // ── Cohort CRUD state ─────────────────────────────────────────────────────
  const [addingCohortFor, setAddingCohortFor] = useState<string | null>(null); // program_code
  const [newCohortNum, setNewCohortNum] = useState("");
  const [newCohortLabel, setNewCohortLabel] = useState("");
  const [cohortAddErr, setCohortAddErr] = useState("");
  const [cohortAddLoading, setCohortAddLoading] = useState(false);

  const [editCohortId, setEditCohortId] = useState<string | null>(null);
  const [editCohortLabel, setEditCohortLabel] = useState("");
  const [editCohortLoading, setEditCohortLoading] = useState(false);


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


  const [globalError, setGlobalError] = useState("");

  function refresh() {
    router.refresh();
  }

  // ── Program actions ────────────────────────────────────────────────────────

  async function handleAddProgram() {
    const code = newProgCode.trim().toLowerCase().replace(/\s+/g, "_");
    if (!code) { setProgAddErr(t("err.programCode")); return; }
    if (!newProgNameEn.trim()) { setProgAddErr(t("err.englishName")); return; }

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
    setDeleting(true);
    const prog = programs.find((p) => p.id === id);
    const { error } = await deleteThesisProgram(id);
    setDeleting(false);
    if (error) { setGlobalError(error); setPendingDelete(null); return; }
    setPrograms((prev) => prev.filter((p) => p.id !== id));
    if (prog) {
      setFaculties((prev) => prev.filter((f) => f.program_code !== prog.code));
      setCohorts((prev) => prev.filter((c) => c.program_code !== prog.code));
    }
    setPendingDelete(null);
    refresh();
  }

  // ── Faculty actions ────────────────────────────────────────────────────────

  async function handleAddFaculty(programCode: string) {
    const code = newFacCode.trim().toLowerCase().replace(/\s+/g, "_");
    if (!code) { setFacAddErr(t("err.facultyCode")); return; }
    if (!newFacNameEn.trim()) { setFacAddErr(t("err.englishName")); return; }

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
    setDeleting(true);
    const { error } = await deleteThesisFaculty(id);
    setDeleting(false);
    if (error) { setGlobalError(error); setPendingDelete(null); return; }
    setFaculties((prev) => prev.filter((f) => f.id !== id));
    setPendingDelete(null);
    refresh();
  }

  // ── Cohort actions ─────────────────────────────────────────────────────────

  async function handleAddCohort(programCode: string) {
    const num = parseInt(newCohortNum.trim(), 10);
    if (isNaN(num) || num < 1) {
      setCohortAddErr(t("err.cohortNumber"));
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
    setDeleting(true);
    const { error } = await deleteThesisCohort(id);
    setDeleting(false);
    if (error) { setGlobalError(error); setPendingDelete(null); return; }
    setCohorts((prev) => prev.filter((c) => c.id !== id));
    setYears((prev) => prev.filter((y) => y.cohort_id !== id));
    setPendingDelete(null);
    if (expandedCohortId === id) setExpandedCohortId(null);
    refresh();
  }

  // ── Year actions ───────────────────────────────────────────────────────────

  async function handleAddYear(cohortId: string) {
    const label = newYearLabel.trim();
    if (!label) { setYearAddErr(t("err.yearLabel")); return; }
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
    setDeleting(true);
    const { error } = await deleteThesisAcademicYear(id);
    setDeleting(false);
    if (error) { setGlobalError(error); setPendingDelete(null); return; }
    setYears((prev) => prev.filter((y) => y.id !== id));
    setPendingDelete(null);
    refresh();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  /**
   * What each deletion actually costs, stated before it happens. The program
   * and cohort actions cascade — the old inline "Delete?" prompt gave no way
   * to know that.
   */
  function deletePrompt(target: PendingDelete): { title: string; description: string } {
    switch (target.kind) {
      case "program":
        return {
          title: t("confirm.programTitle", { name: target.name }),
          description:
            target.faculties + target.cohorts > 0
              ? t("confirm.programCascade", {
                  faculties: target.faculties,
                  cohorts: target.cohorts,
                })
              : t("confirm.noDependents"),
        };
      case "cohort":
        return {
          title: t("confirm.cohortTitle", { name: target.name }),
          description:
            target.years > 0
              ? t("confirm.cohortCascade", { years: target.years })
              : t("confirm.noDependents"),
        };
      case "faculty":
        return { title: t("confirm.facultyTitle", { name: target.name }), description: t("confirm.noDependents") };
      case "year":
        return { title: t("confirm.yearTitle", { name: target.name }), description: t("confirm.noDependents") };
    }
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    switch (pendingDelete.kind) {
      case "program": return void handleDeleteProgram(pendingDelete.id);
      case "faculty": return void handleDeleteFaculty(pendingDelete.id);
      case "cohort": return void handleDeleteCohort(pendingDelete.id);
      case "year": return void handleDeleteYear(pendingDelete.id);
    }
  }

  const prompt = pendingDelete ? deletePrompt(pendingDelete) : null;

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={pendingDelete !== null}
        title={prompt?.title ?? ""}
        description={prompt?.description}
        hint={t("confirm.irreversible")}
        confirmLabel={t("confirm.delete")}
        busyLabel={t("confirm.deleting")}
        busy={deleting}
        onCancel={() => !deleting && setPendingDelete(null)}
        onConfirm={confirmDelete}
      />

      {globalError && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm font-medium text-danger-text"
        >
          <span className="min-w-0 flex-1">{globalError}</span>
          <button
            type="button"
            onClick={() => setGlobalError("")}
            className="shrink-0 font-semibold underline underline-offset-2"
          >
            {t("dismiss")}
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* PROGRAMS SECTION                                                    */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="rounded-xl border border-divider bg-bg-surface overflow-hidden">
        <div className="flex items-center justify-between gap-4 bg-brand/5 px-5 py-3 border-b border-divider">
          <div>
            <h2 className="text-base font-bold text-text-heading">{t("programsHeading")}</h2>
            <p className="text-xs text-text-muted">{t("programsSub")}</p>
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
            <Plus className="w-3.5 h-3.5" /> {t("addProgram")}
          </button>
        </div>

        {/* Add program form */}
        {addingProgram && (
          <div className="px-5 py-3 border-b border-divider bg-brand/5">
            <p className="text-xs font-semibold text-text-body mb-2">{t("newProgram")}</p>
            <div className="flex flex-wrap gap-2 items-start">
              <input
                type="text"
                value={newProgCode}
                onChange={(e) => setNewProgCode(e.target.value)}
                placeholder={t("codePlaceholderProgram")}
                className={`${COMPACT_INPUT} w-40`}
                autoFocus
              />
              <input
                type="text"
                value={newProgNameEn}
                onChange={(e) => setNewProgNameEn(e.target.value)}
                placeholder={t("englishNamePlaceholderReq")}
                className={`${COMPACT_INPUT} w-52`}
              />
              <input
                type="text"
                value={newProgNameKm}
                onChange={(e) => setNewProgNameKm(e.target.value)}
                placeholder={t("khmerNamePlaceholder")}
                className={`${COMPACT_INPUT} w-48`}
              />
              <input
                type="number"
                min={1}
                value={newProgDuration}
                onChange={(e) => setNewProgDuration(e.target.value)}
                placeholder={t("years")}
                className={`${COMPACT_INPUT} w-20`}
              />
              <label className="inline-flex items-center gap-1.5 text-xs text-text-body h-9 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newProgHasFaculty}
                  onChange={(e) => setNewProgHasFaculty(e.target.checked)}
                  className="rounded border-divider"
                />
                {t("hasFaculty")}
              </label>
              <button
                type="button"
                onClick={handleAddProgram}
                disabled={progAddLoading}
                className="inline-flex items-center gap-1.5 h-9 rounded-lg bg-brand px-3 text-xs font-medium text-white hover:bg-brand/90 disabled:opacity-50"
              >
                {progAddLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                {t("save")}
              </button>
              <button
                type="button"
                onClick={() => { setAddingProgram(false); setProgAddErr(""); }}
                className="inline-flex items-center h-9 rounded-lg border border-divider px-3 text-xs font-medium text-text-muted hover:bg-paper"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {progAddErr && <p role="alert" className="mt-1.5 text-xs font-medium text-danger">{progAddErr}</p>}
          </div>
        )}

        {/* Programs list */}
        {programs.length === 0 ? (
          <p className="px-5 py-4 text-sm text-text-muted italic">{t("noPrograms")}</p>
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
                      title={isExpanded ? t("collapse") : t("expand")}
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
                          placeholder={t("englishNamePlaceholder")}
                          className={`${COMPACT_INPUT} flex-1 max-w-xs`}
                          autoFocus
                        />
                        <input
                          type="text"
                          value={editProgNameKm}
                          onChange={(e) => setEditProgNameKm(e.target.value)}
                          placeholder={t("khmerNamePlaceholder")}
                          className={`${COMPACT_INPUT} flex-1 max-w-xs`}
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
                          title={t("edit")}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setPendingDelete({
                              kind: "program",
                              id: prog.id,
                              name: prog.name_en,
                              faculties: faculties.filter((f) => f.program_code === prog.code).length,
                              cohorts: cohorts.filter((c) => c.program_code === prog.code).length,
                            })
                          }
                          className="rounded p-1 text-text-muted transition-colors hover:text-danger"
                          aria-label={t("deleteNamed", { name: prog.name_en })}
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
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
                              <Plus className="w-3 h-3" /> {t("addFaculty")}
                            </button>
                          </div>

                          {/* Add faculty form */}
                          {addingFacultyFor === prog.code && (
                            <div className="flex flex-wrap gap-2 items-start pb-2">
                              <input
                                type="text"
                                value={newFacCode}
                                onChange={(e) => setNewFacCode(e.target.value)}
                                placeholder={t("codePlaceholder")}
                                className={`${COMPACT_INPUT} w-32`}
                                autoFocus
                              />
                              <input
                                type="text"
                                value={newFacNameEn}
                                onChange={(e) => setNewFacNameEn(e.target.value)}
                                placeholder={t("englishNamePlaceholderReq")}
                                className={`${COMPACT_INPUT} w-44`}
                              />
                              <input
                                type="text"
                                value={newFacNameKm}
                                onChange={(e) => setNewFacNameKm(e.target.value)}
                                placeholder={t("khmerNamePlaceholder")}
                                className={`${COMPACT_INPUT} w-40`}
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
                                {t("save")}
                              </button>
                              <button
                                type="button"
                                onClick={() => { setAddingFacultyFor(null); setFacAddErr(""); }}
                                className="inline-flex items-center h-9 rounded-lg border border-divider px-3 text-xs text-text-muted hover:bg-paper"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                              {facAddErr && <p role="alert" className="w-full text-xs font-medium text-danger">{facAddErr}</p>}
                            </div>
                          )}

                          {progFaculties.length === 0 ? (
                            <p className="text-xs text-text-muted italic">{t("noFaculties")}</p>
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
                                        className={`${COMPACT_INPUT} w-44`}
                                        autoFocus
                                      />
                                      <input
                                        type="text"
                                        value={editFacNameKm}
                                        onChange={(e) => setEditFacNameKm(e.target.value)}
                                        className={`${COMPACT_INPUT} w-40`}
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
                                          title={t("edit")}
                                        >
                                          <Pencil className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setPendingDelete({ kind: "faculty", id: fac.id, name: fac.name_en })
                                          }
                                          className="rounded p-1 text-text-muted transition-colors hover:text-danger"
                                          aria-label={t("deleteNamed", { name: fac.name_en })}
                                        >
                                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                                        </button>
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
                            <Plus className="w-3 h-3" /> {t("addCohort")}
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
                              placeholder={t("cohortNumberPlaceholder")}
                              className={`${COMPACT_INPUT} w-36`}
                              autoFocus
                            />
                            <input
                              type="text"
                              value={newCohortLabel}
                              onChange={(e) => setNewCohortLabel(e.target.value)}
                              placeholder={t("displayLabelOptional")}
                              className={`${COMPACT_INPUT} w-48`}
                            />
                            <button
                              type="button"
                              onClick={() => handleAddCohort(prog.code)}
                              disabled={cohortAddLoading}
                              className="inline-flex items-center gap-1.5 h-9 rounded-lg bg-brand px-3 text-xs font-medium text-white hover:bg-brand/90 disabled:opacity-50"
                            >
                              {cohortAddLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                              {t("save")}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setAddingCohortFor(null); setCohortAddErr(""); }}
                              className="inline-flex items-center h-9 rounded-lg border border-divider px-3 text-xs font-medium text-text-muted hover:bg-paper"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                            {cohortAddErr && <p role="alert" className="w-full text-xs font-medium text-danger">{cohortAddErr}</p>}
                          </div>
                        )}

                        {progCohorts.length === 0 ? (
                          <p className="text-xs text-text-muted italic">{t("noCohorts")}</p>
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
                                      title={isCohortExpanded ? t("collapse") : t("expand")}
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
                                          placeholder={t("displayLabelBlank")}
                                          className={`${COMPACT_INPUT} flex-1 max-w-xs`}
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
                                          title={t("editLabel")}
                                        >
                                          <Pencil className="w-3.5 h-3.5" />
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() =>
                                            setPendingDelete({
                                              kind: "cohort",
                                              id: cohort.id,
                                              name: displayLabel,
                                              years: years.filter((y) => y.cohort_id === cohort.id).length,
                                            })
                                          }
                                          className="rounded p-1 text-text-muted transition-colors hover:text-danger"
                                          aria-label={t("deleteNamed", { name: displayLabel })}
                                        >
                                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                                        </button>
                                      </div>
                                    )}
                                  </div>

                                  {/* Academic years (expanded) */}
                                  {isCohortExpanded && (
                                    <div className="ml-6 border-l-2 border-divider pl-4 py-2 space-y-2">
                                      <div className="flex items-center justify-between mb-1">
                                        <p className="text-xs font-semibold text-text-muted">
                                          {t("academicYears")}
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
                                          <Plus className="w-3 h-3" /> {t("addYear")}
                                        </button>
                                      </div>

                                      {/* Add year form */}
                                      {addingYearFor === cohort.id && (
                                        <div className="flex flex-wrap gap-2 items-start pb-2">
                                          <input
                                            type="text"
                                            value={newYearLabel}
                                            onChange={(e) => setNewYearLabel(e.target.value)}
                                            placeholder={t("yearPlaceholder")}
                                            className={`${COMPACT_INPUT} w-40`}
                                            autoFocus
                                          />
                                          <button
                                            type="button"
                                            onClick={() => handleAddYear(cohort.id)}
                                            disabled={yearAddLoading}
                                            className="inline-flex items-center gap-1 h-9 rounded-lg bg-brand px-3 text-xs font-medium text-white hover:bg-brand/90 disabled:opacity-50"
                                          >
                                            {yearAddLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                            {t("save")}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => { setAddingYearFor(null); setYearAddErr(""); }}
                                            className="inline-flex items-center h-9 rounded-lg border border-divider px-3 text-xs text-text-muted hover:bg-paper"
                                          >
                                            <X className="w-3.5 h-3.5" />
                                          </button>
                                          {yearAddErr && <p role="alert" className="w-full text-xs font-medium text-danger">{yearAddErr}</p>}
                                        </div>
                                      )}

                                      {cohortYears.length === 0 ? (
                                        <p className="text-xs text-text-muted italic">{t("noYears")}</p>
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
                                                    className={`${COMPACT_INPUT} w-40`}
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
                                                      title={t("edit")}
                                                    >
                                                      <Pencil className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                      type="button"
                                                      onClick={() =>
                                                        setPendingDelete({ kind: "year", id: yr.id, name: yr.label })
                                                      }
                                                      className="rounded p-1 text-text-muted transition-colors hover:text-danger"
                                                      aria-label={t("deleteNamed", { name: yr.label })}
                                                    >
                                                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                                                    </button>
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
