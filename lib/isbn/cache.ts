/**
 * Provider answers kept in `isbn_metadata_cache` (migration 0156), so a
 * public provider is asked about an ISBN once, not once per librarian click.
 *
 * Found answers are kept 90 days, "no such ISBN" 7 days (a record can appear
 * later), and errors never — a quota stop or a timeout says nothing about the
 * ISBN. The cache is an optimisation, so a cache that cannot be read or
 * written is a miss, never a failed lookup.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IsbnCandidate, IsbnProvider } from "./types";

export const CACHE_TTL_MS = {
  found: 90 * 24 * 60 * 60 * 1000,
  not_found: 7 * 24 * 60 * 60 * 1000,
} as const;

export type CachedAnswer = { status: "found"; candidates: IsbnCandidate[] } | { status: "not_found" };

export interface IsbnCache {
  get(isbn13: string, provider: IsbnProvider, now: Date): Promise<CachedAnswer | null>;
  set(isbn13: string, provider: IsbnProvider, answer: CachedAnswer, now: Date): Promise<void>;
}

/** `db` is the service client (the table is revoked from every API role). */
export function createSupabaseIsbnCache(db: SupabaseClient): IsbnCache {
  return {
    async get(isbn13, provider, now) {
      const { data, error } = await db
        .from("isbn_metadata_cache")
        .select("status, candidates, expires_at")
        .eq("isbn13", isbn13)
        .eq("provider", provider)
        .maybeSingle();
      if (error || !data) return null;
      const row = data as { status?: string; candidates?: unknown; expires_at?: string };
      if (!row.expires_at || new Date(row.expires_at) <= now) return null;
      if (row.status === "not_found") return { status: "not_found" };
      if (row.status === "found" && Array.isArray(row.candidates) && row.candidates.length > 0) {
        return { status: "found", candidates: row.candidates as IsbnCandidate[] };
      }
      return null;
    },
    async set(isbn13, provider, answer, now) {
      const { error } = await db.from("isbn_metadata_cache").upsert(
        {
          isbn13,
          provider,
          status: answer.status,
          candidates: answer.status === "found" ? answer.candidates : [],
          fetched_at: now.toISOString(),
          expires_at: new Date(now.getTime() + CACHE_TTL_MS[answer.status]).toISOString(),
        },
        { onConflict: "isbn13,provider" },
      );
      if (error) console.warn("[isbn-cache] write skipped:", error.message);
    },
  };
}
