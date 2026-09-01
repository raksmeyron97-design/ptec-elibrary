/**
 * End-to-end probe of the security pipeline against a REAL Postgres.
 *
 * Opt-in, like `lib/rls.test.ts`: the normal unit run skips it. The in-memory
 * integration test (`incidents.integration.test.ts`) covers the same logic
 * everywhere; this one proves the assumptions that only a real database can
 * settle — that the partial unique index actually deduplicates, that
 * `next_incident_reference()` actually increments, that every column the
 * engine writes actually exists and accepts what it sends, and that the CHECK
 * constraints accept the vocabulary the model produces.
 *
 *   SECURITY_PROBE=1 npx dotenv -e .env.local -- npx vitest run lib/security/incidents.probe.test.ts
 *
 * Safety: it writes and then deletes its own rows, all tagged with a unique
 * run marker in `location`, and never touches a row it did not create.
 * Telegram credentials are unset for the duration, so nothing is sent.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const RUN = !!process.env.SECURITY_PROBE;
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const MARKER = `probe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
/**
 * A short, lowercase-alphanumeric path segment. Kept short and letter-led on
 * purpose: `routeScope()` collapses long segments to ":id" and numeric ones to
 * ":n", so a marker that tripped either rule would not survive into the
 * fingerprint and this probe would assert against the wrong incident.
 */
const ROUTE_MARK = Math.random().toString(36).slice(2, 10).replace(/[^a-z]/g, "x");
const PROBE_ROUTE = `/api/probe/${ROUTE_MARK}`;
/**
 * The fingerprint the ENGINE will compute — not the one on the event rows.
 *
 * Two things differ from the event's own fingerprint, and both matter:
 *  1. findings derive their fingerprint from type + route themselves
 *     (`fingerprint()` in model.ts), they do not inherit the event's;
 *  2. the type is the DERIVED one the detector emits (`rate_limit_storm`),
 *     not the raw type of the events it counted (`rate_limited`).
 * Asserting on the raw value silently matches nothing.
 */
const EXPECTED_FINGERPRINT = `rate_limit_storm:${PROBE_ROUTE}`;
const MIN = 60_000;

let db: SupabaseClient;
let savedToken: string | undefined;
let savedChat: string | undefined;

function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    event_type: "rate_limited",
    severity: 4,
    risk_score: 4,
    risk_reason: "probe",
    service: "search",
    location: PROBE_ROUTE,
    actor_type: "anonymous",
    actor_id: null,
    target: null,
    result: "blocked",
    detail: null,
    request_id: MARKER,
    ip_hash: "probe-client",
    event_count: 1,
    fingerprint: EXPECTED_FINGERPRINT,
    metadata: {},
    occurred_at: new Date(Date.now() - 2 * MIN).toISOString(),
    ...overrides,
  };
}

async function cleanup() {
  if (!db) return;
  await db.from("security_events").delete().eq("request_id", MARKER);
  await db.from("security_incidents").delete().eq("fingerprint", EXPECTED_FINGERPRINT);
  // alert_deliveries rows cascade with their incident.
}

beforeAll(() => {
  if (!RUN) return;
  db = createClient(URL_, SERVICE_KEY, { auth: { persistSession: false } });
  savedToken = process.env.TELEGRAM_BOT_TOKEN;
  savedChat = process.env.TELEGRAM_CHAT_ID;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
});

afterAll(async () => {
  if (!RUN) return;
  await cleanup();
  if (savedToken) process.env.TELEGRAM_BOT_TOKEN = savedToken;
  if (savedChat) process.env.TELEGRAM_CHAT_ID = savedChat;
});

describe.skipIf(!RUN)("security pipeline against a real database", () => {
  it("has migration 0127 applied", async () => {
    const { error } = await db.from("security_events").select("id").limit(1);
    expect(error, "migration 0127 is not applied to this database").toBeNull();
  });

  it("accepts every result and actor_type the model can produce", async () => {
    // The CHECK constraints and the TypeScript unions must agree; if they
    // drift, every event of the missing kind is silently dropped at the sink.
    for (const result of ["allowed", "blocked", "failed", "success"]) {
      for (const actor_type of ["anonymous", "user", "admin", "system", "external"]) {
        const { error } = await db
          .from("security_events")
          .insert(eventRow({ result, actor_type, fingerprint: `probe-constraints:${MARKER}` }));
        expect(error, `result=${result} actor_type=${actor_type}`).toBeNull();
      }
    }
    await db.from("security_events").delete().eq("request_id", MARKER);
  });

  it("generates incrementing incident references", async () => {
    const { data: a } = await db.rpc("next_incident_reference");
    expect(String(a)).toMatch(/^SEC-\d{8}-\d{3}$/);
  });

  it("runs a full pass: events → incident → evidence attached", async () => {
    const { runSecurityScan } = await import("./incidents");

    // 120 refusals on one route — past the catalog's rate-limit-storm
    // threshold of 100/h.
    const rows = Array.from({ length: 120 }, (_, i) =>
      eventRow({ occurred_at: new Date(Date.now() - (i % 50) * MIN).toISOString() }),
    );
    const { error: insertError } = await db.from("security_events").insert(rows);
    expect(insertError).toBeNull();

    const summary = await runSecurityScan();
    expect(summary.eventsScanned).toBeGreaterThanOrEqual(120);

    const { data: incidents } = await db
      .from("security_incidents")
      .select("*")
      .eq("fingerprint", EXPECTED_FINGERPRINT);
    expect(incidents).toHaveLength(1);
    expect(incidents![0].status).toBe("open");
    expect(incidents![0].severity).toBe(2);
    expect(incidents![0].event_count).toBeGreaterThanOrEqual(120);
    expect(incidents![0].reference).toMatch(/^SEC-\d{8}-\d{3}$/);
    expect(incidents![0].detection_reason).toContain("rate-limit refusals");

    const { data: attached } = await db
      .from("security_events")
      .select("id")
      .eq("incident_id", incidents![0].id);
    expect(attached!.length).toBeGreaterThanOrEqual(120);
  }, 30_000);

  it("a second pass does not open a second incident", async () => {
    const { runSecurityScan } = await import("./incidents");
    await runSecurityScan();
    const { data: incidents } = await db
      .from("security_incidents")
      .select("id,alert_count")
      .eq("fingerprint", EXPECTED_FINGERPRINT);
    expect(incidents).toHaveLength(1);
    // And it did not try to announce itself a second time.
    expect(incidents![0].alert_count).toBe(1);
  }, 30_000);

  it("the database itself refuses a duplicate live incident", async () => {
    const { error } = await db.from("security_incidents").insert({
      reference: `SEC-DUP-${MARKER.slice(-6)}`,
      fingerprint: EXPECTED_FINGERPRINT,
      status: "open",
      severity: 2,
      category: "auth_attack",
      title: "duplicate probe",
      service: "auth",
    });
    expect(error?.code).toBe("23505");
  });

  it("records the skipped delivery when Telegram is not configured", async () => {
    const { data: incident } = await db
      .from("security_incidents")
      .select("id")
      .eq("fingerprint", EXPECTED_FINGERPRINT)
      .single();
    const { data: deliveries } = await db
      .from("alert_deliveries")
      .select("status,error_class,channel")
      .eq("incident_id", incident!.id);
    expect(deliveries!.length).toBeGreaterThanOrEqual(1);
    expect(deliveries![0].channel).toBe("telegram");
    expect(deliveries![0].status).toBe("skipped");
    expect(deliveries![0].error_class).toBe("no_credentials");
  });

  it("anon cannot read any of it", async () => {
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    for (const table of ["security_events", "security_incidents", "alert_deliveries", "security_baselines"]) {
      const res = await fetch(`${URL_}/rest/v1/${table}?limit=1`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      });
      expect([401, 403, 404], `${table} is reachable by anon`).toContain(res.status);
    }
  });
});
