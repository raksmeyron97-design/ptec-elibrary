// Vitest alias target for the bare "server-only" import used across lib/*
// (e.g. lib/gmail.ts, lib/permissions.ts). Next.js's own webpack build
// resolves that import to a no-op for server bundles and a throwing stub
// for client bundles (next/dist/compiled/server-only/{empty,index}.js) —
// Vite has no equivalent split, so this is aliased in as the always-safe
// no-op half: unit tests only ever exercise server-side logic.
export {};
