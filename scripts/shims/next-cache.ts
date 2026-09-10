// A `next/cache` stand-in for the offline benchmarks.
//
// `unstable_cache` throws `Invariant: incrementalCache missing` outside a Next
// request context, and `getOrgIdentity()` — which every generated prompt needs
// for the library's own name — is wrapped in one. Without this shim
// scripts/ai-answer-benchmark.ts fails on whichever questions happen to reach
// an uncached read, which is worse than failing on all of them: the benchmark
// reports a routing error that is an artefact of the harness.
//
// Passthrough is the honest behaviour here. Caching is a production concern;
// what the benchmark measures is the answer, and a benchmark that memoized
// across questions would report the first question's org identity for all of
// them. Mapped in scripts/tsconfig.benchmark.json exactly as `server-only` is.

export function unstable_cache<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return fn;
}

// Parameters are omitted rather than named-and-unused: a shim that accepts
// anything and does nothing is the whole contract, and TypeScript allows a
// caller to pass more arguments than the signature declares.
export function revalidateTag(): void {}
export function revalidatePath(): void {}
export function unstable_noStore(): void {}
export const unstable_cacheTag = (): void => {};
export const unstable_cacheLife = (): void => {};
