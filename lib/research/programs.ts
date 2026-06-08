// ─────────────────────────────────────────────────────────────────────────────
// Config-driven program, faculty, and subject data.
//
// Cohort and Academic Year data lives in the database (research_cohorts /
// research_academic_years). Use getResearchCohorts() / getResearchAcademicYears()
// server actions to fetch those option lists.
//
// ⚠️  Faculty and subject lists are TEMPLATES — confirm the complete lists with
// the institution before shipping.
// ─────────────────────────────────────────────────────────────────────────────

export type ProgramCode = "b_ed_12_4" | "bachelor_plus_1";

export interface SubjectOption {
  code: string;
  nameEn: string;
  nameKm: string;
}

export interface FacultyOption {
  code: string;
  nameEn: string;
  nameKm: string;
  hasSubject?: boolean;       // true → render the Subject select for this faculty
  subjects?: SubjectOption[]; // options shown when hasSubject is true
}

export interface ProgramConfig {
  code: ProgramCode;
  nameEn: string;
  nameKm: string;
  durationYears: number;
  hasFaculty: boolean;
  faculties: FacultyOption[];
}

// ⚠️ TODO: Confirm faculty and subject lists with the institution.
export const PROGRAMS: ProgramConfig[] = [
  {
    code: "b_ed_12_4",
    nameEn: "Bachelor of Education (12+4)",
    nameKm: "បរិញ្ញាបត្រអប់រំ (១២+៤)",
    durationYears: 4,
    hasFaculty: true,
    faculties: [
      {
        code: "primary",
        nameEn: "Primary Education",
        nameKm: "បឋមសិក្សា",
      },
      {
        code: "lower_secondary",
        nameEn: "Lower Secondary Education",
        nameKm: "មធ្យមសិក្សាបឋមភូមិ",
        hasSubject: true,
        subjects: [
          // ⚠️ TODO: Confirm this subject list with the institution.
          { code: "math",      nameEn: "Mathematics",      nameKm: "គណិតវិទ្យា" },
          { code: "physics",   nameEn: "Physics",          nameKm: "រូបវិទ្យា" },
          { code: "chemistry", nameEn: "Chemistry",        nameKm: "គីមីវិទ្យា" },
          { code: "biology",   nameEn: "Biology",          nameKm: "ជីវវិទ្យា" },
          { code: "khmer",     nameEn: "Khmer Literature", nameKm: "អក្សរសាស្ត្រខ្មែរ" },
          { code: "history",   nameEn: "History",          nameKm: "ប្រវត្តិវិទ្យា" },
          { code: "geography", nameEn: "Geography",        nameKm: "ភូមិវិទ្យា" },
          { code: "english",   nameEn: "English",          nameKm: "ភាសាអង់គ្លេស" },
          { code: "ict",       nameEn: "ICT",              nameKm: "បច្ចេកវិទ្យាព័ត៌មាន" },
        ],
      },
      // ⚠️ TODO: Add remaining faculty/major options
    ],
  },
  {
    code: "bachelor_plus_1",
    nameEn: "Bachelor + 1",
    nameKm: "បរិញ្ញាបត្រ +១",
    durationYears: 1,
    hasFaculty: false,
    faculties: [],
  },
];

// ── Accessors ──────────────────────────────────────────────────────────────

export const getProgram = (code?: string | null): ProgramConfig | undefined =>
  PROGRAMS.find((p) => p.code === code);

export const getFacultiesForProgram = (code?: string | null): FacultyOption[] =>
  getProgram(code)?.faculties ?? [];

export const getSubjectsForFaculty = (
  programCode?: string | null,
  facultyCode?: string | null,
): SubjectOption[] => {
  const f = getFacultiesForProgram(programCode).find((x) => x.code === facultyCode);
  return f?.hasSubject ? (f.subjects ?? []) : [];
};
