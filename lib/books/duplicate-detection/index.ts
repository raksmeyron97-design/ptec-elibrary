/**
 * The duplicate-detection service, one import away.
 *
 * Pure modules only — `service.ts` is server-only and must be imported
 * directly, so a client component cannot pull a service-role Supabase client
 * into the browser bundle by reaching for the barrel.
 */
export * from "./normalize";
export * from "./similarity";
export * from "./signals";
