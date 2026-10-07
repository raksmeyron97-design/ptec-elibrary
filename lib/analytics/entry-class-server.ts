import "server-only";

// The server half of WI-3: what a view or reader-open row may store as its
// entry class. The browser's value is never trusted — anything that is not
// one of the five classes becomes null — and `ENTRY_CLASS=off` (the
// rollback) stops storing it at all. Default ON; only an explicit "off"
// disables it, the fail-safe direction for a measurement nobody reads yet.

import { isEntryClass, type EntryClass } from "@/lib/analytics/entry-class";

export function entryClassEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.ENTRY_CLASS?.trim().toLowerCase() !== "off";
}

export function entryClassForLog(
  value: unknown,
  env: Record<string, string | undefined> = process.env,
): EntryClass | null {
  if (!entryClassEnabled(env)) return null;
  return isEntryClass(value) ? value : null;
}
