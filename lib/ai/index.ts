// lib/ai/index.ts
// Public surface of the AI core. Route handlers import from here; nothing
// imports a route handler.
//
// `retrieval`, `limits`, `router` and `telemetry` are server-only (they touch
// Supabase, Gemini or `server-only` itself). The rest is pure and unit-tested.

export * from "./response";
export * from "./intent";
export * from "./models";
export * from "./prompts";
export * from "./token-budget";
export * from "./citations";
export * from "./context";
export * from "./conversation";
export * from "./guardrails";
export * from "./plan";
export * from "./cache";
export * as templates from "./templates";
