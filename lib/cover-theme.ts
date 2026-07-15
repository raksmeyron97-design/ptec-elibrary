// lib/cover-theme.ts
// ── Deterministic PTEC generated-cover themes ─────────────────────────────────
//
// Single source of truth for how books WITHOUT a real cover image look.
// Every theme is a predefined token (never derived from user input), keyed by
// a canonical category slug. The same book always resolves to the same theme
// and the same decorative variant, on the server and on the client.
//
// Contrast invariant: `foreground` and `accent` on `background` must meet
// WCAG AA for normal text (≥ 4.5:1) — enforced by lib/cover-theme.test.ts.

export type CoverThemeSlug =
  | "literature"
  | "law"
  | "education"
  | "language"
  | "mathematics"
  | "science"
  | "technology"
  | "history"
  | "economics"
  | "research"
  | "statistics"
  | "curriculum"
  | "general";

export type CoverTheme = {
  slug: CoverThemeSlug;
  /** Solid cover background (dark, academic). */
  background: string;
  /** Slightly lighter partner tone for the diagonal wash. */
  backgroundSoft: string;
  /** Primary text color on the cover. */
  foreground: string;
  /** Category label / chip tint (AA on background). */
  accent: string;
  /** Latin abbreviation used as chip / watermark (LIT, LAW, …). */
  acronym: string;
  /** 24×24 stroke icon path(s) drawn as the subtle category motif. */
  iconPath: string;
};

/**
 * Themes use deep tones that pair with the PTEC gold (#DDB022) brand accent.
 * `accent` values are light tints of the hue for small category text.
 */
export const CATEGORY_COVER_THEMES: Record<CoverThemeSlug, CoverTheme> = {
  literature: {
    slug: "literature",
    background: "#7C2D12",
    backgroundSoft: "#9A3412",
    foreground: "#FFFFFF",
    accent: "#FED7AA",
    acronym: "LIT",
    // open book
    iconPath: "M2 4h7a4 4 0 0 1 3 1.5A4 4 0 0 1 15 4h7v15h-7a3 3 0 0 0-3 2 3 3 0 0 0-3-2H2Z M12 5.5V21",
  },
  law: {
    slug: "law",
    background: "#1E3A5F",
    backgroundSoft: "#27496D",
    foreground: "#FFFFFF",
    accent: "#BFDBFE",
    acronym: "LAW",
    // scales
    iconPath: "M12 3v18 M4 7h16 M6 7l-3 7a3.5 3.5 0 0 0 6 0Z M18 7l-3 7a3.5 3.5 0 0 0 6 0Z M8 21h8",
  },
  education: {
    slug: "education",
    background: "#14532D",
    backgroundSoft: "#166534",
    foreground: "#FFFFFF",
    accent: "#BBF7D0",
    acronym: "EDU",
    // graduation cap
    iconPath: "M22 9 12 4 2 9l10 5Z M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5 M22 9v5",
  },
  language: {
    slug: "language",
    background: "#0C4A6E",
    backgroundSoft: "#075985",
    foreground: "#FFFFFF",
    accent: "#BAE6FD",
    acronym: "LANG",
    // speech bubbles
    iconPath: "M4 4h10v8H8l-4 3Z M14 9h6v7h-2l-3 2.5V16h-1Z",
  },
  mathematics: {
    slug: "mathematics",
    background: "#312E81",
    backgroundSoft: "#3730A3",
    foreground: "#FFFFFF",
    accent: "#C7D2FE",
    acronym: "MATH",
    // plus / minus / times / divide quadrants
    iconPath: "M7 4v6 M4 7h6 M14 7h6 M4 17h6 M15 14l4 6 M19 14l-4 6 M17 15.5v0 M14 18h6",
  },
  science: {
    slug: "science",
    background: "#134E4A",
    backgroundSoft: "#115E59",
    foreground: "#FFFFFF",
    accent: "#99F6E4",
    acronym: "SCI",
    // flask
    iconPath: "M9 3h6 M10 3v6l-5.5 9A2 2 0 0 0 6 21h12a2 2 0 0 0 1.5-3L14 9V3 M7 15h10",
  },
  technology: {
    slug: "technology",
    background: "#155E75",
    backgroundSoft: "#0E7490",
    foreground: "#FFFFFF",
    accent: "#A5F3FC",
    acronym: "TECH",
    // code brackets
    iconPath: "m8 6-5 6 5 6 m8-12 5 6-5 6 m-2.5-14-3 16",
  },
  history: {
    slug: "history",
    background: "#713F12",
    backgroundSoft: "#854D0E",
    foreground: "#FFFFFF",
    accent: "#FDE68A",
    acronym: "HIST",
    // classical column
    iconPath: "M3 21h18 M5 21V9 M9.5 21V9 M14.5 21V9 M19 21V9 M2 9h20L12 3Z",
  },
  economics: {
    slug: "economics",
    background: "#4C1D95",
    backgroundSoft: "#5B21B6",
    foreground: "#FFFFFF",
    accent: "#DDD6FE",
    acronym: "ECON",
    // trend line
    iconPath: "M3 3v18h18 M7 15l4-5 3 3 5-7",
  },
  research: {
    slug: "research",
    background: "#3B1F5E",
    backgroundSoft: "#4C2882",
    foreground: "#FFFFFF",
    accent: "#E9D5FF",
    acronym: "RES",
    // magnifier over page
    iconPath: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8 M14 11a4 4 0 1 0 4 4 4 4 0 0 0-4-4Z m3 7 3.5 3.5",
  },
  statistics: {
    slug: "statistics",
    background: "#1E40AF",
    backgroundSoft: "#1D4ED8",
    foreground: "#FFFFFF",
    accent: "#BFDBFE",
    acronym: "STAT",
    // bar chart
    iconPath: "M3 21h18 M6 21v-6 M11 21V9 M16 21V4 M21 21v-9",
  },
  curriculum: {
    slug: "curriculum",
    background: "#701A75",
    backgroundSoft: "#86198F",
    foreground: "#FFFFFF",
    accent: "#F5D0FE",
    acronym: "CURR",
    // layered pages
    iconPath: "M6 3h9l4 4v14H6Z M15 3v4h4 M9 12h6 M9 16h6",
  },
  general: {
    slug: "general",
    background: "#334155",
    backgroundSoft: "#3F4E63",
    foreground: "#FFFFFF",
    accent: "#E2E8F0",
    acronym: "PTEC",
    // closed book
    iconPath: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z",
  },
};

/**
 * Keyword → slug matching. Handles both English category names ("Law",
 * "Literature") and the Khmer names used by e-book categories/departments
 * (គណិតវិទ្យា, ស្រាវជ្រាវ, …). First match wins; order specific → generic.
 */
const CATEGORY_KEYWORDS: Array<[CoverThemeSlug, string[]]> = [
  ["statistics",  ["statistic", "ស្ថិតិ"]],
  ["curriculum",  ["curriculum", "កម្មវិធីសិក្សា"]],
  ["research",    ["research", "thesis", "ស្រាវជ្រាវ", "និក្ខេបបទ"]],
  ["mathematics", ["math", "គណិត"]],
  ["technology",  ["tech", "computer", "ict", "software", "engineering", "បច្ចេកវិទ្យា", "ព័ត៌មានវិទ្យា", "កុំព្យូទ័រ"]],
  ["science",     ["science", "physics", "chemistry", "biology", "វិទ្យាសាស្ត្រ", "រូបវិទ្យា", "គីមី", "ជីវវិទ្យា"]],
  ["education",   ["educat", "pedagog", "teaching", "គរុកោសល្យ", "អប់រំ", "បង្រៀន"]],
  ["language",    ["language", "english", "khmer studies", "linguistic", "ភាសា"]],
  ["law",         ["law", "legal", "justice", "ច្បាប់", "នីតិ"]],
  ["history",     ["history", "heritage", "ប្រវត្តិ", "បេតិកភណ្ឌ"]],
  ["economics",   ["econom", "business", "finance", "commerce", "សេដ្ឋកិច្ច", "ពាណិជ្ជ", "ហិរញ្ញ"]],
  ["literature",  ["literature", "novel", "fiction", "poetry", "story", "អក្សរសាស្ត្រ", "អក្សរសិល្ប៍", "ប្រលោមលោក", "កំណាព្យ", "រឿង"]],
];

export function normalizeCategorySlug(category?: string | null): CoverThemeSlug {
  const c = (category ?? "").trim().toLowerCase();
  if (!c) return "general";
  for (const [slug, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((k) => c.includes(k))) return slug;
  }
  return "general";
}

export function getCategoryCoverTheme(category?: string | null): CoverTheme {
  return CATEGORY_COVER_THEMES[normalizeCategorySlug(category)];
}

/**
 * Chip text for the cover corner. Mapped categories use the theme acronym;
 * unmapped Latin categories fall back to their first 4 letters (uppercased);
 * anything else (e.g. unmapped Khmer) uses the general "PTEC" mark.
 */
export function getCategoryAcronym(category?: string | null): string {
  const slug = normalizeCategorySlug(category);
  if (slug !== "general") return CATEGORY_COVER_THEMES[slug].acronym;
  const latin = (category ?? "").replace(/[^A-Za-z]/g, "");
  if (latin.length >= 2) return latin.slice(0, 4).toUpperCase();
  return CATEGORY_COVER_THEMES.general.acronym;
}

/** Stable non-crypto hash (same algorithm the old covers used). */
export function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h);
}

export const COVER_VARIANT_COUNT = 4;

/**
 * Small per-book variation WITHIN a category theme (motif corner + pattern
 * offset), so shelves of same-category books don't look like clones while the
 * category color stays consistent. Deterministic: same seed → same variant.
 */
export function getDeterministicCoverVariant(seed?: string | null): number {
  if (!seed) return 0;
  return hashSeed(seed) % COVER_VARIANT_COUNT;
}
