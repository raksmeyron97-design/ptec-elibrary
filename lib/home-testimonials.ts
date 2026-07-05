// lib/home-testimonials.ts
// Testimonials shown on the homepage. INTENTIONALLY EMPTY at launch: the
// section renders nothing until real quotes are added here. Do not invent
// quotes — fabricated testimonials damage exactly the trust the section is
// meant to build.
//
// Collect 3–5 short quotes (≤160 chars EN, ≤120 chars KM) from a mix of
// roles — ideally one current student, one lecturer, one alumnus — then fill
// in entries like the commented example below.

export type Testimonial = {
  quote: { en: string; km: string };
  /** Person's display name (used as-is in both locales). */
  name: string;
  role: { en: string; km: string };
};

export const HOME_TESTIMONIALS: Testimonial[] = [
  // {
  //   quote: {
  //     en: "I wrote my whole methodology chapter from the research collection — without leaving my dorm.",
  //     km: "ខ្ញុំបានសរសេរជំពូកវិធីសាស្ត្រទាំងមូល ដោយប្រើបណ្ដុំឯកសារស្រាវជ្រាវ។",
  //   },
  //   name: "Sok Dara",
  //   role: { en: "Year-3 student, Mathematics", km: "និស្សិតឆ្នាំទី៣ គណិតវិទ្យា" },
  // },
];
