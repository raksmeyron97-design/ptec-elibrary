/**
 * The server's door to Koha. Everything else in lib/koha is pure; this is the
 * one module that reads `process.env`, and it is `server-only` so a client
 * component that imports it fails the build instead of shipping a secret.
 */
import "server-only";
import { createKohaClient, type KohaClient } from "./client";
import { resolveKohaConfig, type KohaConfig } from "./config";
import { kohaCoverConfig, type KohaCoverConfig } from "./covers";

let cached: { config: KohaConfig; client: KohaClient } | null = null;

function state() {
  if (!cached) {
    const config = resolveKohaConfig(process.env);
    cached = { config, client: createKohaClient(config) };
  }
  return cached;
}

/** The resolved configuration — mode, problems, warnings. Carries the secret: never serialise it to a client. */
export function getKohaConfig(): KohaConfig {
  return state().config;
}

/** One client per process, so its token is shared by every request. */
export function getKohaClient(): KohaClient {
  return state().client;
}

/** Covers from Koha (covers.ts): KOHA_COVERS, KOHA_COVER_REPORT_ID, KOHA_OPAC_INTERNAL_URL. Holds no secret. */
export function getKohaCoverConfig(): KohaCoverConfig {
  return kohaCoverConfig(process.env);
}
