// ─────────────────────────────────────────────────────────────────────────────
// Config-driven SUBJECT data only.
//
// Programs and Faculties are now stored in the database (research_programs /
// research_faculties tables). Use getThesisPrograms() / getThesisFaculties()
// server actions to fetch those option lists.
//
// Subjects remain config-driven because they are tightly coupled to specific
// faculties (e.g. lower_secondary has a fixed set of subjects).
// ─────────────────────────────────────────────────────────────────────────────

export interface SubjectOption {
  code: string;
  nameEn: string;
  nameKm: string;
}

// ── Subject config (keyed by faculty code) ──────────────────────────────────
// Subjects are only applicable for faculties where has_subject = true in the
// research_faculties table. The faculty code is the key.

const SUBJECT_MAP: Record<string, SubjectOption[]> = {
  lower_secondary: [
    { code: "math",          nameEn: "Mathematics",      nameKm: "គណិតវិទ្យា" },
    { code: "physics",       nameEn: "Physics",          nameKm: "រូបវិទ្យា" },
    { code: "chemistry",     nameEn: "Chemistry",        nameKm: "គីមីវិទ្យា" },
    { code: "biology",       nameEn: "Biology",          nameKm: "ជីវវិទ្យា" },
    { code: "khmer",         nameEn: "Khmer Literature", nameKm: "អក្សរសាស្ត្រខ្មែរ" },
    { code: "history",       nameEn: "History",          nameKm: "ប្រវត្តិវិទ្យា" },
    { code: "geography",     nameEn: "Geography",        nameKm: "ភូមិវិទ្យា" },
    { code: "earth_science", nameEn: "Earth Science",    nameKm: "ផែនដីវិទ្យា" },
    { code: "morals_civics", nameEn: "Morals & Civics",  nameKm: "សីលធម៌ និងពលរដ្ឋវិជ្ជា" },
    { code: "english",       nameEn: "English",          nameKm: "ភាសាអង់គ្លេស" },
    { code: "french",        nameEn: "French",           nameKm: "ភាសាបារាំង" },
    { code: "pe_health",     nameEn: "Physical Ed.",     nameKm: "អប់រំកាយ និងសុខភាព" },
    { code: "ict",           nameEn: "ICT",              nameKm: "បច្ចេកវិទ្យាព័ត៌មាន" },
  ],
};

// ── Accessors ──────────────────────────────────────────────────────────────

/**
 * Returns the subject options for a given faculty code.
 * Only faculties with has_subject = true should call this.
 * The programCode parameter is kept for backward compatibility but is no longer used.
 */
export const getSubjectsForFaculty = (
  _programCode?: string | null,
  facultyCode?: string | null,
): SubjectOption[] => {
  if (!facultyCode) return [];
  return SUBJECT_MAP[facultyCode] ?? [];
};
