// lib/library-info.ts
// Single source of truth for library facts used by the AI assistant.
// Hours and location come from messages/*.json footer values.
// Borrowing/rules are TODO — see notes below.

export const LIBRARY_INFO = {
  name: {
    en: "PTEC Library (Phnom Penh Teacher Education College)",
    km: "បណ្ណាល័យ វ.គ.ភ (វិទ្យាស្ថានគរុកោសល្យរាជធានីភ្នំពេញ)",
  },
  location: {
    en: "St. 271, Sangkat Teuk Laork 3, Khan Toul Kork, Phnom Penh, Cambodia.",
    km: "ផ្លូវ ២៧១ សង្កាត់ទឹកល្អក់៣ ខណ្ឌទួលគោក រាជធានីភ្នំពេញ ព្រះរាជាណាចក្រកម្ពុជា",
  },
  phone: "012 950 192",
  email: "info@ptec.edu.kh",
  hours: {
    en: "Monday to Saturday: 7:00 AM – 5:00 PM. Sunday: Closed.",
    km: "ច័ន្ទ ដល់ សៅរ៍: ម៉ោង ៧:០០ ព្រឹក – ៥:០០ ល្ងាច។ ថ្ងៃអាទិត្យ: បិទ។",
  },
  borrowing: {
    // TODO: confirm borrowing rules with librarian — not found in repo pages
    en: "TODO: Please contact the library staff directly at 012 950 192 or visit the library for full borrowing rules.",
    km: "TODO: សូមទំនាក់ទំនងបុគ្គលិកបណ្ណាល័យដោយផ្ទាល់តាម ០១២ ៩៥០ ១៩២ ឬមកទស្សនាបណ្ណាល័យ សម្រាប់ព័ត៌មានលម្អិតអំពីការខ្ចី",
  },
  rules: {
    // TODO: confirm library rules — not found in repo; /about/rules page exists but has no rule content
    en: "TODO: Please refer to the Library Rules page (/about/rules) or contact library staff for the full list of rules.",
    km: "TODO: សូមមើលទំព័របទបញ្ជាបណ្ណាល័យ (/about/rules) ឬទំនាក់ទំនងបុគ្គលិក",
  },
  links: {
    catalog: "/catalogs",
    ebooks: "/books",
    rules: "/about/rules",
    timings: "/about/timings",
    contact: "/contact",
  },
} as const;

export type LibraryInfoTopic = "hours" | "location" | "contact" | "borrowing" | "rules";
