/**
 * Next.js instrumentation hook — runs once at server startup.
 *
 * Validates that the environment variables each subsystem needs are present
 * and logs a single clear warning per missing group. Warn-only by design:
 * a missing optional group (e.g. Telegram) must not take the whole site down,
 * and the truly critical ones fail loudly at first use anyway.
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
    group: "Contact form (Turnstile + Telegram)",
    critical: false,
    vars: ["TURNSTILE_SECRET_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"],
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
  {
    group: "User avatars (Vercel Blob)",
    critical: false,
    vars: ["BLOB_READ_WRITE_TOKEN"],
  },
];

export async function register() {
  // Only meaningful in the Node.js server runtime.
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") return;

  for (const { group, critical, vars } of ENV_GROUPS) {
    const missing = vars.filter((v) => !process.env[v]);
    if (missing.length === 0) continue;
    const level = critical ? "error" : "warn";
    console[level](
      `[env-check] ${critical ? "CRITICAL: " : ""}${group} is missing: ${missing.join(", ")} — related features will fail.`,
    );
  }
}
