"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
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
import {
  Plus, Pencil, Trash2, Check, X, ChevronDown, ChevronRight, Loader2,
  GraduationCap, ChevronRight as Caret, Library, Layers,
} from "lucide-react";
import { ConfirmDialog } from "@/components/admin/kit";
import { INPUT_CLASS as KIT_INPUT_CLASS } from "@/components/admin/kit/form";

/** What the one shared confirmation dialog is currently asking about. */
type PendingDelete =
  | { kind: "program"; id: string; name: string; faculties: number; cohorts: number }
  | { kind: "faculty"; id: string; name: string }
  | { kind: "cohort"; id: string; name: string; years: number }
  | { kind: "year"; id: string; name: string };

type TabKey = "programs" | "faculties" | "cohorts";

interface Props {
  initialPrograms: ThesisProgram[];
  initialFaculties: ThesisFaculty[];
  initialCohorts: ThesisCohort[];
  initialYears: ThesisAcademicYear[];
}

/**
 * Compact variant of the shared admin control. These rows are dense inline
 * editors, so they run at h-9 rather than the kit's h-11 — the border, radius,
 * focus treatment and placeholder colour all come from `INPUT_CLASS` so they
 * cannot drift away from the rest of the panel.
 */
const COMPACT_INPUT = KIT_INPUT_CLASS.replace("h-11", "h-9").replace("px-4", "px-3");

const GHOST_BTN =
  "focus-field inline-flex items-center gap-1 rounded-lg border border-dashed border-divider px-2.5 py-1 text-xs font-medium text-brand transition hover:border-brand/50 hover:bg-brand/5";
const QUIET_BTN =
  "focus-field inline-flex items-center gap-1 rounded-lg border border-divider bg-bg-surface px-2.5 py-1 text-xs font-medium text-brand transition hover:bg-brand/5";
const SAVE_BTN =
  "focus-field inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-medium text-white transition hover:bg-brand-hover disabled:opacity-50";
const CANCEL_BTN =
  "focus-field inline-flex h-9 items-center rounded-lg border border-divider px-3 text-xs font-medium text-text-muted transition hover:bg-paper";
const ICON_BTN = "focus-field rounded p-1 text-text-muted transition-colors hover:text-brand";

/**
 * Degree level, inferred rather than stored.
 *
 * The schema has no "level" column and programs are admin-creatable, so this
 * reads the code and name the way a person would. It only ever picks an accent
 * colour — nothing branches on it — so an unrecognised program degrading to the
 * neutral tone costs nothing.
 */
type Level = "bachelor" | "bachelorPlus" | "master" | "other";

function programLevel(p: ThesisProgram): Level {
  const hay = `${p.code} ${p.name_en}`.toLowerCase();
  if (hay.includes("master") || hay.includes("phd") || hay.includes("doctor")) return "master";
  if (/\+\s*1|plus_?1/.test(hay)) return "bachelorPlus";
  if (hay.includes("bachelor") || hay.startsWith("b_")) return "bachelor";
  return "other";
}

/**
 * Accent per level: bachelor blue, bachelor+1 teal, master purple.
 *
 * These reuse the `--ptec-metric-*` groups rather than inventing a fourth
 * categorical palette — they are the panel's existing vocabulary for "these
 * things are different kinds", already used by StatCard, and already tuned for
 * both themes. A literal hex here would be the thing the next person copies.
 */
const LEVEL_ACCENT: Record<Level, { bar: string; fg: string; bg: string }> = {
  bachelor:     { bar: "var(--ptec-metric-books-num)", fg: "var(--ptec-metric-books-num)", bg: "var(--ptec-metric-books-bg)" },
  bachelorPlus: { bar: "var(--ptec-metric-cat-num)",   fg: "var(--ptec-metric-cat-num)",   bg: "var(--ptec-metric-cat-bg)" },
  master:       { bar: "var(--ptec-metric-users-num)", fg: "var(--ptec-metric-users-num)", bg: "var(--ptec-metric-users-bg)" },
  other:        { bar: "var(--ptec-metric-gray-num)",  fg: "var(--ptec-metric-gray-num)",  bg: "var(--ptec-metric-gray-bg)" },
};
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


  /*
    Tabs replace the accordion as the top-level structure. Faculties and cohorts
    used to be reachable only by expanding a program, one at a time — so
    "which programs have no faculties yet?" meant opening all three and
    remembering. Each is its own view now, and a program card can send you
    straight into one scoped to itself.
  */
  const [activeTab, setActiveTab] = useState<TabKey>("programs");
  /** Program code the Faculties/Cohorts tabs are narrowed to; null = all. */
  const [scopeProgram, setScopeProgram] = useState<string | null>(null);

  // Sets, not single ids: one-open-at-a-time made comparing two cohorts
  // impossible, and made Expand all unimplementable.
  const [expandedCohorts, setExpandedCohorts] = useState<Set<string>>(new Set());

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
    setExpandedCohorts((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
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


  // ── Derived ────────────────────────────────────────────────────────────────

  const byProgram = useMemo(() => {
    const map = new Map<string, { faculties: ThesisFaculty[]; cohorts: ThesisCohort[] }>();
    for (const p of programs) map.set(p.code, { faculties: [], cohorts: [] });
    for (const f of faculties) map.get(f.program_code)?.faculties.push(f);
    for (const c of cohorts) map.get(c.program_code)?.cohorts.push(c);
    for (const entry of map.values()) {
      entry.faculties.sort((a, b) => a.sort_order - b.sort_order);
      entry.cohorts.sort((a, b) => a.sort_order - b.sort_order);
    }
    return map;
  }, [programs, faculties, cohorts]);

  const scoped = scopeProgram ? programs.filter((p) => p.code === scopeProgram) : programs;
  const scopedProgramName = scopeProgram
    ? programs.find((p) => p.code === scopeProgram)?.name_en ?? scopeProgram
    : null;

  /** Jump from a program card into one of the other tabs, scoped to it. */
  function drillInto(tab: TabKey, programCode: string) {
    setScopeProgram(programCode);
    setActiveTab(tab);
  }

  const TABS: { key: TabKey; label: string; count: number }[] = [
    { key: "programs", label: t("tabs.programs"), count: programs.length },
    { key: "faculties", label: t("tabs.faculties"), count: faculties.length },
    { key: "cohorts", label: t("tabs.cohorts"), count: cohorts.length },
  ];

  // ── Shared row fragments ───────────────────────────────────────────────────

  function inlineSaveCancel(onSave: () => void, onCancel: () => void, loading: boolean, saveLabel?: string) {
    return (
      <>
        <button type="button" onClick={onSave} disabled={loading} className={SAVE_BTN}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : <Check className="h-3.5 w-3.5" />}
          {saveLabel}
        </button>
        <button type="button" onClick={onCancel} className={CANCEL_BTN} aria-label={t("cancel")}>
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </>
    );
  }

  // ── Programs tab ───────────────────────────────────────────────────────────

  function renderProgramsTab() {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-text-muted">{t("programsSub")}</p>
          <button
            type="button"
            onClick={() => {
              setAddingProgram(true);
              setNewProgCode(""); setNewProgNameEn(""); setNewProgNameKm("");
              setNewProgDuration("4"); setNewProgHasFaculty(false); setProgAddErr("");
            }}
            className={QUIET_BTN}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> {t("addProgram")}
          </button>
        </div>

        {addingProgram && (
          <div className="rounded-xl border border-divider bg-paper/40 p-4">
            <p className="mb-2 text-xs font-semibold text-text-body">{t("newProgram")}</p>
            <div className="flex flex-wrap items-start gap-2">
              <input type="text" value={newProgCode} onChange={(e) => setNewProgCode(e.target.value)} placeholder={t("codePlaceholderProgram")} className={`${COMPACT_INPUT} w-40`} autoFocus />
              <input type="text" value={newProgNameEn} onChange={(e) => setNewProgNameEn(e.target.value)} placeholder={t("englishNamePlaceholderReq")} className={`${COMPACT_INPUT} w-52`} />
              <input type="text" value={newProgNameKm} onChange={(e) => setNewProgNameKm(e.target.value)} placeholder={t("khmerNamePlaceholder")} className={`${COMPACT_INPUT} w-48`} />
              <input type="number" min={1} value={newProgDuration} onChange={(e) => setNewProgDuration(e.target.value)} placeholder={t("years")} className={`${COMPACT_INPUT} w-20`} />
              <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 text-xs text-text-body">
                <input type="checkbox" checked={newProgHasFaculty} onChange={(e) => setNewProgHasFaculty(e.target.checked)} className="rounded border-divider" />
                {t("hasFaculty")}
              </label>
              {inlineSaveCancel(handleAddProgram, () => { setAddingProgram(false); setProgAddErr(""); }, progAddLoading, t("save"))}
            </div>
            {progAddErr && <p role="alert" className="mt-1.5 text-xs font-medium text-danger">{progAddErr}</p>}
          </div>
        )}

        {programs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-divider px-5 py-8 text-center text-sm text-text-muted">{t("noPrograms")}</p>
        ) : (
          <ul className="grid gap-3">
            {programs.map((prog) => {
              const level = programLevel(prog);
              const accent = LEVEL_ACCENT[level];
              const group = byProgram.get(prog.code) ?? { faculties: [], cohorts: [] };
              const isEditing = editProgId === prog.id;

              return (
                <li
                  key={prog.id}
                  className="relative overflow-hidden rounded-xl border border-divider bg-bg-surface transition hover:border-border-strong hover:shadow-sm"
                >
                  {/* Left accent bar — the level, readable before any text is. */}
                  <span className="absolute inset-y-0 left-0 w-1" style={{ background: accent.bar }} aria-hidden="true" />

                  <div className="flex flex-wrap items-start gap-4 py-4 pl-5 pr-4">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                      style={{ background: accent.bg, color: accent.fg }}
                      aria-hidden="true"
                    >
                      <GraduationCap className="h-5 w-5" />
                    </span>

                    {isEditing ? (
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                        <input type="text" value={editProgNameEn} onChange={(e) => setEditProgNameEn(e.target.value)} placeholder={t("englishNamePlaceholder")} className={`${COMPACT_INPUT} w-52`} autoFocus />
                        <input type="text" value={editProgNameKm} onChange={(e) => setEditProgNameKm(e.target.value)} placeholder={t("khmerNamePlaceholder")} className={`${COMPACT_INPUT} w-48`} />
                        {inlineSaveCancel(() => handleUpdateProgram(prog.id), () => setEditProgId(null), editProgLoading)}
                      </div>
                    ) : (
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold leading-[1.6] text-text-heading">{prog.name_en}</p>
                        {/* Khmer at 14px/1.6 — the same floor the theses table uses. */}
                        <p className="text-sm leading-[1.6] text-text-muted">{prog.name_km}</p>

                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Tag>{t("tagYears", { count: prog.duration_years })}</Tag>
                          <Tag>{prog.code}</Tag>

                          {/*
                            A zero count is the one place a card can offer an
                            action instead of a number. "0 faculties" told the
                            admin they had a problem and left them to find the
                            fix two clicks away; "+ Add faculty" is the fix.
                          */}
                          {prog.has_faculty && (
                            group.faculties.length === 0 ? (
                              <button type="button" onClick={() => drillInto("faculties", prog.code)} className={GHOST_BTN}>
                                <Plus className="h-3 w-3" aria-hidden="true" /> {t("addFaculty")}
                              </button>
                            ) : (
                              <Tag>{t("tagFaculties", { count: group.faculties.length })}</Tag>
                            )
                          )}

                          {group.cohorts.length === 0 ? (
                            <button type="button" onClick={() => drillInto("cohorts", prog.code)} className={GHOST_BTN}>
                              <Plus className="h-3 w-3" aria-hidden="true" /> {t("addCohort")}
                            </button>
                          ) : (
                            <Tag>{t("tagCohorts", { count: group.cohorts.length })}</Tag>
                          )}
                        </div>
                      </div>
                    )}

                    {!isEditing && (
                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        {prog.has_faculty && (
                          <button type="button" onClick={() => drillInto("faculties", prog.code)} className={QUIET_BTN}>
                            {t("manageFaculties")} <Caret className="h-3 w-3" aria-hidden="true" />
                          </button>
                        )}
                        <button type="button" onClick={() => drillInto("cohorts", prog.code)} className={QUIET_BTN}>
                          {t("manageCohortsAction")} <Caret className="h-3 w-3" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEditProgId(prog.id); setEditProgNameEn(prog.name_en); setEditProgNameKm(prog.name_km); }}
                          className={ICON_BTN}
                          aria-label={t("editNamed", { name: prog.name_en })}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete({
                            kind: "program", id: prog.id, name: prog.name_en,
                            faculties: group.faculties.length, cohorts: group.cohorts.length,
                          })}
                          className={`${ICON_BTN} hover:text-danger`}
                          aria-label={t("deleteNamed", { name: prog.name_en })}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  // ── Faculties tab ──────────────────────────────────────────────────────────

  function renderFacultiesTab() {
    const withFaculties = scoped.filter((p) => p.has_faculty);
    if (withFaculties.length === 0) {
      return <p className="rounded-xl border border-dashed border-divider px-5 py-8 text-center text-sm text-text-muted">{t("noFacultyPrograms")}</p>;
    }

    return (
      <div className="space-y-5">
        {withFaculties.map((prog) => {
          const progFaculties = byProgram.get(prog.code)?.faculties ?? [];
          const isAdding = addingFacultyFor === prog.code;

          return (
            <section key={prog.id} className="overflow-hidden rounded-xl border border-divider bg-bg-surface">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-divider bg-paper/50 px-4 py-2.5">
                <h3 className="text-sm font-bold text-text-heading">
                  {prog.name_en} <span className="font-normal text-text-muted">· {prog.name_km}</span>
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setAddingFacultyFor(prog.code);
                    setNewFacCode(""); setNewFacNameEn(""); setNewFacNameKm("");
                    setNewFacHasSubject(false); setFacAddErr("");
                  }}
                  className={QUIET_BTN}
                >
                  <Plus className="h-3 w-3" aria-hidden="true" /> {t("addFaculty")}
                </button>
              </div>

              {isAdding && (
                <div className="flex flex-wrap items-start gap-2 border-b border-divider bg-brand/5 px-4 py-3">
                  <input type="text" value={newFacCode} onChange={(e) => setNewFacCode(e.target.value)} placeholder={t("codePlaceholder")} className={`${COMPACT_INPUT} w-32`} autoFocus />
                  <input type="text" value={newFacNameEn} onChange={(e) => setNewFacNameEn(e.target.value)} placeholder={t("englishNamePlaceholderReq")} className={`${COMPACT_INPUT} w-44`} />
                  <input type="text" value={newFacNameKm} onChange={(e) => setNewFacNameKm(e.target.value)} placeholder={t("khmerNamePlaceholder")} className={`${COMPACT_INPUT} w-40`} />
                  <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 text-xs text-text-body">
                    <input type="checkbox" checked={newFacHasSubject} onChange={(e) => setNewFacHasSubject(e.target.checked)} className="rounded border-divider" />
                    {t("hasSubject")}
                  </label>
                  {inlineSaveCancel(() => handleAddFaculty(prog.code), () => { setAddingFacultyFor(null); setFacAddErr(""); }, facAddLoading, t("save"))}
                  {facAddErr && <p role="alert" className="w-full text-xs font-medium text-danger">{facAddErr}</p>}
                </div>
              )}

              {progFaculties.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm italic text-text-muted">{t("noFaculties")}</p>
              ) : (
                /*
                  A real table, not a bullet list. Faculties have parallel
                  attributes across rows — name, whether they carry subjects —
                  and the list rendered "km — en" as one run-on string, so the
                  eye had nothing to scan down.
                */
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <caption className="sr-only">{t("facultiesCaption", { program: prog.name_en })}</caption>
                    <thead>
                      <tr className="border-b border-divider text-left text-xs font-bold uppercase tracking-wide text-text-muted">
                        <th scope="col" className="px-4 py-2">{t("colFaculty")}</th>
                        <th scope="col" className="px-4 py-2">{t("colSubjects")}</th>
                        <th scope="col" className="px-4 py-2 text-right">{t("colActions")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-divider">
                      {progFaculties.map((fac) => (
                        <tr key={fac.id} className="transition-colors hover:bg-paper/50">
                          {editFacId === fac.id ? (
                            <td colSpan={3} className="px-4 py-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <input type="text" value={editFacNameEn} onChange={(e) => setEditFacNameEn(e.target.value)} className={`${COMPACT_INPUT} w-44`} autoFocus />
                                <input type="text" value={editFacNameKm} onChange={(e) => setEditFacNameKm(e.target.value)} className={`${COMPACT_INPUT} w-40`} />
                                {inlineSaveCancel(() => handleUpdateFaculty(fac.id), () => setEditFacId(null), editFacLoading)}
                              </div>
                            </td>
                          ) : (
                            <>
                              <td className="px-4 py-2.5">
                                <p className="text-sm leading-[1.6] text-text-heading">{fac.name_en}</p>
                                <p className="text-sm leading-[1.6] text-text-muted">{fac.name_km}</p>
                              </td>
                              <td className="px-4 py-2.5 text-text-muted">
                                {fac.has_subject ? t("subjectsYes") : t("subjectsNo")}
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => { setEditFacId(fac.id); setEditFacNameEn(fac.name_en); setEditFacNameKm(fac.name_km); }}
                                    className={ICON_BTN}
                                    aria-label={t("editNamed", { name: fac.name_en })}
                                  >
                                    <Pencil className="h-4 w-4" aria-hidden="true" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setPendingDelete({ kind: "faculty", id: fac.id, name: fac.name_en })}
                                    className={`${ICON_BTN} hover:text-danger`}
                                    aria-label={t("deleteNamed", { name: fac.name_en })}
                                  >
                                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                                  </button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })}
      </div>
    );
  }

  // ── Cohorts tab ────────────────────────────────────────────────────────────

  const visibleCohortIds = scoped.flatMap((p) => (byProgram.get(p.code)?.cohorts ?? []).map((c) => c.id));
  const allExpanded = visibleCohortIds.length > 0 && visibleCohortIds.every((id) => expandedCohorts.has(id));

  function toggleCohort(id: string) {
    setExpandedCohorts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function renderCohortsTab() {
    if (scoped.length === 0) {
      return <p className="rounded-xl border border-dashed border-divider px-5 py-8 text-center text-sm text-text-muted">{t("noPrograms")}</p>;
    }

    return (
      <div className="space-y-5">
        {visibleCohortIds.length > 0 && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setExpandedCohorts(allExpanded ? new Set() : new Set(visibleCohortIds))}
              className={QUIET_BTN}
            >
              {allExpanded ? t("collapseAll") : t("expandAll")}
            </button>
          </div>
        )}

        {scoped.map((prog) => {
          const progCohorts = byProgram.get(prog.code)?.cohorts ?? [];
          const isAdding = addingCohortFor === prog.code;

          return (
            <section key={prog.id} className="overflow-hidden rounded-xl border border-divider bg-bg-surface">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-divider bg-paper/50 px-4 py-2.5">
                <h3 className="text-sm font-bold text-text-heading">
                  {prog.name_en} <span className="font-normal text-text-muted">· {prog.name_km}</span>
                </h3>
                <button
                  type="button"
                  onClick={() => { setAddingCohortFor(prog.code); setNewCohortNum(""); setNewCohortLabel(""); setCohortAddErr(""); }}
                  className={QUIET_BTN}
                >
                  <Plus className="h-3 w-3" aria-hidden="true" /> {t("addCohort")}
                </button>
              </div>

              {isAdding && (
                <div className="flex flex-wrap items-start gap-2 border-b border-divider bg-brand/5 px-4 py-3">
                  <input type="number" min={1} value={newCohortNum} onChange={(e) => setNewCohortNum(e.target.value)} placeholder={t("cohortNumberPlaceholder")} className={`${COMPACT_INPUT} w-36`} autoFocus />
                  <input type="text" value={newCohortLabel} onChange={(e) => setNewCohortLabel(e.target.value)} placeholder={t("displayLabelOptional")} className={`${COMPACT_INPUT} w-48`} />
                  {inlineSaveCancel(() => handleAddCohort(prog.code), () => { setAddingCohortFor(null); setCohortAddErr(""); }, cohortAddLoading, t("save"))}
                  {cohortAddErr && <p role="alert" className="w-full text-xs font-medium text-danger">{cohortAddErr}</p>}
                </div>
              )}

              {progCohorts.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-sm italic text-text-muted">{t("noCohorts")}</p>
                  <button
                    type="button"
                    onClick={() => { setAddingCohortFor(prog.code); setNewCohortNum(""); setNewCohortLabel(""); setCohortAddErr(""); }}
                    className={`${GHOST_BTN} mt-2`}
                  >
                    <Plus className="h-3 w-3" aria-hidden="true" /> {t("addCohort")}
                  </button>
                </div>
              ) : (
                <ul className="divide-y divide-divider">
                  {progCohorts.map((cohort) => {
                    const cohortYears = years.filter((y) => y.cohort_id === cohort.id).sort((a, b) => a.sort_order - b.sort_order);
                    const isExpanded = expandedCohorts.has(cohort.id);
                    const displayLabel = cohort.label ?? t("cohortNumber", { number: cohort.number });
                    const isEditing = editCohortId === cohort.id;

                    return (
                      <li key={cohort.id}>
                        <div className="flex items-center gap-2 px-4 py-2.5">
                          {isEditing ? (
                            <div className="flex flex-1 flex-wrap items-center gap-2">
                              <input type="text" value={editCohortLabel} onChange={(e) => setEditCohortLabel(e.target.value)} placeholder={t("displayLabelBlank")} className={`${COMPACT_INPUT} max-w-xs flex-1`} autoFocus />
                              {inlineSaveCancel(() => handleUpdateCohort(cohort.id), () => setEditCohortId(null), editCohortLoading)}
                            </div>
                          ) : (
                            <>
                              {/*
                                The whole row is the toggle, not a 14px chevron.
                                The chevron alone was the only hit target, which
                                is a hard thing to land on a laptop trackpad and
                                a harder one on a tablet — the target is now the
                                full width of the row.
                              */}
                              <button
                                type="button"
                                onClick={() => toggleCohort(cohort.id)}
                                aria-expanded={isExpanded}
                                className="focus-field -mx-2 flex flex-1 items-center gap-3 rounded-lg px-2 py-1 text-left transition hover:bg-paper/60"
                              >
                                {isExpanded
                                  ? <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                                  : <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />}
                                <span className="text-sm font-medium leading-[1.6] text-text-heading">
                                  {t("cohortKhmer", { number: cohort.number })}
                                </span>
                                {cohort.label && <span className="truncate text-xs text-text-muted">({cohort.label})</span>}
                                <span className="ml-auto shrink-0 text-xs text-text-muted">
                                  {t("tagYearsCount", { count: cohortYears.length })}
                                </span>
                              </button>

                              <div className="flex shrink-0 items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => { setEditCohortId(cohort.id); setEditCohortLabel(cohort.label ?? ""); }}
                                  className={ICON_BTN}
                                  aria-label={t("editNamed", { name: displayLabel })}
                                >
                                  <Pencil className="h-4 w-4" aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPendingDelete({ kind: "cohort", id: cohort.id, name: displayLabel, years: cohortYears.length })}
                                  className={`${ICON_BTN} hover:text-danger`}
                                  aria-label={t("deleteNamed", { name: displayLabel })}
                                >
                                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                                </button>
                              </div>
                            </>
                          )}
                        </div>

                        {isExpanded && (
                          <div className="ml-6 space-y-2 border-l-2 border-divider py-2 pl-4 pr-4">
                            <div className="mb-1 flex items-center justify-between">
                              <p className="text-xs font-semibold text-text-muted">{t("academicYears")}</p>
                              <button
                                type="button"
                                onClick={() => { setAddingYearFor(cohort.id); setNewYearLabel(""); setYearAddErr(""); }}
                                className={QUIET_BTN}
                              >
                                <Plus className="h-3 w-3" aria-hidden="true" /> {t("addYear")}
                              </button>
                            </div>

                            {addingYearFor === cohort.id && (
                              <div className="flex flex-wrap items-start gap-2 pb-2">
                                <input type="text" value={newYearLabel} onChange={(e) => setNewYearLabel(e.target.value)} placeholder={t("yearPlaceholder")} className={`${COMPACT_INPUT} w-40`} autoFocus />
                                {inlineSaveCancel(() => handleAddYear(cohort.id), () => { setAddingYearFor(null); setYearAddErr(""); }, yearAddLoading, t("save"))}
                                {yearAddErr && <p role="alert" className="w-full text-xs font-medium text-danger">{yearAddErr}</p>}
                              </div>
                            )}

                            {cohortYears.length === 0 ? (
                              <p className="text-xs italic text-text-muted">{t("noYears")}</p>
                            ) : (
                              <ul className="space-y-1">
                                {cohortYears.map((yr) => (
                                  <li key={yr.id} className="flex items-center gap-3">
                                    {editYearId === yr.id ? (
                                      <div className="flex flex-1 items-center gap-2">
                                        <input type="text" value={editYearLabel} onChange={(e) => setEditYearLabel(e.target.value)} className={`${COMPACT_INPUT} w-40`} autoFocus />
                                        {inlineSaveCancel(() => handleUpdateYear(yr.id), () => setEditYearId(null), editYearLoading)}
                                      </div>
                                    ) : (
                                      <>
                                        <span className="flex-1 text-sm leading-[1.6] text-text-body">{yr.label}</span>
                                        <div className="flex items-center gap-1">
                                          <button
                                            type="button"
                                            onClick={() => { setEditYearId(yr.id); setEditYearLabel(yr.label); }}
                                            className={ICON_BTN}
                                            aria-label={t("editNamed", { name: yr.label })}
                                          >
                                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setPendingDelete({ kind: "year", id: yr.id, name: yr.label })}
                                            className={`${ICON_BTN} hover:text-danger`}
                                            aria-label={t("deleteNamed", { name: yr.label })}
                                          >
                                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
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
            </section>
          );
        })}
      </div>
    );
  }

  // ── Shell ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
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
          <button type="button" onClick={() => setGlobalError("")} className="focus-field shrink-0 rounded font-semibold underline underline-offset-2">
            {t("dismiss")}
          </button>
        </div>
      )}

      {/* Tabs. Programs first, because everything else hangs off one. */}
      <div role="tablist" aria-label={t("tabsAria")} className="flex gap-1 border-b border-divider">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`cohort-tab-${tab.key}`}
              aria-selected={isActive}
              aria-controls={`cohort-panel-${tab.key}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveTab(tab.key)}
              className={`focus-field -mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
                isActive
                  ? "border-brand text-brand"
                  : "border-transparent text-text-muted hover:border-divider hover:text-text-heading"
              }`}
            >
              {tab.key === "programs" ? <GraduationCap className="h-4 w-4" aria-hidden="true" />
                : tab.key === "faculties" ? <Library className="h-4 w-4" aria-hidden="true" />
                : <Layers className="h-4 w-4" aria-hidden="true" />}
              {tab.label}
              <span className="rounded-full bg-paper px-1.5 text-xs tabular-nums text-text-muted">{tab.count}</span>
            </button>
          );
        })}
      </div>

      {/*
        Breadcrumb, shown only when a program card drilled in here. Without it
        a scoped Faculties tab looks identical to an unscoped one that happens
        to have a single program, and there was no way back out.
      */}
      {activeTab !== "programs" && scopedProgramName && (
        <nav aria-label={t("breadcrumbAria")} className="flex items-center gap-1.5 text-sm">
          <button
            type="button"
            onClick={() => { setScopeProgram(null); setActiveTab("programs"); }}
            className="focus-field rounded font-medium text-brand hover:underline"
          >
            {t("tabs.programs")}
          </button>
          <Caret className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
          <span className="font-semibold text-text-heading">{scopedProgramName}</span>
          <button
            type="button"
            onClick={() => setScopeProgram(null)}
            className="focus-field ml-2 rounded text-xs font-medium text-text-muted hover:text-brand"
          >
            {t("showAllPrograms")}
          </button>
        </nav>
      )}

      <div id={`cohort-panel-${activeTab}`} role="tabpanel" aria-labelledby={`cohort-tab-${activeTab}`}>
        {activeTab === "programs" && renderProgramsTab()}
        {activeTab === "faculties" && renderFacultiesTab()}
        {activeTab === "cohorts" && renderCohortsTab()}
      </div>
    </div>
  );
}

/** Small neutral count/attribute chip used on the program cards. */
function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-divider bg-paper px-2 py-0.5 text-xs font-medium text-text-muted">
      {children}
    </span>
  );
}
