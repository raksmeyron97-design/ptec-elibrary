/**
 * Ask every enabled provider about one ISBN — cache first — and report what
 * each one said. Pure: providers, cache and clock are injected.
 *
 * Providers run in parallel and independently, so one being down, slow or out
 * of quota costs the librarian that provider's answer and nothing else.
 */
import type { CachedAnswer, IsbnCache } from "./cache";
import type { IsbnCandidate, IsbnProvider, ProviderOutcome, ProviderResult } from "./types";

export type ProviderFn = (isbn13: string, isbn10: string | null) => Promise<ProviderResult>;

export interface LookupDeps {
  /** In display order. */
  providers: { name: IsbnProvider; lookup: ProviderFn }[];
  cache?: IsbnCache;
  now?: () => Date;
}

export async function lookupIsbnMetadata(
  isbn13: string,
  isbn10: string | null,
  deps: LookupDeps,
): Promise<{ candidates: IsbnCandidate[]; outcomes: ProviderOutcome[] }> {
  const now = deps.now ?? (() => new Date());

  const answers = await Promise.all(
    deps.providers.map(async ({ name, lookup }): Promise<{ candidates: IsbnCandidate[]; outcome: ProviderOutcome }> => {
      const cached = deps.cache ? await deps.cache.get(isbn13, name, now()).catch(() => null) : null;
      if (cached) return fromAnswer(name, cached, true);

      let res: ProviderResult;
      try {
        res = await lookup(isbn13, isbn10);
      } catch {
        res = { status: "error", kind: "bad_response", message: "The provider failed unexpectedly." };
      }
      if (res.status === "error") {
        return { candidates: [], outcome: { provider: name, status: "error", kind: res.kind, message: res.message } };
      }
      if (deps.cache) await deps.cache.set(isbn13, name, res, now()).catch(() => undefined);
      return fromAnswer(name, res, false);
    }),
  );

  return {
    candidates: answers.flatMap((a) => a.candidates),
    outcomes: answers.map((a) => a.outcome),
  };
}

function fromAnswer(provider: IsbnProvider, a: CachedAnswer, cached: boolean) {
  return a.status === "found"
    ? { candidates: a.candidates, outcome: { provider, status: "found" as const, count: a.candidates.length, cached } }
    : { candidates: [], outcome: { provider, status: "not_found" as const, cached } };
}
