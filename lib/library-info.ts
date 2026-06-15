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
    en: "Print materials should be returned by the due date shown on the student account. Damaged or lost materials must be reported to the library desk. Digital resources remain available through the catalogue according to licensing.",
    km: "ឯកសារបោះពុម្ពត្រូវតែប្រគល់ត្រឡប់មកវិញតាមកាលបរិច្ឆេទកំណត់ដែលបានបង្ហាញនៅលើគណនីនិស្សិត។ ឯកសារដែលខូចខាត ឬបាត់បង់ត្រូវរាយការណ៍ទៅកាន់បញ្ជរបណ្ណាល័យ។ ធនធានឌីជីថលនៅតែអាចប្រើប្រាស់បានតាមរយៈកាតាឡុកស្របតាមការអនុញ្ញាត។",
  },
  rules: {
    en: "Students are expected to maintain a quiet environment. Print materials must be returned on time. Damaged or lost materials must be reported to the library desk.",
    km: "និស្សិតត្រូវរក្សាបរិយាកាសស្ងប់ស្ងាត់។ ឯកសារបោះពុម្ពត្រូវតែប្រគល់ត្រឡប់មកវិញឱ្យបានទាន់ពេលវេលា។ ឯកសារដែលខូចខាត ឬបាត់បង់ត្រូវរាយការណ៍ទៅកាន់បញ្ជរបណ្ណាល័យ។",
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
