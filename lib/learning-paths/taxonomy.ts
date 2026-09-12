// Pure, dependency-free derivation of a learning path's SCOPE — which subject
// track it belongs to and which grade band it covers — from fields the row
// already carries. No React, no Supabase; see taxonomy.test.ts.
//
// Why derive rather than store. The public catalogue used to offer the raw
// `audience` string as a "Browse by goal" facet: nine bilingual, comma-joined,
// ~90-character values, each matching exactly one of nine paths — a second copy
// of the list, rendered as a 5,148px chip row on a phone. The collection is
// not nine unrelated things; it is two subject tracks crossed with four scopes
// (Grade 1, 2, 3, or all three) plus one combined package, and THAT is the
// shape a reader filters by. Deriving the two axes from slug/subject/title
// gives the facets today without a migration; a `track`/`grade_band` column
// can replace `deriveScope` later without touching a single call site.
//
// Every rule below is conservative: an unrecognised path gets `null` on that
// axis and simply carries no chip, rather than being filed under a wrong one.

export type PathTrack = "reading" | "math" | "both";
export type PathGradeBand = "g1" | "g2" | "g3" | "g1_3";

export interface PathScopeInput {
  slug: string;
  title: string;
  title_km?: string | null;
  subject?: string | null;
  tags?: readonly string[] | null;
}

export interface PathScope {
  track: PathTrack | null;
  grade: PathGradeBand | null;
}

export const PATH_TRACKS: readonly PathTrack[] = ["reading", "math", "both"];
export const PATH_GRADE_BANDS: readonly PathGradeBand[] = ["g1", "g2", "g3", "g1_3"];

// Subject vocabulary as it is actually written in this library (Khmer first —
// every category here is Khmer) plus the English words the slugs use.
const READING_MARKERS = ["អំណាន", "ភាសាខ្មែរ", "reading", "literacy", "khmer language"];
const MATH_MARKERS = ["គណិតវិទ្យា", "math", "mathematics"];

function lower(s: string | null | undefined): string {
  return (s ?? "").toLowerCase();
}

function mentions(haystack: string, markers: string[]): boolean {
  return markers.some((m) => haystack.includes(m));
}

/**
 * Subject track. The `subject` column is the strongest signal (it is a single
 * curated value); the slug and title only break ties or fill a blank.
 */
export function deriveTrack(p: PathScopeInput): PathTrack | null {
  const subject = lower(p.subject);
  const fromSubject = classifyTrack(subject);
  if (fromSubject) return fromSubject;
  return classifyTrack(`${lower(p.slug)} ${lower(p.title)} ${lower(p.title_km)}`);
}

function classifyTrack(text: string): PathTrack | null {
  if (!text.trim()) return null;
  const reading = mentions(text, READING_MARKERS);
  const math = mentions(text, MATH_MARKERS);
  if (reading && math) return "both";
  if (reading) return "reading";
  if (math) return "math";
  return null;
}

// "grade-1", "grade 1", "ថ្នាក់ទី១" (Khmer digit) or "ថ្នាក់ទី1" — a SINGLE
// grade. Ranges ("grades 1–3", "ថ្នាក់ទី១-៣", "ថ្នាក់ទី១ ដល់ទី៣",
// "ថ្នាក់ទី១ ទី២ និងទី៣") are checked first so "1" inside a range is never
// read as Grade 1.
const KHMER_DIGITS: Record<string, string> = { "១": "1", "២": "2", "៣": "3", "៤": "4", "៥": "5", "៦": "6" };

function asciiDigits(s: string): string {
  return s.replace(/[១-៦]/g, (d) => KHMER_DIGITS[d] ?? d);
}

const RANGE_RE = /grades?\s*1\s*(?:[-–—]|to)\s*3|ថ្នាក់ទី\s*1\s*(?:[-–—]|ដល់\s*ទី\s*)3|ថ្នាក់ទី\s*1\s*ទី\s*2\s*និង\s*ទី\s*3/;
const SINGLE_RE = /(?:grade|ថ្នាក់ទី)[\s-]*([123])(?![\d])/;

/** Grade band, read from the slug first (machine-written, unambiguous), then the titles. */
export function deriveGradeBand(p: PathScopeInput): PathGradeBand | null {
  const sources = [lower(p.slug).replace(/-/g, " "), asciiDigits(lower(p.title)), asciiDigits(lower(p.title_km))];
  for (const text of sources) {
    if (!text.trim()) continue;
    if (RANGE_RE.test(text)) return "g1_3";
    const single = SINGLE_RE.exec(text);
    if (single) return `g${single[1]}` as PathGradeBand;
  }
  // The combined "early grade" packages name no grade in the slug; the tags
  // list every grade they span.
  const tags = (p.tags ?? []).map((t) => asciiDigits(t.toLowerCase()));
  const tagged = new Set<string>();
  for (const t of tags) {
    const m = SINGLE_RE.exec(t);
    if (m) tagged.add(m[1]);
  }
  if (tagged.size >= 3) return "g1_3";
  if (tagged.size === 1) return `g${[...tagged][0]}` as PathGradeBand;
  return null;
}

export function deriveScope(p: PathScopeInput): PathScope {
  return { track: deriveTrack(p), grade: deriveGradeBand(p) };
}

/**
 * Message keys for a scope's two halves, in display order (grade first — it is
 * the word a teacher scans for). The caller translates; this module stays
 * free of i18n so it can be tested and reused server-side.
 */
export function scopeLabelKeys(scope: PathScope): string[] {
  const keys: string[] = [];
  if (scope.grade) keys.push(`grade.${scope.grade}`);
  if (scope.track) keys.push(`track.${scope.track}`);
  return keys;
}
