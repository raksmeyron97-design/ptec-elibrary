/**
 * Next.js instrumentation hook — runs once at server startup.
 *
 * Two jobs:
 *
 * 1. Validates that the environment variables each subsystem needs are present
 *    and logs a single clear warning per missing group. Warn-only by design:
 *    a missing optional group (e.g. Telegram) must not take the whole site
 *    down, and the truly critical ones fail loudly at first use anyway.
 *
 * 2. Installs the durable security-event sink. This is the ONLY place allowed
 *    to import `lib/security/sink.ts`, which is server-only — keeping the
 *    wiring inverted is what lets `lib/security-log.ts` stay free of
 *    `server-only` so it remains importable from the pure unit tests and from
 *    every layer that emits events. See docs/SECURITY-MONITORING.md.
 */

const ENV_GROUPS: { group: string; critical: boolean; vars: string[] }[] = [
  {
    group: "Supabase (database + auth)",
    critical: true,
    vars: [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ],
  },
  {
    group: "Zima Storage (file uploads/downloads)",
    critical: true,
    vars: ["ZIMA_API_URL", "ZIMA_API_KEY"],
  },
  {
    group: "Legacy R2 storage (old book/thesis records)",
    critical: false,
    vars: ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_ACCOUNT_ID", "R2_BUCKET_NAME"],
  },
  {
    group: "AI search & assistant",
    critical: false,
    vars: ["GEMINI_API_KEY"],
  },
  {
    group: "Contact form (Turnstile CAPTCHA + Gmail delivery)",
    critical: false,
    vars: ["TURNSTILE_SECRET_KEY", "SMTP_USER", "SMTP_PASS"],
  },
  {
    // These are ALERT credentials, not contact-form credentials — the contact
    // form has delivered by Gmail since lib/gmail.ts landed. Missing them
    // means security incidents open silently: the dashboard still works, but
    // nobody is paged. See docs/SECURITY-MONITORING.md §Delivery.
    group: "Security alerting (Telegram)",
    critical: false,
    vars: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"],
  },
  {
    group: "Web push notifications",
    critical: false,
    vars: ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"],
  },
  {
    group: "Cron cleanup",
    critical: false,
    vars: ["CRON_SECRET"],
  },
];

export async function register() {
  // Only meaningful in the Node.js server runtime.
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") return;

  // Durable security events. Dynamic import so the server-only module is never
  // pulled into the Edge runtime bundle, and so a failure here degrades to
  // "console logging only" rather than blocking server startup.
  try {
    const [{ registerSecuritySink }, { securitySink }] = await Promise.all([
      import("@/lib/security-log"),
      import("@/lib/security/sink"),
    ]);
    registerSecuritySink(securitySink);
  } catch (e) {
    console.error(
      "[instrumentation] security event sink not installed — events will be logged to stdout only:",
      e instanceof Error ? e.message : e,
    );
  }

  for (const { group, critical, vars } of ENV_GROUPS) {
    const missing = vars.filter((v) => !process.env[v]);
    if (missing.length === 0) continue;
    const level = critical ? "error" : "warn";
    console[level](
      `[env-check] ${critical ? "CRITICAL: " : ""}${group} is missing: ${missing.join(", ")} — related features will fail.`,
    );
  }
}
