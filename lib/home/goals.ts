// lib/home/goals.ts
//
// "Start with your goal" — the six teacher goals on the homepage, and the pure
// function that resolves each one to a REAL destination.
//
// ── Why this file exists ─────────────────────────────────────────────────────
// The resolver used to live inline in the section component and matched its
// keywords against a path's `description` and `audience` — free prose written
// by a librarian for humans. That produced two genuine mislinks in production:
//
//   • "Prepare for PISA"      → /paths/classroom-and-school-management
//     because that path's description contains the phrase "fair assessment",
//     and "assessment" was a PISA keyword.
//   • "Develop as a teacher"  → /paths/classroom-and-school-management
//     because that path's audience is "In-service Teacher", and "in-service"
//     was a professional-development keyword.
//
// Two different goals pointed at one path, and it matched neither label.
//
// Two rules fix that class of bug rather than those two instances:
//
//   1. MATCH ON NAMES, NOT PROSE. The haystack is the path's title, Khmer
//      title, subject and tags — fields a cataloguer chooses deliberately.
//      Descriptions and audience blurbs change wording freely and are not a
//      routing contract.
//   2. CLAIM ONCE. A path matched by an earlier goal is removed from the pool,
//      so no two cards can ever land on the same destination. Where that
//      leaves a goal unmatched it takes its curated fallback — a search or a
//      listing filter that is always valid — never a near-miss path.
//
// Every fallback is a route that exists and returns results for this
// collection; lib/home/goals.test.ts pins both rules and the fallback shapes.

/** i18n suffix: `goal{Key}` / `goal{Key}Body` in the `home` namespace. */
export type GoalKey = "Lesson" | "Thesis" | "Research" | "Pisa" | "Teacher" | "Khmer";

export type GoalDefinition = {
  key: GoalKey;
  /**
   * Lowercase substrings matched against a path's NAME fields only
   * (title / title_km / subject / tags). Khmer entries are matched on a
   * prefix that survives both valid subscript orderings, same rule as
   * CategoryGrid's KEYWORD_THEME.
   */
  match: string[];
  /** Always-valid library route used when no published path matches. */
  fallback: string;
};

/**
 * Declaration order is BOTH the render order and the claim order. A goal
 * earlier in this list wins a contested path; reordering the list can
 * therefore change destinations, so it is a deliberate edit, not cosmetic.
 */
export const GOALS: readonly GoalDefinition[] = [
  {
    key: "Lesson",
    match: ["pedagog", "lesson", "teaching practice", "គរុកោសល្យ"],
    fallback: "/search?q=lesson%20planning",
  },
  {
    key: "Thesis",
    // No published path teaches thesis writing; the repository itself is the
    // destination, and past theses are the model students actually ask for.
    match: ["thesis", "dissertation", "និក្ខេបបទ"],
    fallback: "/theses",
  },
  {
    key: "Research",
    match: ["action research", "research method", "ស្រាវជ្រាវ"],
    fallback: "/search?q=research%20methods",
  },
  {
    key: "Pisa",
    // "assessment" is deliberately NOT a keyword here — see the header note.
    // There is no PISA learning path; the PISA-D materials are books, so the
    // honest destination is the search that finds them.
    match: ["pisa"],
    fallback: "/search?q=PISA",
  },
  {
    key: "Teacher",
    match: ["school management", "classroom management", "professional development"],
    fallback: "/paths",
  },
  {
    key: "Khmer",
    // Matched on the language, not the script: every Khmer-titled path would
    // otherwise claim this card.
    match: ["khmer language", "ភាសាខ្មែរ"],
    fallback: "/books?language=Khmer",
  },
] as const;

/** The subset of a learning-path summary this resolver is allowed to read. */
export type GoalPathCandidate = {
  slug: string;
  title: string;
  title_km: string | null;
  subject?: string | null;
  tags?: string[];
};

export type ResolvedGoal<P extends GoalPathCandidate> = {
  key: GoalKey;
  href: string;
  /** The matched path, or null when the goal fell back to a curated route. */
  path: P | null;
};

/** Name fields only — never description or audience. */
function haystack(path: GoalPathCandidate): string {
  return [path.title, path.title_km, path.subject, ...(path.tags ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * Resolve every goal in declaration order, claiming each matched path so it
 * cannot be reused. Pure: same inputs → same destinations, which is what makes
 * the homepage's links testable without a database.
 */
export function resolveGoals<P extends GoalPathCandidate>(
  paths: readonly P[],
  goals: readonly GoalDefinition[] = GOALS,
): ResolvedGoal<P>[] {
  const claimed = new Set<string>();
  return goals.map((goal) => {
    const hit = paths.find(
      (p) => !claimed.has(p.slug) && goal.match.some((kw) => haystack(p).includes(kw)),
    );
    if (!hit) return { key: goal.key, href: goal.fallback, path: null };
    claimed.add(hit.slug);
    return { key: goal.key, href: `/paths/${hit.slug}`, path: hit };
  });
}
