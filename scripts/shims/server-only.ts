// `server-only` is a build-time marker: Next aliases it to a no-op for server
// bundles and to a hard error for client ones. Node knows neither alias, so a
// script importing a server module (lib/ai/retrieval.ts) fails to resolve it.
//
// scripts/tsconfig.benchmark.json maps the bare specifier here, which is the
// same shape vitest.server-only-shim.ts uses for the unit tests: the benchmark
// exercises the REAL retrieval functions rather than a copy that could drift
// from what production runs.
export {};
