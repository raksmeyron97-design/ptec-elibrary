// lib/about/types.ts
//
// Shapes for the five public "About the Library" pages
// (/about/our-journey, /rules, /timings, /collection, /team).
//
// Everything institutional these pages display comes from ONE typed source
// (lib/about/content.ts), transcribed from the library's own information form
// (docs/library_info_form.docx). Nothing here is invented: a field the form
// left blank stays absent so the UI can render an honest empty state instead
// of a plausible-looking placeholder.
//
// Bilingual convention: `LocalizedText` carries both languages and the
// components pick with `pickLocale()` (lib/about/format.ts). A field the
// source only supplied in Khmer has an EMPTY `en` — never a machine
// translation passed off as official copy.

/** A string the library supplied (or approved) in both languages. */
export type LocalizedText = {
  km: string;
  /** Empty when the source document gave no official English wording. */
  en: string;
};

/** The five pages that make up the About system, in navigation order. */
export const ABOUT_PAGE_KEYS = [
  "ourJourney",
  "rules",
  "timings",
  "collection",
  "team",
] as const;

export type AboutPageKey = (typeof ABOUT_PAGE_KEYS)[number];

/**
 * How confident we are in a displayed figure.
 *
 * - `verified`   — stated unambiguously in the source form; safe to show big.
 * - `disputed`   — the source states DIFFERENT values in different sections
 *                  (see docs/about-pages-content-validation.md). Never render
 *                  as a headline statistic; render as prose with a range or
 *                  omit the number entirely.
 * - `unverified` — the source left the field blank. Render an empty state.
 */
export type Confidence = "verified" | "disputed" | "unverified";

/** A number we are willing to print, with its provenance attached. */
export type SourcedNumber = {
  value: number;
  confidence: Confidence;
  /** Section of the source form, e.g. "6.2" — quoted in the validation doc. */
  sourceSection: string;
};

// ── Our Journey ──────────────────────────────────────────────────────────────

export type JourneyMilestone = {
  id: string;
  year: number | string;
  title: LocalizedText;
  description: LocalizedText;
  imageUrl?: string;
  imageAlt?: LocalizedText;
  displayOrder: number;
  isPublished: boolean;
};

export type JourneyAchievement = {
  id: string;
  /** Icon key resolved to a lucide component by the card (never a raw node,
   *  so this stays a serialisable data module). */
  icon: "book" | "press" | "bulletin" | "globe";
  title: LocalizedText;
  description: LocalizedText;
  /** Omitted when no verified figure exists — the card then shows a label
   *  only, which is the honest presentation. */
  count?: SourcedNumber;
  /** Rendered as "30+" rather than "30" when the source says "more than". */
  isMinimum?: boolean;
};

/**
 * A forward-looking commitment. Rendered under an explicit "strategic
 * direction" label so it can never read as a completed achievement.
 */
export type RoadmapItem = {
  id: string;
  icon: "globe" | "scan" | "books" | "archive";
  title: LocalizedText;
  description: LocalizedText;
};

// ── Library Rules ────────────────────────────────────────────────────────────

/** Who a rule applies to. Drives the audience selector on /about/rules. */
export const RULE_AUDIENCES = ["students", "staff", "visitors", "online"] as const;
export type RuleAudience = (typeof RULE_AUDIENCES)[number];

export type BorrowingAllowance = {
  audience: RuleAudience;
  /** Maximum items on loan at once. */
  maxItems: number;
  /** Loan periods in days, keyed by material language where the policy
   *  distinguishes them; `default` when it does not. */
  loanDays: { key: "khmer" | "english" | "default"; days: number; renewal: LocalizedText }[];
};

export type RuleCategory = {
  id: string;
  icon: "info" | "card" | "swap" | "alert" | "gavel" | "heart" | "globe";
  title: LocalizedText;
  /** The accordion summary line — must state the actual point, never
   *  "Read more" (WCAG 2.4.6 / the brief's explicit requirement). */
  summary: LocalizedText;
  /** Individual rule clauses, each rendered as its own list item so long
   *  policy paragraphs stop being a wall of text. */
  clauses: LocalizedText[];
  audiences: RuleAudience[];
};

/** Tone drives colour: `notice` = amber, `prohibited` = red. Colour is never
 *  the only signal — each row also carries an icon and a text label. */
export type PenaltyTone = "notice" | "prohibited";

export type Penalty = {
  id: string;
  tone: PenaltyTone;
  trigger: LocalizedText;
  consequence: LocalizedText;
};

export type ConductRule = {
  id: string;
  icon: "phone" | "quiet" | "no-smoking" | "no-food" | "no-litter" | "book-care" | "card";
  /** Positive or prohibitive — decides the icon treatment, not the colour. */
  kind: "do" | "dont";
  text: LocalizedText;
};

// ── Library Timings ──────────────────────────────────────────────────────────

/**
 * A dated exception to the standard weekly schedule. Kept SEPARATE from the
 * weekly hours on purpose: the weekly grid lives in published system settings
 * (`site_settings.hours.weekly`), exceptions in `site_settings.hours.closures`.
 */
export type LibraryScheduleException = {
  id: string;
  /** Inclusive ISO dates, Cambodia-local. */
  from: string;
  to: string;
  status: "closed" | "special-hours";
  opensAt?: string;
  closesAt?: string;
  reason: LocalizedText;
};

/** An editorial schedule row that is not a weekday (exam period, e-library). */
export type SpecialScheduleRow = {
  id: string;
  label: LocalizedText;
  /** Absent = closed. */
  hours?: { open: string; close: string };
  /** True for the always-on digital service. */
  alwaysOpen?: boolean;
  /** Set when the source's wording is ambiguous and awaiting confirmation. */
  needsConfirmation?: boolean;
};

// ── Library Collection ───────────────────────────────────────────────────────

export type DdcCategory = {
  /** Dewey class as printed by the library, e.g. "000". `code` is NOT unique
   *  in the source form — 800 is listed twice — so `id` is the React key. */
  id: string;
  code: string;
  title: LocalizedText;
  /** Plain-language explanation of what sits in this class. */
  scope: LocalizedText;
  titles: number;
  /** True for the local grouping that is not a real DDC class (textbooks). */
  isLocalGrouping?: boolean;
  /** True when the code duplicates another row's code in the source. */
  hasCodeConflict?: boolean;
};

export type CollectionLanguage = {
  id: string;
  name: LocalizedText;
  /** BCP-47 tag for `lang` on the chip. */
  bcp47: string;
  /** Set only when the catalogue can really filter by this language —
   *  a chip without it renders as static text, never a dead button. */
  catalogFilter?: string;
};

export type SpecialCollection = {
  id: string;
  icon: "flask" | "graduation" | "scroll" | "journal";
  title: LocalizedText;
  description: LocalizedText;
  /** Internal route to the real collection, when one exists. */
  href?: string;
};

/**
 * The physical-collection figures. `titles` and `copies` measure DIFFERENT
 * things (a title can have many copies) and the UI must never present them as
 * one number — hence separate fields with their own labels.
 */
export type PhysicalCollectionSnapshot = {
  titles: SourcedNumber;
  copies: {
    nonTextbook: SourcedNumber;
    textbook: SourcedNumber;
    total: SourcedNumber;
  };
  /** ISO date the library last supplied these figures. */
  asOf: string;
};

// ── Team ─────────────────────────────────────────────────────────────────────

/**
 * Note: the live team directory reads the privacy-enforcing
 * `team_members_public` view (see lib/team/public.ts) — this type documents
 * the fields the About system relies on and is intentionally a SUBSET.
 * Contact fields arrive already nulled unless an admin approved public
 * display, so there is no `showEmailPublicly` flag to re-check here.
 */
export type AboutTeamMetric = {
  id: string;
  icon: "users" | "grid" | "languages" | "clock";
  value: string;
  label: LocalizedText;
};
