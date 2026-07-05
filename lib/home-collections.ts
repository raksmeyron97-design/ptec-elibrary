// lib/home-collections.ts
// Curated "Research Collections" shown on the homepage — the librarian's
// editorial voice. Each entry points at one department (so the card's count
// always matches what the link lands on) and adds a bilingual description.
//
// To feature a different collection, edit this list: `department` must match
// the department name exactly as stored in the DB (Khmer). Entries whose
// department has no published books are hidden automatically.

export type HomeCollection = {
  /** Department name exactly as stored in the `departments` table. */
  department: string;
  label: { en: string; km: string };
  description: { en: string; km: string };
};

export const HOME_COLLECTIONS: HomeCollection[] = [
  {
    department: "ស្រាវជ្រាវ",
    label: {
      en: "Research & Methodology",
      km: "ស្រាវជ្រាវ និងវិធីសាស្ត្រ",
    },
    description: {
      en: "Research design, action research, and academic writing for student-teachers.",
      km: "ការរចនាការស្រាវជ្រាវ ការស្រាវជ្រាវជាក់ស្ដែង និងការសរសេរអត្ថបទសិក្សា សម្រាប់គរុនិស្សិត។",
    },
  },
  {
    department: "ស្ថិតិ",
    label: {
      en: "Statistics & Data",
      km: "ស្ថិតិ និងទិន្នន័យ",
    },
    description: {
      en: "Statistical methods and data literacy for education research.",
      km: "វិធីសាស្ត្រស្ថិតិ និងចំណេះដឹងទិន្នន័យ សម្រាប់ការស្រាវជ្រាវអប់រំ។",
    },
  },
  {
    department: "ភាសាអង់គ្លេស",
    label: {
      en: "English Language Teaching",
      km: "ការបង្រៀនភាសាអង់គ្លេស",
    },
    description: {
      en: "ELT methods, classroom language, and learning materials.",
      km: "វិធីសាស្ត្របង្រៀនភាសាអង់គ្លេស ភាសាក្នុងថ្នាក់រៀន និងសម្ភារៈសិក្សា។",
    },
  },
];
