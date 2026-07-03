// lib/library-info.ts
// Single source of truth for library facts used by the AI assistant.
// Content is kept in step with the public About pages under app/(public)/about/*.

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
  website: "www.ptec.edu.kh",

  // ── Hours (mirrors app/(public)/about/timings) ──────────────────────────────
  hours: {
    en: "Monday–Friday: 7:00 AM – 5:00 PM. Saturday: 8:00 AM – 4:00 PM. Sunday & public holidays: Closed. During exam periods hours extend to 7:00 PM. The online e-Library is available 24/7.",
    km: "ច័ន្ទ–សុក្រ: ៧:០០ ព្រឹក – ៥:០០ ល្ងាច។ ថ្ងៃសៅរ៍: ៨:០០ ព្រឹក – ៤:០០ រសៀល។ ថ្ងៃអាទិត្យ និងថ្ងៃបុណ្យ: បិទ។ រដូវប្រឡងបើករហូតដល់ម៉ោង ៧:០០ យប់។ បណ្ណាល័យអនឡាញអាចប្រើប្រាស់បាន ២៤ម៉ោង។",
  },

  // ── About / identity (mirrors about, our-journey) ───────────────────────────
  about: {
    en: "The PTEC Library belongs to the Department of Educational Research and Library — one of the 7 departments of Phnom Penh Teacher Education College — under the Faculty of Educational Research. It is the central support for educational research and library services for staff and student-teachers. Its publishing arm, PTEC Library Press, has published over 30 instructor titles and 4 educational research bulletins as of 2025, and continues to expand digital distribution.",
    km: "បណ្ណាល័យ វ.គ.ភ ចំណុះឱ្យដេប៉ាតឺម៉ង់ស្រាវជ្រាវអប់រំ និងបណ្ណាល័យ ដែលជាដេប៉ាតឺម៉ង់មួយក្នុងចំណោមដេប៉ាតឺម៉ង់ទាំង៧។ វាជាសេនាធិការស្នូលគាំទ្រការស្រាវជ្រាវអប់រំ និងសេវាបណ្ណាល័យកណ្ដាល។ ការបោះពុម្ព «PTEC Library Press» បានបោះពុម្ពស្នាដៃគ្រូឧទ្ទេសជាង៣០ចំណងជើង និងព្រឹត្តិបត្រស្រាវជ្រាវ៤ចំណងជើង គិតត្រឹមឆ្នាំ២០២៥។",
  },
  mission: {
    en: "To provide quality information resources, library services, and learning spaces that support teaching, learning, research, and innovation — developing competent, ethical, and innovative educators for the 21st century.",
    km: "ផ្តល់ធនធានព័ត៌មាន សេវាកម្មបណ្ណាល័យ និងបរិយាកាសសិក្សាប្រកបដោយគុណភាព ដើម្បីគាំទ្រការបង្រៀន ការរៀន ការស្រាវជ្រាវ និងនវានុវត្តន៍ សំដៅអភិវឌ្ឍគ្រូបង្រៀនប្រកបដោយសមត្ថភាព សីលធម៌ និងភាពជាអ្នកដឹកនាំក្នុងសតវត្សទី២១។",
  },
  vision: {
    en: "To become a leading teacher-education library and a center of knowledge, research, and innovation that advances excellence in teaching, learning, and educational development in the 21st century.",
    km: "ក្លាយជាបណ្ណាល័យគរុកោសល្យឈានមុខគេ ដែលជាមជ្ឈមណ្ឌលចំណេះដឹង ការស្រាវជ្រាវ និងនវានុវត្តន៍ សម្រាប់ការបណ្តុះបណ្តាលគ្រូបង្រៀនប្រកបដោយឧត្តមភាពក្នុងសតវត្សទី២១។",
  },
  values: {
    en: "Quality, Knowledge, Integrity, Collaboration, Innovation, and Inclusion.",
    km: "គុណភាព ចំណេះដឹង សុចរិតភាព កិច្ចសហការ នវានុវត្តន៍ និងបរិយាបន្ន។",
  },

  // ── Collection (mirrors about/collection) ───────────────────────────────────
  collection: {
    en: "The physical collection holds 2,766 titles and 45,085 copies (22,067 non-textbook copies and 23,018 G1–G12 textbook copies), classified by the Dewey Decimal Classification (DDC 000–900) plus a textbook group. Available in 6 languages: Khmer, English, Japanese, Korean, Chinese, and Thai. Special collections include Action Research, Student-Teacher Graduation Reports, Theses & Dissertations, and Journals & Research Articles.",
    km: "បណ្ដុំឯកសាររូបវន្តមាន ២,៧៦៦ ចំណងជើង និង ៤៥,០៨៥ ក្បាល ចាត់ថ្នាក់តាមប្រព័ន្ធ DDC (០០០–៩០០)។ មានជា ៦ ភាសា៖ ខ្មែរ អង់គ្លេស ជប៉ុន កូរ៉េ ចិន និងថៃ។ ការប្រមូលពិសេសរួមមាន ការស្រាវជ្រាវប្រតិបត្តិ របាយការណ៍បញ្ចប់ការសិក្សា សារណាបទ និងទស្សនាវដ្ដីស្រាវជ្រាវ។",
  },

  // ── History (mirrors about/our-journey) ─────────────────────────────────────
  history: {
    en: "The library was established in 2017 as part of the Department of Educational Research and Library. Key achievements include subject-based instructional textbooks by college instructors and 6 volumes of the educational research bulletin. Its future goal is to become a fully online library accessible to every educator, anytime, anywhere.",
    km: "បណ្ណាល័យត្រូវបានបង្កើតឡើងក្នុងឆ្នាំ២០១៧។ សមិទ្ធិផលរួមមាន ការបោះពុម្ពសៀវភៅសិក្សាតាមមុខវិជ្ជា និងព្រឹត្តិបត្រស្រាវជ្រាវអប់រំចំនួន៦ភាគ។ គោលដៅអនាគតគឺក្លាយជាបណ្ណាល័យអនឡាញពេញលេញ។",
  },

  // ── Services (mirrors about) ────────────────────────────────────────────────
  services: {
    en: "Borrowing & returns, reading and study spaces, reference & information services, research support, the digital e-Library, information-literacy training, and meeting rooms.",
    km: "សេវាខ្ចី-សងឯកសារ ការអាននិងសិក្សា សេវាព័ត៌មាននិងឯកសារយោង សេវាគាំទ្រការស្រាវជ្រាវ បណ្ណាល័យឌីជីថល បណ្តុះបណ្តាលជំនាញព័ត៌មាន និងបន្ទប់ប្រជុំ។",
  },

  // ── Membership (mirrors about/rules) ────────────────────────────────────────
  membership: {
    en: "Staff, instructors, and student-teachers must hold a library membership card to register in the library's PMB system. The card is personal and must not be lent to others.",
    km: "បុគ្គលិក លោកគ្រូ អ្នកគ្រូ និងគរុនិស្សិត ត្រូវមានប័ណ្ណសមាជិកបណ្ណាល័យ ដើម្បីចុះឈ្មោះក្នុងប្រព័ន្ធ PMB។ ប័ណ្ណនេះមិនត្រូវផ្ដល់ឱ្យអ្នកដទៃប្រើប្រាស់ឡើយ។",
  },

  // ── Borrowing (mirrors about/rules borrowing section) ───────────────────────
  borrowing: {
    en: "Student-teachers may borrow up to 5 books at a time: Khmer books for 14 days (renewable as needed), English books for 7 days (one renewal). Instructors and staff may borrow up to 5 books for 30 days (excluding weekends and public holidays). Reference sets, dictionaries, journals, and some titles are library-use only and cannot be taken out.",
    km: "គរុនិស្សិតអាចខ្ចីម្ដងបាន ៥ ក្បាល៖ សៀវភៅខ្មែរ ១៤ ថ្ងៃ (ខ្ចីបន្តបាន), សៀវភៅអង់គ្លេស ៧ ថ្ងៃ (ខ្ចីបន្តម្ដង)។ គ្រូឧទ្ទេស និងបុគ្គលិកខ្ចី ៥ ក្បាល រយៈពេល ៣០ ថ្ងៃ។ វចនានុក្រម ទស្សនាវដ្ដី និងកម្រងឯកសារខ្លះ មិនអនុញ្ញាតឱ្យខ្ចីយកចេញឡើយ។",
  },

  // ── Rules & penalties (mirrors about/rules) ─────────────────────────────────
  rules: {
    en: "Keep the library quiet; phones on silent. No smoking, eating, drinking, littering, or spitting inside. Lost or damaged books must be replaced or paid at double their value. Overdue returns incur a fine, and repeated violations can lead to borrowing suspension of one semester to one academic year.",
    km: "ត្រូវរក្សាភាពស្ងៀមស្ងាត់ បិទសម្លេងទូរស័ព្ទ។ ហាមជក់បារី ពិសារអាហារ ភេសជ្ជៈ ចោលសម្រាម និងខាកស្ដោះ។ សៀវភៅបាត់ ឬខូច ត្រូវសងទ្វេរដងនៃតម្លៃ ឬទិញថ្មីសង។ សងយឺតត្រូវពិន័យ ហើយការមិនគោរពម្ដងហើយម្ដងទៀត អាចត្រូវផ្អាកការខ្ចីពី ១ ឆមាស ដល់ ១ ឆ្នាំសិក្សា។",
  },

  links: {
    catalog: "/catalogs",
    ebooks: "/books",
    research: "/research",
    posts: "/posts",
    about: "/about",
    collection: "/about/collection",
    journey: "/about/our-journey",
    rules: "/about/rules",
    timings: "/about/timings",
    contact: "/contact",
  },
} as const;

export type LibraryInfoTopic =
  | "hours"
  | "location"
  | "contact"
  | "borrowing"
  | "rules"
  | "about"
  | "mission"
  | "vision"
  | "values"
  | "collection"
  | "history"
  | "services"
  | "membership";
