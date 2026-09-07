// lib/ai/index.ts
// Public surface of the AI core. Route handlers import from here; nothing
// imports a route handler.
//
// `retrieval`, `limits`, `router`, `telemetry` and `provider` are server-only
// (they touch Supabase, a model provider or `server-only` itself). The rest is
// pure and unit-tested.

export * from "./response";
export * from "./intent";
export * from "./models";
export * from "./provider-config";
export * from "./circuit-breaker";
export * from "./prompts";
export * from "./token-budget";
export * from "./citations";
export * from "./context";
export * from "./conversation";
export * from "./guardrails";
export * from "./plan";
export * from "./cache";
export * as templates from "./templates";
