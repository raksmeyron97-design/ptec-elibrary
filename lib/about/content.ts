// lib/about/content.ts
//
// THE single source of truth for institutional facts shown on the five
// About pages. Transcribed from the library's own information form
// (docs/library_info_form.docx, sections 1–8) on 2026-07-29.
//
// ── Rules for editing this file ──────────────────────────────────────────────
//
// 1. Nothing here may be invented. Every string traces to a numbered section
//    of the source form; the section number is in the comment above it.
// 2. Khmer is the ORIGINAL for most fields — the form was written in Khmer.
//    Where the form supplied official English (slogan, mission, vision) it is
//    reproduced verbatim. Everywhere else the `en` string is a WORKING
//    TRANSLATION awaiting the library's sign-off; see
//    docs/about-pages-content-validation.md §13.
// 3. A blank field in the form stays absent here. Do not fill a gap with a
//    plausible value — the pages have empty states for exactly this.
// 4. Figures the form states inconsistently carry `confidence: "disputed"`
//    and MUST NOT be rendered as headline statistics.
//
// Operational data deliberately NOT duplicated here:
//   • opening hours + closures → published system settings (getSiteConfig())
//   • team members             → `team_members_public` view (lib/team/public)
//   • digital resource counts  → getCollectionStats() (live, exact)

import type {
  BorrowingAllowance,
  CollectionLanguage,
  ConductRule,
  DdcCategory,
  JourneyAchievement,
  JourneyMilestone,
  Penalty,
  PhysicalCollectionSnapshot,
  RoadmapItem,
  RuleCategory,
  SpecialCollection,
  SpecialScheduleRow,
} from "./types";

/**
 * When the library last reviewed the institutional content on these pages.
 * Shown by <ContentLastUpdated>. Bump this when the source form is revised.
 */
export const ABOUT_CONTENT_REVIEWED_AT = "2026-07-29";

/** Policy version stamped on /about/rules. */
export const RULES_POLICY_VERSION = "1.0";

// ─────────────────────────────────────────────────────────────────────────────
// OUR JOURNEY  (source form §2)
// ─────────────────────────────────────────────────────────────────────────────

/** §2.1 — founding year. */
export const FOUNDING_YEAR = 2017;

/** §2.2 — founding story, Khmer original. */
export const FOUNDING_STORY = {
  km:
    "ដើម្បីឱ្យសមស្របទៅតាមលក្ខខណ្ឌកំណត់នៃស្តង់ដាសាលាគរុកោសល្យគំរូ " +
    "ដេប៉ាតឺម៉ង់បានបង្កើតឱ្យមានការបោះពុម្ពផ្សាយ និងគាំទ្រលើជំនាញរៀបចំឯកសារ " +
    "ការបោះពុម្ពព្រឹត្តិបត្រស្រាវជ្រាវអប់រំ ដែលមានឈ្មោះថា «PTEC Library Press»។",
  en:
    "To meet the requirements of the model teacher-education college standard, " +
    "the department established a publishing arm supporting documentation skills " +
    "and the printing of the educational research bulletin, named " +
    "“PTEC Library Press”.",
};

/** §1.4 — institutional context for the founding section. */
export const DEPARTMENT_CONTEXT = {
  km:
    "ដេប៉ាតឺម៉ង់ស្រាវជ្រាវអប់រំ និងបណ្ណាល័យ " +
    "ជាដេប៉ាតឺម៉ង់មួយក្នុងចំណោមដេប៉ាតឺម៉ង់ទាំង៧ របស់វិទ្យាស្ថានគរុកោសល្យរាជធានីភ្នំពេញ " +
    "ហើយចំណុះឱ្យមហាវិទ្យាល័យស្រាវជ្រាវគរុកោសល្យ។ " +
    "ដេប៉ាតឺម៉ង់នេះជាសេនាធិការអប់រំស្នូល គាំទ្រការស្រាវជ្រាវអប់រំ " +
    "និងសេវាបណ្ណាល័យកណ្ដាលដល់បុគ្គលិកអប់រំ និងគរុនិស្សិតគ្រប់ទម្រង់។",
  en:
    "The Department of Educational Research and Library is one of the seven " +
    "departments of Phnom Penh Teacher Education College, under the Faculty of " +
    "Teacher Education Research. It is the college’s core academic support unit " +
    "for educational research and central library services for staff and " +
    "student teachers alike.",
};

/**
 * §2.3 — the source form's timeline table was submitted EMPTY. These two
 * entries are the only dated facts the form actually states (§2.1 founding
 * year; §1.4 "as of 2025, PTEC Library Press has published…"). The page
 * renders an explicit "more milestones to come" state rather than padding
 * this list — see docs/about-pages-content-validation.md §2.
 */
export const JOURNEY_MILESTONES: JourneyMilestone[] = [
  {
    id: "founded-2017",
    year: FOUNDING_YEAR,
    title: {
      km: "បង្កើតបណ្ណាល័យ",
      en: "The library is established",
    },
    description: {
      km:
        "បណ្ណាល័យត្រូវបានបង្កើតឡើងជាផ្នែកមួយនៃដេប៉ាតឺម៉ង់ស្រាវជ្រាវអប់រំ និងបណ្ណាល័យ " +
        "នៃវិទ្យាស្ថានគរុកោសល្យរាជធានីភ្នំពេញ។",
      en:
        "The library was established as part of the Department of Educational " +
        "Research and Library at Phnom Penh Teacher Education College.",
    },
    displayOrder: 1,
    isPublished: true,
  },
  {
    id: "press-2025",
    year: 2025,
    title: {
      km: "PTEC Library Press បោះពុម្ពស្នាដៃលើសពី ៣០ ចំណងជើង",
      en: "PTEC Library Press passes 30 published titles",
    },
    description: {
      km:
        "រហូតដល់ឆ្នាំ២០២៥ PTEC Library Press បានបោះពុម្ពស្នាដៃគ្រូឧទ្ទេសលើសពី ៣០ ចំណងជើង " +
        "ព្រមទាំងផ្សព្វផ្សាយឯកសារឌីជីថលបន្ថែមទៀត។",
      en:
        "As of 2025, PTEC Library Press has published more than 30 titles by " +
        "college instructors, alongside a growing body of digital material.",
    },
    displayOrder: 2,
    isPublished: true,
  },
];

/**
 * §2.4 + §1.4 — achievements.
 *
 * The research-bulletin count is DISPUTED: §1.4 says four titles
 * ("ឯកសារព្រឹត្តិបត្រអប់រំ ចំនួន៤ ចំណងជើង"), §2.4 says six volumes
 * ("បានចំនួន៦ភាគ"). The card therefore carries no number until the library
 * confirms which figure — and which unit — is correct.
 */
export const JOURNEY_ACHIEVEMENTS: JourneyAchievement[] = [
  {
    id: "instructor-textbooks",
    icon: "book",
    title: {
      km: "ការបោះពុម្ពសៀវភៅសិក្សាគោលតាមមុខវិជ្ជារបស់គ្រូឧទ្ទេស",
      en: "Subject textbooks written by college instructors",
    },
    description: {
      km: "ការបោះពុម្ពសៀវភៅសិក្សាគោលតាមមុខវិជ្ជា ដោយគ្រូឧទ្ទេសរបស់វិទ្យាស្ថាន។",
      en:
        "Core subject textbooks authored by PTEC instructors and published " +
        "through the library’s own press.",
    },
  },
  {
    id: "press-titles",
    icon: "press",
    title: {
      km: "ស្នាដៃគ្រូឧទ្ទេសដែលបានបោះពុម្ព",
      en: "Instructor titles published",
    },
    description: {
      km: "ចំនួនស្នាដៃគ្រូឧទ្ទេស ដែល PTEC Library Press បានបោះពុម្ព គិតត្រឹមឆ្នាំ២០២៥។",
      en:
        "Titles by college instructors published by PTEC Library Press, " +
        "as reported for 2025.",
    },
    count: { value: 30, confidence: "verified", sourceSection: "1.4" },
    isMinimum: true,
  },
  {
    id: "research-bulletin",
    icon: "bulletin",
    title: {
      km: "ព្រឹត្តិបត្រស្រាវជ្រាវអប់រំ",
      en: "Educational research bulletin",
    },
    description: {
      km:
        "ការបោះពុម្ពព្រឹត្តិបត្រស្រាវជ្រាវអប់រំជាបន្តបន្ទាប់ " +
        "ដើម្បីផ្សព្វផ្សាយលទ្ធផលស្រាវជ្រាវរបស់វិទ្យាស្ថាន។",
      en:
        "An ongoing bulletin series publishing the college’s educational " +
        "research.",
    },
    // Intentionally no `count` — see the disputed figure note above.
  },
  {
    id: "digital-distribution",
    icon: "globe",
    title: {
      km: "ការផ្សព្វផ្សាយឯកសារឌីជីថល",
      en: "Digital distribution",
    },
    description: {
      km: "ការផ្សព្វផ្សាយឯកសារឌីជីថលជាលក្ខណៈទូនិម្មិត បន្ថែមលើឯកសារបោះពុម្ព។",
      en:
        "Virtual distribution of digital documents alongside the printed " +
        "catalogue, widening access for readers and researchers.",
    },
  },
];

/**
 * §2.6 — the form states one future goal: "ជាបណ្ណាល័យអនឡាញពេញលេញ"
 * (to become a fully online library). The three supporting directions below
 * are readings of that single stated goal, NOT separate commitments from the
 * library, and the page labels the whole block "strategic direction".
 */
export const FUTURE_GOAL = {
  km: "ជាបណ្ណាល័យអនឡាញពេញលេញ",
  en: "To become a fully online library",
};

export const ROADMAP_ITEMS: RoadmapItem[] = [
  {
    id: "anytime-access",
    icon: "globe",
    title: { km: "ពង្រីកការចូលប្រើគ្រប់ពេលវេលា", en: "Expand anytime access" },
    description: {
      km: "ធ្វើឱ្យធនធានបណ្ណាល័យអាចចូលប្រើបានគ្រប់ពេល ទាំងក្នុង និងក្រៅបរិវេណវិទ្យាស្ថាន។",
      en:
        "Make library resources reachable at any hour, on and off campus, " +
        "through the e-Library.",
    },
  },
  {
    id: "digitize",
    icon: "scan",
    title: { km: "ធ្វើឌីជីថលូបនីយកម្មឯកសារសំខាន់ៗ", en: "Digitize key institutional resources" },
    description: {
      km: "បំប្លែងឯកសារស្ថាប័នសំខាន់ៗទៅជាទម្រង់ឌីជីថល ដើម្បីងាយស្រួលស្វែងរក និងចែករំលែក។",
      en:
        "Convert important institutional documents to digital form so they can " +
        "be searched and shared.",
    },
  },
  {
    id: "grow-research",
    icon: "books",
    title: { km: "បង្កើនឯកសារគរុកោសល្យ និងស្រាវជ្រាវ", en: "Grow teacher-education and research material" },
    description: {
      km: "បន្ថែមឯកសារគាំទ្រការបណ្ដុះបណ្ដាលគ្រូបង្រៀន និងការស្រាវជ្រាវអប់រំ។",
      en:
        "Add materials that support teacher training and educational research " +
        "for staff and student teachers.",
    },
  },
  {
    id: "preservation",
    icon: "archive",
    title: { km: "ថែរក្សាឯកសារឌីជីថលរយៈពេលវែង", en: "Improve long-term digital preservation" },
    description: {
      km: "រក្សាទុកឯកសារឌីជីថលឱ្យមានសុវត្ថិភាព និងអាចប្រើប្រាស់បានយូរអង្វែង។",
      en: "Keep digital holdings safe, readable and usable over the long term.",
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// LIBRARY RULES  (source form §5)
// ─────────────────────────────────────────────────────────────────────────────

/** §5.3 — the quick-reference borrowing table. Every figure is stated
 *  explicitly in the form. Visitors and online users appear in the audience
 *  selector but have no borrowing allowance, which the UI states plainly. */
export const BORROWING_ALLOWANCES: BorrowingAllowance[] = [
  {
    audience: "students",
    maxItems: 5,
    loanDays: [
      {
        key: "khmer",
        days: 14,
        renewal: { km: "អាចខ្ចីបន្តបានតាមតម្រូវការ", en: "Renewable as needed" },
      },
      {
        key: "english",
        days: 7,
        renewal: { km: "អាចខ្ចីបន្តបានមួយដង", en: "Renewable once" },
      },
    ],
  },
  {
    audience: "staff",
    maxItems: 5,
    loanDays: [
      {
        key: "default",
        days: 30,
        renewal: {
          km: "មិនគិតថ្ងៃឈប់សម្រាក និងថ្ងៃបុណ្យជាតិ",
          en: "Public holidays are not counted",
        },
      },
    ],
  },
];

/** §5.1, §5.2, §5.3, §5.4, §5.6 — the detailed rule text, split into clauses
 *  so the pages never render a single unreadable policy paragraph. */
export const RULE_CATEGORIES: RuleCategory[] = [
  {
    id: "general",
    icon: "info",
    title: { km: "បទបញ្ជាទូទៅ", en: "General rules" },
    summary: {
      km: "អ្នកចង់ប្រើ ឬខ្ចីសៀវភៅ ត្រូវសាកសួរព័ត៌មានពីបណ្ណារក្សជាមុនសិន",
      en: "Anyone wishing to use or borrow books should first ask a librarian",
    },
    clauses: [
      {
        km:
          "គរុសិស្ស គរុនិស្សិត គ្រូឧទ្ទេស និងបុគ្គលិកទាំងអស់ " +
          "នៃវិទ្យាស្ថានគរុកោសល្យរាជធានីភ្នំពេញ ដែលមានបំណងចង់ប្រើប្រាស់ " +
          "ឬខ្ចីសៀវភៅពីបណ្ណាល័យ ត្រូវសាកសួរព័ត៌មានពីបណ្ណារក្ស។",
        en:
          "All student teachers, instructors and staff of Phnom Penh Teacher " +
          "Education College who wish to use or borrow books from the library " +
          "should ask a librarian for information first.",
      },
    ],
    audiences: ["students", "staff", "visitors"],
  },
  {
    id: "membership",
    icon: "card",
    title: { km: "លក្ខខណ្ឌក្លាយជាសមាជិក", en: "Membership" },
    summary: {
      km: "ត្រូវមានប័ណ្ណសមាជិក ដើម្បីចុះឈ្មោះក្នុងប្រព័ន្ធ PMB — ហាមឱ្យអ្នកដទៃប្រើប័ណ្ណរបស់ខ្លួន",
      en: "A membership card is required for the PMB system — never lend your card to anyone else",
    },
    clauses: [
      {
        km:
          "បុគ្គលិក លោកគ្រូ អ្នកគ្រូ និងគរុនិស្សិត ត្រូវមានប័ណ្ណសមាជិកបណ្ណាល័យ " +
          "ដើម្បីចុះឈ្មោះបញ្ចូលក្នុងប្រព័ន្ធ PMB របស់បណ្ណាល័យ។",
        en:
          "Staff, teachers and student teachers must hold a library membership " +
          "card in order to be registered in the library’s PMB system.",
      },
      {
        km: "មិនត្រូវផ្ដល់ប័ណ្ណនេះទៅឱ្យអ្នកដទៃប្រើប្រាស់ឡើយ។",
        en: "The card must not be given to anyone else to use.",
      },
    ],
    audiences: ["students", "staff"],
  },
  {
    id: "borrowing",
    icon: "swap",
    title: { km: "ច្បាប់ខ្ចី និងសងសៀវភៅ", en: "Borrowing and returns" },
    summary: {
      km: "ខ្ចីបានម្ដងចំនួន ៥ ក្បាល — គរុនិស្សិត ១៤/៧ ថ្ងៃ, គ្រូឧទ្ទេស និងបុគ្គលិក ៣០ ថ្ងៃ",
      en: "Five items at a time — 14/7 days for student teachers, 30 days for instructors and staff",
    },
    clauses: [
      {
        km:
          "គរុសិស្ស និងគរុនិស្សិត អាចខ្ចីម្ដងបានចំនួន ៥ ក្បាល៖ " +
          "សៀវភៅជាភាសាខ្មែរ រយៈពេល ១៤ ថ្ងៃ និងអាចខ្ចីបន្តបានតាមតម្រូវការ។",
        en:
          "Student teachers may borrow five items at a time: books in Khmer for " +
          "14 days, renewable as needed.",
      },
      {
        km: "សៀវភៅជាភាសាអង់គ្លេស រយៈពេល ៧ ថ្ងៃ និងអាចខ្ចីបន្តបានមួយដង។",
        en: "Books in English are lent for 7 days and may be renewed once.",
      },
      {
        km:
          "គ្រូឧទ្ទេស និងបុគ្គលិកទាំងអស់ ខ្ចីម្ដងបានចំនួន ៥ ក្បាល រយៈពេល ៣០ ថ្ងៃ " +
          "ចាប់តាំងពីថ្ងៃដែលបានខ្ចី ដោយមិនគិតថ្ងៃឈប់សម្រាក និងថ្ងៃបុណ្យជាតិផ្សេងៗ។",
        en:
          "Instructors and staff may borrow five items at a time for 30 days " +
          "from the date of loan, excluding weekends and public holidays.",
      },
    ],
    audiences: ["students", "staff"],
  },
  {
    id: "lost-damaged",
    icon: "alert",
    title: { km: "សៀវភៅបាត់ ឬខូចខាត", en: "Lost or damaged materials" },
    summary: {
      km: "ករណីខូចខាត ឬបាត់បង់ ត្រូវសងតម្លៃទ្វេដង ឬទិញសៀវភៅថ្មីសងមកវិញ",
      en: "Damage or loss requires payment of twice the item’s value, or replacement with a new copy",
    },
    clauses: [
      {
        km: "អ្នកខ្ចីសៀវភៅត្រូវថែរក្សាឱ្យបានល្អដូចសភាពដើម។",
        en: "Borrowers must keep items in their original condition.",
      },
      {
        km:
          "ក្នុងករណីមានការខូចខាត ឬបាត់បង់ អ្នកខ្ចីត្រូវចេញសងតម្លៃស្មើទ្វេដងនៃតម្លៃសៀវភៅ " +
          "ឬទិញសៀវភៅថ្មីសងមកវិញ។",
        en:
          "In the event of damage or loss, the borrower must pay twice the value " +
          "of the item, or replace it with a new copy.",
      },
    ],
    audiences: ["students", "staff"],
  },
  {
    id: "restricted",
    icon: "gavel",
    title: { km: "ឯកសារមិនអនុញ្ញាតឱ្យខ្ចីចេញ", en: "Reference-only materials" },
    summary: {
      km: "កម្រងឯកសារច្បាប់ វចនានុក្រម និងទស្សនាវដ្ដី មិនអនុញ្ញាតឱ្យខ្ចីយកចេញក្រៅ",
      en: "Legal collections, dictionaries and journals may not be taken out of the library",
    },
    clauses: [
      {
        km:
          "កម្រងឯកសារច្បាប់ វចនានុក្រម ទស្សនាវដ្ដី និងសៀវភៅប្រភេទខ្លះ " +
          "មិនអនុញ្ញាតឱ្យខ្ចីយកចេញក្រៅឡើយ។",
        en:
          "Legal document collections, dictionaries, journals and certain other " +
          "categories may not be borrowed off site.",
      },
      {
        km: "បណ្ណារក្សមានសិទ្ធិឆែកឆេរអ្នកចេញចូលក្នុងបណ្ណាល័យ។",
        en: "Librarians may inspect people entering and leaving the library.",
      },
    ],
    audiences: ["students", "staff", "visitors"],
  },
  {
    id: "conduct",
    icon: "heart",
    title: { km: "បទបញ្ជាសុជីវធម៌ក្នុងបណ្ណាល័យ", en: "Library conduct" },
    summary: {
      km: "រក្សាភាពស្ងៀមស្ងាត់ បិទសំឡេងទូរស័ព្ទ ហាមជក់បារី បរិភោគអាហារ និងបោះចោលសម្រាម",
      en: "Stay quiet, silence phones, and no smoking, eating or littering",
    },
    clauses: [
      {
        km: "ត្រូវបិទសម្លេងទូរស័ព្ទ និងរក្សាភាពស្ងៀមស្ងាត់។",
        en: "Switch phones to silent and keep the reading areas quiet.",
      },
      {
        km: "ហាមជក់បារី ពិសារអាហារ និងភេសជ្ជៈ នៅក្នុងបណ្ណាល័យ។",
        en: "Smoking, eating and drinking are not permitted inside the library.",
      },
      {
        km: "ហាមចោលក្រដាស ឬសម្រាមផ្សេងៗ នៅក្នុងបណ្ណាល័យ និងបរិវេណបណ្ណាល័យ។",
        en: "Do not litter inside the library or on library premises.",
      },
      {
        km: "ហាមខាកស្ដោះនៅក្នុងបណ្ណាល័យ។",
        en: "Spitting inside the library is prohibited.",
      },
    ],
    audiences: ["students", "staff", "visitors"],
  },
  {
    id: "online",
    icon: "globe",
    title: { km: "លក្ខខណ្ឌប្រើប្រាស់ E-Library", en: "E-Library online terms" },
    summary: {
      km: "ធនធានឌីជីថលអាចប្រើប្រាស់បានតាមអនឡាញ ២៤ ម៉ោង តាមរយៈគេហទំព័ររបស់វិទ្យាស្ថាន",
      en: "Digital resources are available online around the clock through the college website",
    },
    clauses: [
      {
        km: "ចូលទៅកាន់គេហទំព័ររបស់វិទ្យាស្ថាន រួចជ្រើសរើសផ្នែកបណ្ណាល័យ។",
        en: "Visit the college website and open the Library section.",
      },
    ],
    audiences: ["students", "staff", "visitors", "online"],
  },
];

/** §5.4 — penalties, separated by severity. Red is reserved for deliberate
 *  destruction and theft; everything else is an amber policy notice. */
export const PENALTIES: Penalty[] = [
  {
    id: "late-return",
    tone: "notice",
    trigger: { km: "សងយឺតជាងកាលកំណត់", en: "Returned after the due date" },
    consequence: {
      km: "ត្រូវបង់ប្រាក់ពិន័យតាមការកំណត់របស់បណ្ណាល័យ។",
      en: "A fine is payable at the rate set by the library.",
    },
  },
  {
    id: "damaged",
    tone: "notice",
    trigger: { km: "សៀវភៅខូចខាត", en: "Item damaged" },
    consequence: {
      km: "ត្រូវសងតម្លៃស្មើទ្វេដងនៃតម្លៃសៀវភៅ ឬទិញសៀវភៅថ្មីសងមកវិញ។",
      en: "Pay twice the item’s value, or replace it with a new copy.",
    },
  },
  {
    id: "lost",
    tone: "notice",
    trigger: { km: "សៀវភៅបាត់បង់", en: "Item lost" },
    consequence: {
      km: "ត្រូវសងតម្លៃស្មើទ្វេដងនៃតម្លៃសៀវភៅ ឬទិញសៀវភៅថ្មីសងមកវិញ។",
      en: "Pay twice the item’s value, or replace it with a new copy.",
    },
  },
  {
    id: "suspension",
    tone: "notice",
    trigger: { km: "មិនគោរពបទបញ្ជាបណ្ណាល័យ", en: "Failure to observe library rules" },
    consequence: {
      km: "អ្នកគ្រប់គ្រងបណ្ណាល័យមានសិទ្ធិផ្អាកការឱ្យខ្ចីសៀវភៅពី ១ ឆមាស ទៅ ១ ឆ្នាំសិក្សា។",
      en:
        "Library management may suspend borrowing rights for one semester up to " +
        "one academic year.",
    },
  },
  {
    id: "card-misuse",
    tone: "prohibited",
    trigger: { km: "ប្រើប្រាស់ប័ណ្ណសមាជិកខុសគោលការណ៍", en: "Misuse of a membership card" },
    consequence: {
      km: "ប័ណ្ណសមាជិកត្រូវប្រើដោយម្ចាស់ប័ណ្ណតែប៉ុណ្ណោះ។",
      en: "Membership cards may be used only by the person they were issued to.",
    },
  },
  {
    id: "theft",
    tone: "prohibited",
    trigger: { km: "លួច បន្លំ ឬហែកសន្លឹកសៀវភៅ", en: "Theft, concealment or tearing pages from library books" },
    consequence: {
      km:
        "ត្រូវទទួលទណ្ឌកម្មពីវិទ្យាស្ថានតាមប្រការ៨ នៃបទបញ្ជានេះ " +
        "ដោយពុំទាន់គិតពីបទល្មើសព្រហ្មទណ្ឌជាយថាហេតុឡើយ។",
      en:
        "Subject to college disciplinary action under Article 8 of these " +
        "regulations, without prejudice to any criminal liability.",
    },
  },
];

/** §5.5 — the conduct grid. Icons SUPPORT the text; they never replace it. */
export const CONDUCT_RULES: ConductRule[] = [
  {
    id: "silence-phone",
    icon: "phone",
    kind: "do",
    text: { km: "បិទសំឡេងទូរស័ព្ទ", en: "Keep phones silent" },
  },
  {
    id: "quiet",
    icon: "quiet",
    kind: "do",
    text: { km: "រក្សាភាពស្ងៀមស្ងាត់", en: "Maintain a quiet environment" },
  },
  {
    id: "no-smoking",
    icon: "no-smoking",
    kind: "dont",
    text: { km: "ហាមជក់បារី", en: "No smoking" },
  },
  {
    id: "no-food",
    icon: "no-food",
    kind: "dont",
    text: { km: "ហាមពិសារអាហារ និងភេសជ្ជៈ", en: "No food or drink" },
  },
  {
    id: "no-litter",
    icon: "no-litter",
    kind: "dont",
    text: { km: "ហាមបោះចោលសម្រាម", en: "No littering" },
  },
  {
    id: "respect-materials",
    icon: "book-care",
    kind: "do",
    text: { km: "ថែរក្សាឯកសារបណ្ណាល័យ", en: "Respect library materials" },
  },
  {
    id: "card-own-use",
    icon: "card",
    kind: "dont",
    text: { km: "ហាមឱ្យអ្នកដទៃប្រើប័ណ្ណសមាជិករបស់ខ្លួន", en: "Do not lend your membership card" },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// LIBRARY TIMINGS  (source form §4)
// ─────────────────────────────────────────────────────────────────────────────
//
// The WEEKLY schedule is NOT duplicated here — it is published in system
// settings (`getSiteConfig().hours`) so an edit in /admin/system-settings
// propagates to this page, the footer, the JSON-LD and the "open now" badge at
// once. Only the editorial rows the settings model has no field for live here.

export const SPECIAL_SCHEDULE_ROWS: SpecialScheduleRow[] = [
  {
    id: "exam-period",
    label: { km: "រដូវប្រឡង", en: "Exam period" },
    hours: { open: "07:00", close: "19:00" },
  },
  {
    id: "e-library",
    label: { km: "បណ្ណាល័យអេឡិចត្រូនិក", en: "E-Library online" },
    alwaysOpen: true,
  },
];

/**
 * §4.1 records Saturday as "8.00-4.00". Read literally that is an 8-hour
 * window ending at 04:00, which cannot be right; read conventionally it is
 * 08:00–16:00, which is what the published settings currently say. The page
 * displays the settings value and links to this flag rather than silently
 * choosing an interpretation. See docs/about-pages-content-validation.md §4.
 */
export const SATURDAY_HOURS_NEEDS_CONFIRMATION = true;

// ─────────────────────────────────────────────────────────────────────────────
// LIBRARY COLLECTION  (source form §6)
// ─────────────────────────────────────────────────────────────────────────────

/** §6.2 — physical holdings. `titles` and `copies` are DIFFERENT measures and
 *  are labelled as such everywhere they appear. */
export const PHYSICAL_COLLECTION: PhysicalCollectionSnapshot = {
  titles: { value: 2766, confidence: "verified", sourceSection: "6.1 / 6.2" },
  copies: {
    nonTextbook: { value: 22067, confidence: "verified", sourceSection: "6.2" },
    textbook: { value: 23018, confidence: "verified", sourceSection: "6.2" },
    total: { value: 45085, confidence: "verified", sourceSection: "6.2" },
  },
  asOf: ABOUT_CONTENT_REVIEWED_AT,
};

/**
 * §6.1 + §6.6 — DDC classes with title counts.
 *
 * The source lists code **800 twice** (literature/rhetoric AND fiction), and
 * gives textbooks the code "Not". Both rows are kept exactly as supplied and
 * flagged, rather than being silently renumbered — see
 * docs/about-pages-content-validation.md §11.
 */
export const DDC_CATEGORIES: DdcCategory[] = [
  {
    id: "ddc-000",
    code: "000",
    title: {
      km: "ចំណេះដឹងទូទៅ ព័ត៌មានវិទ្យា និងការងារទូទៅ",
      en: "General knowledge, information technology and general works",
    },
    scope: {
      km: "សព្វវចនាធិប្បាយ ព័ត៌មានវិទ្យា និងឯកសារយោងទូទៅ។",
      en: "Encyclopedias, computing and general reference material.",
    },
    titles: 111,
  },
  {
    id: "ddc-100",
    code: "100",
    title: { km: "ទស្សនវិជ្ជា និងចិត្តវិទ្យា", en: "Philosophy and psychology" },
    scope: {
      km: "ទស្សនវិជ្ជា តក្កវិជ្ជា សីលធម៌ និងចិត្តវិទ្យា។",
      en: "Philosophy, logic, ethics and psychology.",
    },
    titles: 215,
  },
  {
    id: "ddc-200",
    code: "200",
    title: { km: "សាសនា", en: "Religion" },
    scope: {
      km: "ព្រះពុទ្ធសាសនា និងសាសនាផ្សេងៗ ព្រមទាំងការសិក្សាអំពីសាសនា។",
      en: "Buddhism, other faiths and the academic study of religion.",
    },
    titles: 50,
  },
  {
    id: "ddc-300",
    code: "300",
    title: { km: "វិទ្យាសាស្ត្រសង្គម", en: "Social sciences" },
    scope: {
      km: "អប់រំ សេដ្ឋកិច្ច នយោបាយ ច្បាប់ និងសង្គមវិទ្យា — ផ្នែកធំបំផុតនៃបណ្ដុំឯកសារ។",
      en:
        "Education, economics, politics, law and sociology — the largest part " +
        "of the collection.",
    },
    titles: 839,
  },
  {
    id: "ddc-400",
    code: "400",
    title: { km: "ភាសា", en: "Languages" },
    scope: {
      km: "វេយ្យាករណ៍ វចនានុក្រម និងការបង្រៀនភាសា។",
      en: "Grammar, dictionaries and language teaching.",
    },
    titles: 166,
  },
  {
    id: "ddc-500",
    code: "500",
    title: { km: "វិទ្យាសាស្ត្រ", en: "Science" },
    scope: {
      km: "គណិតវិទ្យា រូបវិទ្យា គីមីវិទ្យា និងជីវវិទ្យា។",
      en: "Mathematics, physics, chemistry and biology.",
    },
    titles: 472,
  },
  {
    id: "ddc-600",
    code: "600",
    title: {
      km: "បច្ចេកវិទ្យា (វិទ្យាសាស្ត្រអនុវត្តន៍)",
      en: "Technology and applied science",
    },
    scope: {
      km: "វេជ្ជសាស្ត្រ វិស្វកម្ម កសិកម្ម និងបច្ចេកវិទ្យាអនុវត្តន៍។",
      en: "Medicine, engineering, agriculture and applied technology.",
    },
    titles: 229,
  },
  {
    id: "ddc-700",
    code: "700",
    title: {
      km: "សិល្បៈ (វិចិត្រសិល្បៈ និងការតែងលម្អ)",
      en: "Arts, fine arts and decoration",
    },
    scope: {
      km: "វិចិត្រសិល្បៈ តន្ត្រី ការតែងលម្អ និងកីឡា។",
      en: "Fine arts, music, decorative arts and sport.",
    },
    titles: 73,
  },
  {
    id: "ddc-800-literature",
    code: "800",
    title: { km: "អក្សរសាស្ត្រ និងវោហារ", en: "Literature and rhetoric" },
    scope: {
      km: "អក្សរសាស្ត្រ កំណាព្យ និងវោហារសាស្ត្រ។",
      en: "Literature, poetry and rhetoric.",
    },
    titles: 138,
    hasCodeConflict: true,
  },
  {
    id: "ddc-800-fiction",
    code: "800",
    title: { km: "ប្រលោមលោក រឿងនិទាន ឆាករូបភាព", en: "Novels, stories and picture books" },
    scope: {
      km: "ប្រលោមលោក រឿងនិទាន និងសៀវភៅរូបភាព។",
      en: "Novels, folk tales and illustrated stories.",
    },
    titles: 186,
    hasCodeConflict: true,
  },
  {
    id: "ddc-900",
    code: "900",
    title: { km: "ភូមិវិទ្យា និងប្រវត្តិវិទ្យា", en: "Geography and history" },
    scope: {
      km: "ភូមិសាស្ត្រ ប្រវត្តិសាស្ត្រ និងជីវប្រវត្តិ។",
      en: "Geography, history and biography.",
    },
    titles: 170,
  },
  {
    id: "local-textbooks",
    code: "—",
    title: { km: "សៀវភៅសិក្សាគោល", en: "School textbooks" },
    scope: {
      km: "សៀវភៅសិក្សាគោលថ្នាក់ទី១ ដល់ទី១២ ដែលរៀបចំដាច់ដោយឡែកពី DDC។",
      en:
        "Grade 1–12 school textbooks, shelved as a local grouping outside the " +
        "DDC sequence.",
    },
    titles: 117,
    isLocalGrouping: true,
  },
];

/** §6.3 — the six languages held. No `catalogFilter` is set: the public
 *  catalogue has no language facet yet, so the chips render as plain
 *  indicators rather than links that would go nowhere. */
export const COLLECTION_LANGUAGES: CollectionLanguage[] = [
  { id: "km", name: { km: "ខ្មែរ", en: "Khmer" }, bcp47: "km" },
  { id: "en", name: { km: "អង់គ្លេស", en: "English" }, bcp47: "en" },
  { id: "ja", name: { km: "ជប៉ុន", en: "Japanese" }, bcp47: "ja" },
  { id: "ko", name: { km: "កូរ៉េ", en: "Korean" }, bcp47: "ko" },
  { id: "zh", name: { km: "ចិន", en: "Chinese" }, bcp47: "zh" },
  { id: "th", name: { km: "ថៃ", en: "Thai" }, bcp47: "th" },
];

/** §6.5 — special collections. `href` is present only where the e-Library
 *  really has that collection; the others render without an action. */
export const SPECIAL_COLLECTIONS: SpecialCollection[] = [
  {
    id: "action-research",
    icon: "flask",
    title: { km: "ការស្រាវជ្រាវប្រតិបត្តិ", en: "Action research" },
    description: {
      km: "ការស្រាវជ្រាវប្រតិបត្តិដែលធ្វើឡើងដោយគ្រូបង្រៀន និងអ្នកអប់រំ។",
      en: "Classroom action research carried out by teachers and educators.",
    },
  },
  {
    id: "graduation-reports",
    icon: "graduation",
    title: {
      km: "របាយការណ៍បញ្ចប់ការសិក្សារបស់គរុនិស្សិត",
      en: "Student-teacher graduation reports",
    },
    description: {
      km: "របាយការណ៍បញ្ចប់ការសិក្សា ដែលរៀបចំដោយគរុនិស្សិតនៃវិទ្យាស្ថាន។",
      en: "End-of-programme reports written by the college’s student teachers.",
    },
    href: "/theses",
  },
  {
    id: "theses",
    icon: "scroll",
    title: { km: "សារណាបទ និងនិក្ខេបបទ", en: "Theses and dissertations" },
    description: {
      km: "សារណាបទ និងនិក្ខេបបទថ្នាក់បរិញ្ញាបត្រ និងក្រោយបរិញ្ញាបត្រ។",
      en: "Undergraduate and postgraduate theses and dissertations.",
    },
    href: "/theses",
  },
  {
    id: "journals",
    icon: "journal",
    title: { km: "ទស្សនាវដ្ដី និងអត្ថបទស្រាវជ្រាវ", en: "Journals and research articles" },
    description: {
      km: "ទស្សនាវដ្ដីអប់រំ និងអត្ថបទស្រាវជ្រាវ រួមទាំងព្រឹត្តិបត្រស្រាវជ្រាវអប់រំ។",
      en:
        "Educational journals and research articles, including the college’s " +
        "own research bulletin.",
    },
    href: "/publications",
  },
];
