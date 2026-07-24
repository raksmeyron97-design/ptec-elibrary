// Pure helpers for indexing Learning Paths into Global Search.
// The native search route (app/api/search/native/route.ts) fetches a path with
// its modules and steps embedded; these functions derive the searchable text,
// step/module counts, and total estimated duration from that shape. Kept pure
// (no Supabase, no I/O) so the ranking-relevant logic is unit-testable without
// a database — see lib/search/learning-paths.test.ts.

/** A single step as embedded in the learning-path search select. */
export type PathStepRaw = {
  resource_title?: string | null;
  instruction?: string | null;
  instruction_km?: string | null;
  est_minutes?: number | null;
};

/** A module as embedded in the learning-path search select. */
export type PathModuleRaw = {
  title?: string | null;
  title_km?: string | null;
  learning_path_steps?: PathStepRaw[] | null;
};

export type PathModulesRaw = PathModuleRaw[] | null | undefined;

function modulesOf(modules: PathModulesRaw): PathModuleRaw[] {
  return Array.isArray(modules) ? modules : [];
}

function stepsOf(module: PathModuleRaw): PathStepRaw[] {
  return Array.isArray(module.learning_path_steps) ? module.learning_path_steps : [];
}

/** Number of modules in the path. */
export function pathModuleCount(modules: PathModulesRaw): number {
  return modulesOf(modules).length;
}

/** Total number of steps across every module. */
export function pathStepCount(modules: PathModulesRaw): number {
  return modulesOf(modules).reduce((sum, m) => sum + stepsOf(m).length, 0);
}

/**
 * Total estimated duration in minutes (sum of every step's est_minutes).
 * Returns null when no step carries an estimate, so the UI can hide the field
 * rather than render "0 min".
 */
export function pathDurationMinutes(modules: PathModulesRaw): number | null {
  let total = 0;
  let any = false;
  for (const m of modulesOf(modules)) {
    for (const s of stepsOf(m)) {
      const mins = Number(s.est_minutes ?? 0);
      if (Number.isFinite(mins) && mins > 0) {
        total += mins;
        any = true;
      }
    }
  }
  return any ? total : null;
}

/**
 * Module titles + step titles/instructions, flattened for the in-memory
 * ranking searchableText. Repeated/blank fragments are collapsed so a long
 * path with many steps can't drown out its own title in relevance scoring.
 */
export function pathBodyText(modules: PathModulesRaw): string {
  const parts = new Set<string>();
  for (const m of modulesOf(modules)) {
    for (const raw of [m.title, m.title_km]) {
      const v = (raw ?? "").trim();
      if (v) parts.add(v);
    }
    for (const s of stepsOf(m)) {
      for (const raw of [s.resource_title, s.instruction, s.instruction_km]) {
        const v = (raw ?? "").trim();
        if (v) parts.add(v);
      }
    }
  }
  return [...parts].join(" ");
}
