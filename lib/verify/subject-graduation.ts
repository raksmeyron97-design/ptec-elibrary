// lib/verify/subject-graduation.ts
//
// Deciding whether the set of INDEXABLE subject hubs has changed since the
// last check, and whether that change is worth telling a human about. PURE —
// no fetch, no fs — because every interesting case here is a degenerate one
// and none of them should need a network to test.
//
// ── Why this exists ──────────────────────────────────────────────────────────
//
// The SEO 3.3 §5 depth gate is DYNAMIC: it is computed from live counts behind
// a one-hour cache, so the day a librarian publishes the fifth book in ភាសា
// that hub flips to `index, follow` and enters sitemap.xml with no deploy and
// no ticket. That is the design working. What was missing is that nobody is
// TOLD — a hub can graduate, or quietly fall back, and the first anyone would
// know is a Search Console report weeks later.
//
// ── A graduation is not a failure ────────────────────────────────────────────
//
// This must never fail a build. A job that goes red for a librarian doing their
// job is a job people learn to ignore, and the red that matters gets ignored
// with it — the same reasoning that keeps a transport failure out of `fail` in
// lib/verify/http.ts and blocked logins out of Sev 2 in the security catalog.
// So the outcome here is a NOTIFICATION, and the run stays green.
//
// ── The rule this file is really about ───────────────────────────────────────
//
// Comparing against a previous state has one classic way to go wrong, and this
// repository has hit it repeatedly: **an absent or partial previous reading
// looks exactly like a total change.** A missing baseline would report all 19
// hubs as newly graduated; a run whose checks could not complete would report
// the ones it never saw as demoted. Both are noise that would arrive as a
// confident alert. So:
//
//   * a run that did not complete is never compared, and never overwrites the
//     baseline — a partial set is not evidence about the whole;
//   * a missing baseline BOOTSTRAPS: record, say nothing;
//   * only a complete run may become the next baseline, which is what makes a
//     present baseline trustworthy rather than merely available.

/** Outcome of comparing this run's indexable set with the previous one. */
export type GraduationOutcome =
  | {
      kind: "bootstrap";
      /** Nothing to compare against — record this set and stay quiet. */
      reason: string;
      current: string[];
    }
  | {
      kind: "incomplete";
      /** The run could not verify everything; comparing would invent changes. */
      reason: string;
      current: string[];
    }
  | { kind: "unchanged"; current: string[] }
  | {
      kind: "changed";
      /** Hubs that became indexable since the last complete run. */
      graduated: string[];
      /** Hubs that stopped being indexable. */
      demoted: string[];
      current: string[];
    };

export type GraduationInput = {
  /** Indexable hub identifiers from THIS run (any stable string; slugs). */
  current: readonly string[];
  /** The previous complete run's set, or null when there is none. */
  previous: readonly string[] | null;
  /** True when this run failed to check something — see the header. */
  incomplete: boolean;
};

const norm = (xs: readonly string[]) => [...new Set(xs)].sort();

/**
 * Compare, and say what — if anything — a human should be told.
 *
 * Order of checks is deliberate: `incomplete` is tested BEFORE `previous`,
 * because an incomplete first run must not bootstrap a partial set as the
 * baseline every later run is judged against.
 */
export function compareIndexableSets(input: GraduationInput): GraduationOutcome {
  const current = norm(input.current);

  if (input.incomplete) {
    return {
      kind: "incomplete",
      reason:
        "this run could not check every hub, so its set is partial — not compared, and not recorded as the baseline",
      current,
    };
  }

  if (input.previous === null) {
    return {
      kind: "bootstrap",
      reason: "no previous complete run to compare against — recording this set as the baseline",
      current,
    };
  }

  const previous = norm(input.previous);
  const prevSet = new Set(previous);
  const currSet = new Set(current);
  const graduated = current.filter((s) => !prevSet.has(s));
  const demoted = previous.filter((s) => !currSet.has(s));

  if (graduated.length === 0 && demoted.length === 0) return { kind: "unchanged", current };
  return { kind: "changed", graduated, demoted, current };
}

/** Should this outcome become the baseline the next run compares against? */
export function shouldRecordBaseline(outcome: GraduationOutcome): boolean {
  // Only a complete run may. An incomplete one would shrink the baseline and
  // make the NEXT run report spurious graduations as the missing hubs return.
  return outcome.kind !== "incomplete";
}

/** Should a human be told? Only a real membership change. */
export function shouldAlert(outcome: GraduationOutcome): boolean {
  return outcome.kind === "changed";
}

/**
 * One or two sentences for the alert. Names what moved and which way — a
 * count alone ("the set changed") makes the reader go and diff it themselves.
 */
export function graduationMessage(outcome: GraduationOutcome): string {
  if (outcome.kind !== "changed") return "";
  const parts: string[] = [];
  if (outcome.graduated.length > 0) {
    parts.push(
      `${outcome.graduated.length} hub(s) now meet the depth gate and have entered sitemap.xml: ${outcome.graduated.join(", ")}.`,
    );
  }
  if (outcome.demoted.length > 0) {
    parts.push(
      `${outcome.demoted.length} hub(s) no longer meet it and have left the sitemap: ${outcome.demoted.join(", ")}.`,
    );
  }
  parts.push(`${outcome.current.length} hub(s) are indexable in total.`);
  return parts.join(" ");
}

/** `/subjects/<slug>` → `<slug>`; anything else is returned unchanged. */
export function hubSlug(path: string): string {
  const m = /^\/subjects\/(.+)$/.exec(path);
  return m ? m[1] : path;
}
