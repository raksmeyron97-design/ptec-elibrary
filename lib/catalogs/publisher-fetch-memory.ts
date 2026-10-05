import "server-only";
/**
 * What this server fetched from a publisher's page, briefly remembered — so a
 * "this description came from <host>" credit (lib/catalogs/provenance.ts) is
 * believed only when THIS server performed that fetch for THAT librarian, and
 * the saved text is the text it returned.
 *
 * In memory, per process, on globalThis (a route handler and a server action
 * can load separate copies of a module — the patron loans cache learned this).
 * The deployment is one container; a restart forgets, and a forgotten fetch is
 * credited to the librarian — the safe direction: an unproven claim is never a
 * provider's.
 */
import { createHash } from "node:crypto";

type Remembered = { host: string; source: "publisher" | "crossref"; at: number };

const TTL_MS = 2 * 60 * 60 * 1000;
const MAX_ENTRIES = 500;

const g = globalThis as unknown as { __ptecPublisherFetches?: Map<string, Remembered> };
const store = (g.__ptecPublisherFetches ??= new Map());

const key = (userId: string, canonicalDescription: string) =>
  `${userId}:${createHash("sha256").update(canonicalDescription, "utf8").digest("hex")}`;

export function rememberPublisherFetch(userId: string, canonicalDescription: string, fetched: Omit<Remembered, "at">): void {
  if (!canonicalDescription) return;
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
  store.set(key(userId, canonicalDescription), { ...fetched, at: Date.now() });
}

export function recallPublisherFetch(userId: string, canonicalDescription: string): Omit<Remembered, "at"> | null {
  const k = key(userId, canonicalDescription);
  const hit = store.get(k);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    store.delete(k);
    return null;
  }
  return { host: hit.host, source: hit.source };
}
