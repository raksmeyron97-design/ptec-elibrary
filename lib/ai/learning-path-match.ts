// lib/ai/learning-path-match.ts
// WHICH published learning path answers a reader's GOAL — and, just as often,
// that none of them does. Pure: no DB, no server-only, so the rule that decides
// whether a curriculum is offered can be tested against the real nine.
//
// WHY THIS IS ITS OWN MODULE
//
// The first version of this scored a path by counting the goal's words
// anywhere in its title, subject, tags or description, and led with whatever
// scored highest above zero. Measured against production (nine published
// paths, all of them MoEYS early-grade reading and mathematics for Grades
// 1–3), that answered:
//
//   "Where do I start with action research?"        → Early Grade Mathematics
//   "…qualitative research methods…what comes next" → Early Grade Learning
//   "learning paths for underwater welding"         → Early Grade Learning
//
// Three confident wrong answers, from one weak word matching a description.
// And the benchmark scored all three as PASSES, because the label checked
// which intent the question reached and a template was an acceptable outcome —
// so the instrument could not see the defect the capability had introduced.
//
// Two rules come out of that, and both live here where a test can reach them:
//
//   1. A path may only LEAD on a strong signal — its title or its own topic
//      fields (subject, tags, audience). A description mention may rank a path
//      but may never make it the answer, because a description is where a
//      curriculum says who it is for and what it is made of, not what it
//      teaches.
//   2. When nothing is strong, the honest answer is the SET. Nine paths is a
//      list a reader can read, and naming the whole curriculum is both true
//      and more useful than a refusal — but it must not be dressed up as a
//      route through a subject the curriculum does not cover.

/** The fields of a published path this rule is allowed to read. */
export interface MatchablePath {
  slug: string;
  /** Publication order — the tie-break, so the result is stable. */
  position: number;
  /** Title in both languages, already joined and normalized by the caller. */
  title: string;
  /** Subject, audience and tags — what the path says it is ABOUT. */
  topic: string;
  /** Description — what it says it is MADE OF. Ranks, never leads. */
  body: string;
}

export interface PathMatch<T extends MatchablePath> {
  path: T;
  score: number;
  /** A title or topic hit. Only a strong match may lead. */
  strong: boolean;
}

export interface PathMatchResult<T extends MatchablePath> {
  /** Paths that matched at all, best first. Empty when nothing did. */
  ranked: PathMatch<T>[];
  /**
   * The one path to present as the route, or null.
   *
   * Null is a real answer and not a failure: it means the curriculum does not
   * cover what was asked, and the caller says so while naming what it does
   * cover.
   */
  leading: T | null;
  /**
   * Did the goal name a SUBJECT at all, once its own vocabulary was removed?
   *
   * "What learning paths do you have?" names none — every word in it is how a
   * reader asks for the artefact — so the list is what was asked for. "Where
   * do I start with action research?" names one the curriculum does not cover.
   * Both end with no leading path and they are different answers, so the
   * difference has to travel: deciding it from the raw token count called the
   * Khmer "តើបណ្ណាល័យមានមាគ៌ាសិក្សាអ្វីខ្លះ?" a subject question, because
   * មាគ៌ាសិក្សា — "learning path" — survives as one token.
   */
  namedSubject: boolean;
}

/**
 * Where a word sits decides what it is worth. A path whose TITLE says
 * "reading" is about reading; one whose description merely mentions it may
 * only be made of materials that do.
 */
export const PATH_FIELD_WEIGHT = { title: 5, topic: 3, body: 1 } as const;
/** A whole-query hit on the title or topic — a reader who typed the path's name. */
export const PATH_PHRASE_BONUS = { title: 8, topic: 4 } as const;

/**
 * Words that belong to the GOAL, not to its subject.
 *
 * "Learning paths for underwater welding" is about welding; "learning" and
 * "paths" are how the reader named the artefact they want. Every path here is
 * called "Early Grade Learning…" or similar, so those words matched a TITLE
 * and made the match strong — which is how a question about underwater welding
 * came to be answered with the MoEYS mathematics curriculum, and how "how do I
 * learn statistics for my thesis" led with a Grade 1 reading package.
 *
 * The mirror of `LEARNING_PATH_WORDS` in lib/ai/intent.ts: those words are
 * what ROUTES a question here, so by construction they are the ones every such
 * question carries and none of them says anything about its subject.
 */
const GOAL_FRAME_TOKENS = new Set([
  "learn", "learning", "learns", "path", "paths", "pathway", "plan", "plans",
  "study", "studying", "start", "starts", "starting", "first", "next",
  "roadmap", "guide", "guides", "step", "steps", "want", "read", "follow",
  "begin", "beginning", "recommend", "order", "sequence", "curriculum",
  // How a reader ASKS, as opposed to what they ask about. `queryTerms` already
  // drops the interrogatives ("where", "which", "how"); these are the request
  // verbs that survive it, and none of them names a subject.
  "show", "tell", "give", "find", "need", "help", "suggest", "looking",
  "មាគ៌ាសិក្សា", "ផែនការសិក្សា", "ចាប់ផ្តើម", "ចាប់ផ្ដើម", "ចង់រៀន", "របៀបរៀន",
]);

/**
 * How much of the collection a token covers before it stops discriminating.
 *
 * A token that nearly EVERY path carries tells a reader nothing about which one
 * to take: every path in this curriculum is "early", "grade", "primary" and
 * "MoEYS". Such a token may still add to a score, but it may never be the thing
 * that makes a match strong enough to lead. Self-calibrating — it reads the
 * collection rather than a hand-written list — so it keeps working as the
 * curriculum grows, which a list of stop-words cannot.
 *
 * The threshold is HIGH, and that is the whole difficulty. At a half, "reading"
 * was neutralised: this curriculum is one half reading and one half
 * mathematics, so the word that separates its two tracks appears in five of its
 * nine paths — the most discriminating token in the collection, and the first
 * casualty of a rule tuned for a general one. A token has to be nearly
 * universal before it stops carrying information.
 */
export const PATH_TOKEN_UBIQUITY = 0.8;

/**
 * Rank the published paths against a goal.
 *
 * `tokens` are the goal's content words (lib/ai/evidence.ts `queryTerms`, so
 * Khmer runs arrive whole) and `phrase` is the normalized goal itself. Nothing
 * fuzzy: with nine paths a near match is a guess about a set small enough to
 * list, and listing it is the better answer.
 */
export function matchLearningPaths<T extends MatchablePath>(
  paths: readonly T[],
  tokens: readonly string[],
  phrase: string,
): PathMatchResult<T> {
  const contains = (hay: string) =>
    hay.length > 0 && phrase.length > 0 && (hay.includes(phrase) || (phrase.length >= 4 && phrase.includes(hay)));

  // The goal's own vocabulary is removed before anything is scored.
  const subject = tokens.filter((t) => !GOAL_FRAME_TOKENS.has(t));
  // …and a token the whole curriculum shares cannot make a match strong.
  const covers = (t: string) => paths.filter((p) => p.title.includes(t) || p.topic.includes(t)).length;
  const ubiquity = paths.length * PATH_TOKEN_UBIQUITY;
  const ubiquitous = new Set(subject.filter((t) => covers(t) > ubiquity));
  /**
   * The phrase bonus is for a reader who typed a path's NAME, so it is subject
   * to the same rule: "early grade" is contained in all nine titles, which
   * makes it a shared prefix rather than an identification. Without this the
   * bonus set `strong` unconditionally and walked straight past the ubiquity
   * check the tokens had just been through.
   */
  const phraseIdentifies = phrase.length > 0 && covers(phrase) <= ubiquity;

  const ranked: PathMatch<T>[] = [];
  for (const path of paths) {
    if (path.title === phrase && phrase.length > 0) {
      ranked.push({ path, score: 1_000, strong: true });
      continue;
    }
    let score = 0;
    let strong = false;
    for (const t of subject) {
      const discriminating = !ubiquitous.has(t);
      if (path.title.includes(t)) {
        score += PATH_FIELD_WEIGHT.title;
        strong ||= discriminating;
      } else if (path.topic.includes(t)) {
        score += PATH_FIELD_WEIGHT.topic;
        strong ||= discriminating;
      } else if (path.body.includes(t)) {
        score += PATH_FIELD_WEIGHT.body;
      }
    }
    if (contains(path.title)) {
      score += PATH_PHRASE_BONUS.title;
      strong ||= phraseIdentifies;
    } else if (contains(path.topic)) {
      score += PATH_PHRASE_BONUS.topic;
      strong ||= phraseIdentifies;
    }
    if (score > 0) ranked.push({ path, score, strong });
  }

  ranked.sort((a, b) => b.score - a.score || a.path.position - b.path.position);
  const best = ranked.find((m) => m.strong) ?? null;
  return { ranked, leading: best ? best.path : null, namedSubject: subject.length > 0 };
}
