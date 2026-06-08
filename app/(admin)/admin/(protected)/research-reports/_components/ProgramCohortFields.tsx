"use client";

import { useState, useEffect } from "react";
import {
  PROGRAMS,
  getFacultiesForProgram,
  getSubjectsForFaculty,
  getProgram,
  type FacultyOption,
  type SubjectOption,
} from "@/lib/research/programs";
import {
  getResearchCohorts,
  getResearchAcademicYears,
  addResearchCohort,
  addResearchAcademicYear,
  type ResearchCohort,
  type ResearchAcademicYear,
} from "@/app/actions/research";
import AddableSelect, { type SelectOption } from "./AddableSelect";

export interface CascadeValues {
  program: string;
  faculty: string;
  subject: string;      // subject code; "" when the field is hidden / not applicable
  cohort: string;       // cohort number as text (e.g. "3") — stored in research_reports.cohort
  academicYear: string; // year label (e.g. "2023-2024") — stored in research_reports.academic_year
}

interface Props {
  defaultValues?: {
    program?: string | null;
    faculty?: string | null;
    subject?: string | null;
    cohort?: string | null;
    academicYear?: string | null;
  };
  onChange: (values: CascadeValues) => void;
}

const SELECT_CLASS =
  "h-11 w-full rounded-lg border border-divider px-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15 bg-bg-surface";

export default function ProgramCohortFields({ defaultValues, onChange }: Props) {
  // ── DB data (fetched once on mount) ─────────────────────────────────────────
  const [allCohorts, setAllCohorts] = useState<ResearchCohort[]>([]);
  const [allYears, setAllYears] = useState<ResearchAcademicYear[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // ── Cascade state ────────────────────────────────────────────────────────────
  const [program, setProgram] = useState(defaultValues?.program ?? "");
  const [faculty, setFaculty] = useState(defaultValues?.faculty ?? "");
  const [subject, setSubject] = useState(defaultValues?.subject ?? "");
  // We track the cohort UUID internally to filter years; the number/label text is submitted.
  const [cohortId, setCohortId] = useState<string>("");
  const [cohortText, setCohortText] = useState(defaultValues?.cohort ?? "");
  const [academicYear, setAcademicYear] = useState(defaultValues?.academicYear ?? "");

  // ── Fetch lookup data on mount ───────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const [cohortRes, yearRes] = await Promise.all([
        getResearchCohorts(),
        getResearchAcademicYears(),
      ]);
      const cohorts = cohortRes.data ?? [];
      const years = yearRes.data ?? [];
      setAllCohorts(cohorts);
      setAllYears(years);

      // Resolve initial cohort UUID from defaultValues (needed for Edit form)
      if (defaultValues?.program && defaultValues.cohort) {
        const matched = cohorts.find(
          (c) => c.program_code === defaultValues.program && String(c.number) === defaultValues.cohort,
        );
        if (matched) {
          setCohortId(matched.id);
        } else {
          // Legacy cohort not in DB — keep cohortText so it's still submitted
          setCohortId("__legacy__");
        }
      }

      setLoadingData(false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived option lists ─────────────────────────────────────────────────────
  const programConfig = getProgram(program);
  const hasFaculty = programConfig?.hasFaculty ?? false;

  const facultyOptions: FacultyOption[] = [
    ...getFacultiesForProgram(program),
    // Include legacy faculty not in config so existing data is never dropped
    ...(faculty && !getFacultiesForProgram(program).find((f) => f.code === faculty)
      ? [{ code: faculty, nameEn: `${faculty} (legacy)`, nameKm: faculty }]
      : []),
  ];

  const subjectOptions: SubjectOption[] = (() => {
    const configSubjects = getSubjectsForFaculty(program, faculty);
    if (!faculty) return [];
    return [
      ...configSubjects,
      // Include a legacy subject code if it's not in the config list
      ...(subject && !configSubjects.find((s) => s.code === subject)
        ? [{ code: subject, nameEn: `${subject} (legacy)`, nameKm: subject }]
        : []),
    ];
  })();

  const hasSubject = subjectOptions.length > 0;

  const cohortOptions: SelectOption[] = (() => {
    const dbCohorts = allCohorts.filter((c) => c.program_code === program);
    const opts = dbCohorts.map((c) => ({
      value: c.id,
      label: c.label ?? `ជំនាន់ទី ${c.number} — Cohort ${c.number}`,
    }));
    // Append legacy cohort if not in DB
    if (cohortText && !dbCohorts.find((c) => String(c.number) === cohortText)) {
      opts.push({ value: "__legacy__", label: `Cohort ${cohortText} (legacy)` });
    }
    return opts;
  })();

  const yearOptions: SelectOption[] = (() => {
    const dbYears = cohortId && cohortId !== "__legacy__"
      ? allYears.filter((y) => y.cohort_id === cohortId)
      : [];
    const opts = dbYears.map((y) => ({ value: y.label, label: y.label }));
    // Append legacy year if not in DB
    if (academicYear && !opts.find((o) => o.value === academicYear)) {
      opts.push({ value: academicYear, label: `${academicYear} (legacy)` });
    }
    return opts;
  })();

  // ── Notify parent ────────────────────────────────────────────────────────────
  const notify = (p: string, f: string, s: string, ct: string, y: string) =>
    onChange({ program: p, faculty: f, subject: s, cohort: ct, academicYear: y });

  // ── Handlers ─────────────────────────────────────────────────────────────────
  function handleProgramChange(value: string) {
    setProgram(value);
    setFaculty("");
    setSubject("");
    setCohortId("");
    setCohortText("");
    setAcademicYear("");
    notify(value, "", "", "", "");
  }

  function handleFacultyChange(value: string) {
    setFaculty(value);
    setSubject(""); // reset subject whenever faculty changes
    notify(program, value, "", cohortText, academicYear);
  }

  function handleSubjectChange(value: string) {
    setSubject(value);
    notify(program, faculty, value, cohortText, academicYear);
  }

  function handleCohortChange(selectedId: string) {
    setCohortId(selectedId);
    const matched = allCohorts.find((c) => c.id === selectedId);
    const text = matched ? String(matched.number) : (selectedId === "__legacy__" ? cohortText : "");
    setCohortText(text);
    // Auto-select academic year if exactly one option
    const years = allYears.filter((y) => y.cohort_id === selectedId);
    const newYear = years.length === 1 ? years[0].label : "";
    setAcademicYear(newYear);
    notify(program, faculty, subject, text, newYear);
  }

  function handleYearChange(value: string) {
    setAcademicYear(value);
    notify(program, faculty, subject, cohortText, value);
  }

  // ── Inline-add handlers ───────────────────────────────────────────────────────
  async function handleAddCohort(input: string): Promise<SelectOption | null> {
    const num = parseInt(input.trim(), 10);
    if (isNaN(num) || num < 1) return null;

    const { data, error } = await addResearchCohort({ programCode: program, number: num });
    if (error || !data) return null;

    const res = await getResearchCohorts();
    setAllCohorts(res.data ?? []);

    return {
      value: data.id,
      label: data.label ?? `ជំនាន់ទី ${data.number} — Cohort ${data.number}`,
    };
  }

  async function handleAddYear(input: string): Promise<SelectOption | null> {
    if (!cohortId || cohortId === "__legacy__") return null;

    const { data, error } = await addResearchAcademicYear({ cohortId, label: input.trim() });
    if (error || !data) return null;

    const res = await getResearchAcademicYears();
    setAllYears(res.data ?? []);

    return { value: data.label, label: data.label };
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Program */}
      <div>
        <label className="block text-sm font-semibold text-text-body mb-1.5">
          កម្មវិធី (Program) <span className="text-red-500">*</span>
        </label>
        <select
          value={program}
          onChange={(e) => handleProgramChange(e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">-- ជ្រើសរើសកម្មវិធី / Select Program --</option>
          {PROGRAMS.map((p) => (
            <option key={p.code} value={p.code}>
              {p.nameKm} — {p.nameEn}
            </option>
          ))}
        </select>
      </div>

      {/* Faculty — only for b_ed_12_4 */}
      {hasFaculty && (
        <div>
          <label className="block text-sm font-semibold text-text-body mb-1.5">
            មហាវិទ្យាល័យ / ជំនាញ (Faculty/Major) <span className="text-red-500">*</span>
          </label>
          <select
            value={faculty}
            onChange={(e) => handleFacultyChange(e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">-- ជ្រើសរើសជំនាញ / Select Faculty/Major --</option>
            {facultyOptions.map((f) => (
              <option key={f.code} value={f.code}>
                {f.nameKm} — {f.nameEn}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Subject — only for lower_secondary (or any faculty where hasSubject = true) */}
      {hasSubject && (
        <div>
          <label className="block text-sm font-semibold text-text-body mb-1.5">
            មុខវិជ្ជា (Subject) <span className="text-red-500">*</span>
          </label>
          <select
            value={subject}
            onChange={(e) => handleSubjectChange(e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">-- ជ្រើសរើសមុខវិជ្ជា / Select Subject --</option>
            {subjectOptions.map((s) => (
              <option key={s.code} value={s.code}>
                {s.nameKm} — {s.nameEn}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Cohort + Academic Year */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-text-body mb-1.5">
            ជំនាន់ (Cohort) <span className="text-red-500">*</span>
          </label>
          <AddableSelect
            value={cohortId}
            onChange={(id) => { handleCohortChange(id); }}
            options={cohortOptions}
            onAdd={program ? handleAddCohort : undefined}
            placeholder={loadingData ? "Loading…" : "-- ជ្រើសរើសជំនាន់ --"}
            addPlaceholder="Enter cohort number…"
            addHint="Enter a number (e.g. 7)"
            disabled={!program || loadingData}
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-text-body mb-1.5">
            ឆ្នាំសិក្សា (Academic Year) <span className="text-red-500">*</span>
          </label>
          <AddableSelect
            value={academicYear}
            onChange={(y) => { handleYearChange(y); }}
            options={yearOptions}
            onAdd={cohortId && cohortId !== "__legacy__" ? handleAddYear : undefined}
            placeholder={loadingData ? "Loading…" : "-- ជ្រើសរើសឆ្នាំ --"}
            addPlaceholder="Enter year (e.g. 2025-2026)…"
            addHint="Format: YYYY-YYYY (e.g. 2025-2026)"
            disabled={!cohortId || loadingData}
          />
        </div>
      </div>
    </div>
  );
}
