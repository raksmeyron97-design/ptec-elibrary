#!/usr/bin/env node
// Secret rotation helper (docs/SECRET-REGISTRY.md, RUNBOOKS.md §M16).
//
// Multi-location secrets are where rotations go wrong: CRON_SECRET lives in
// two places and SUPABASE_SERVICE_ROLE_KEY in four, and a half-completed
// rotation is an outage that looks like a mystery. This script makes the
// coordination explicit: it generates a cryptographically secure value where
// generation is ours to do, and prints the exact, ordered commands for every
// location — new value everywhere first, verify, revoke old LAST.
//
// It never applies anything itself and never reads your current secrets.
//
// Usage:
//   node scripts/ops/rotate-secret.mjs                  # list rotatable secrets
//   node scripts/ops/rotate-secret.mjs CRON_SECRET      # plan (+ generated value)
//
// Node builtins only.

import { randomBytes } from "node:crypto";

const hex = (bytes) => randomBytes(bytes).toString("hex");
const b64url = (bytes) => randomBytes(bytes).toString("base64url");

// Ordered steps per secret. {V} is replaced by the generated value (never
// printed for dashboard-issued secrets — those come from their issuer).
const REGISTRY = {
  CRON_SECRET: {
    generate: () => hex(32),
    locations: ["GitHub Actions secret", "box .env"],
    impact: "Both cron sweeps 401 while the two copies disagree — rotate in one sitting.",
    steps: [
      "gh secret set CRON_SECRET --body '{V}'",
      "Box: edit /DATA/AppData/ptec-elibrary/app/.env → CRON_SECRET={V}",
      "Box: docker compose up -d app   (runtime env only — seconds, no rebuild)",
      "Verify: Actions → Scheduled Jobs → Run workflow → both sweeps 200",
      "No revoke step — replacing the value everywhere IS the revocation.",
    ],
  },
  ADMIN_SECRET_KEY: {
    generate: () => hex(32),
    locations: ["box .env", "Vercel env (if standby configured)"],
    impact: "Server-only signing/step-up secret; sessions unaffected.",
    steps: [
      "Box: edit .env → ADMIN_SECRET_KEY={V}; docker compose up -d app",
      "Vercel: Settings → Environment Variables → ADMIN_SECRET_KEY → redeploy standby",
      "Verify: admin login + one privileged action succeeds",
    ],
  },
  BACKUP_PASSPHRASE: {
    generate: () => b64url(32),
    locations: ["box .env", "password manager", "sealed break-glass envelope"],
    impact: "OLD backups stay encrypted under the OLD passphrase — keep it in the password manager (marked retired, dated) until every archive made with it has aged out of retention.",
    steps: [
      "Password manager: add new value; mark the old one 'retired {date}', do NOT delete",
      "Box: edit .env → BACKUP_PASSPHRASE={V}",
      "Run: node scripts/backup/backup-db.mjs && node scripts/backup/verify-backup.mjs (proves new-passphrase encrypt/decrypt round-trips)",
      "Update the break-glass envelope sheet (BREAK-GLASS-PROCEDURE.md §2)",
    ],
  },
  SUPABASE_SERVICE_ROLE_KEY: {
    generate: null, // issued by Supabase
    locations: ["Supabase dashboard", "GitHub Actions secret", "box .env", "Vercel env"],
    impact: "Image builds prerender with it and the running container reads it — a missed location = failed builds or 500s on service-role paths.",
    steps: [
      "Supabase dashboard → Settings → API → roll the service_role key (old one keeps working until revoked, where supported — do this step first, revoke last)",
      "gh secret set SUPABASE_SERVICE_ROLE_KEY   (paste new value)",
      "Box: edit .env → SUPABASE_SERVICE_ROLE_KEY=<new>; docker compose up -d app",
      "Vercel: update env; redeploy standby",
      "Republish the image (Actions → Docker Publish → Run workflow) — the BUILD also uses it",
      "Verify: /api/health 200; admin panel loads; one upload succeeds",
      "Supabase dashboard: revoke the old key (LAST)",
    ],
  },
  SUPABASE_DB_URL: {
    generate: null,
    locations: ["GitHub Actions secret"],
    impact: "Only migrate.yml uses it. Changes when the DB password is rotated.",
    steps: [
      "Supabase dashboard → Settings → Database → reset password",
      "Rebuild the SESSION POOLER url (port 5432 — never the direct IPv6-only host, never the 6543 transaction pooler)",
      "gh secret set SUPABASE_DB_URL",
      "Verify: Actions → Migrate Database → Run workflow → history listing prints",
    ],
  },
  ZIMA_API_KEY: {
    generate: null,
    locations: ["Zima Storage admin", "box .env", "Vercel env"],
    impact: "Uploads + proxied downloads fail while stale.",
    steps: [
      "Zima Storage admin: issue new key (keep old active)",
      "Box .env + Vercel env → ZIMA_API_KEY=<new>; docker compose up -d app",
      "Verify: open one PDF; upload one test file in /admin/upload",
      "Zima Storage admin: revoke old key (LAST)",
    ],
  },
  TELEGRAM_BOT_TOKEN: {
    generate: null,
    locations: ["BotFather", "box .env", "GitHub Actions secret", "Vercel env"],
    impact: "Contact-form delivery AND the alert channel go quiet while stale.",
    steps: [
      "@BotFather → /revoke → new token (revocation is immediate — move fast)",
      "Box .env + Vercel env → TELEGRAM_BOT_TOKEN=<new>; docker compose up -d app",
      "gh secret set TELEGRAM_BOT_TOKEN",
      "Verify: node scripts/ops/alert-telegram.mjs --test",
    ],
  },
  TURNSTILE_SECRET_KEY: {
    generate: null,
    locations: ["Cloudflare dashboard", "box .env", "Vercel env"],
    impact: "Contact form CAPTCHA fails closed while stale.",
    steps: [
      "Cloudflare → Turnstile → roll secret key (site key is public and unchanged)",
      "Box .env + Vercel env; docker compose up -d app",
      "Verify: submit the contact form once",
    ],
  },
  SMTP_PASS: {
    generate: null,
    locations: ["Google account (App Passwords)", "Supabase dashboard (Auth → SMTP)", "box .env"],
    impact: "Auth emails (signup, reset) silently stop while stale — Supabase's SMTP config is the location people forget.",
    steps: [
      "Google account → App passwords → create new (revoke old only at the end)",
      "Supabase dashboard → Auth → SMTP → update password",
      "Box .env (SMTP_PASS) if contact/email paths read it; docker compose up -d app",
      "Verify: trigger one password-reset email and receive it",
      "Google account: revoke old App Password (LAST)",
    ],
  },
  VAPID_PRIVATE_KEY: {
    generate: null, // keypair — public half must match
    locations: ["box .env (+ NEXT_PUBLIC_VAPID_PUBLIC_KEY as GitHub variable + everywhere env)"],
    impact: "ROTATION INVALIDATES EVERY PUSH SUBSCRIPTION — announce first; readers must re-subscribe. Rotate only on compromise.",
    steps: [
      "npx web-push generate-vapid-keys   (a PAIR — never rotate one half)",
      "gh variable set NEXT_PUBLIC_VAPID_PUBLIC_KEY --body '<public>'  (build arg → republish image)",
      "Box .env + Vercel: both halves; docker compose up -d app after the republished image lands",
      "Verify: subscribe on one device, send a test broadcast",
    ],
  },
  TUNNEL_TOKEN: {
    generate: null,
    locations: ["Cloudflare Zero Trust", "box .env"],
    impact: "Site unreachable while the tunnel restarts with a stale token.",
    steps: [
      "Cloudflare Zero Trust → Tunnels → rotate token",
      "Box .env → TUNNEL_TOKEN=<new>; docker compose up -d cloudflared",
      "Verify: site loads with a cf-ray header; docker logs ptec-tunnel clean",
    ],
  },
  GHCR_PULL_PAT: {
    generate: null,
    locations: ["GitHub PAT (read:packages)", "box: /DATA/AppData/ptec-elibrary/.docker"],
    impact: "Deploy timer silently stops installing new images when it expires — set a calendar reminder at issue time.",
    steps: [
      "GitHub → Settings → Developer settings → new PAT, read:packages only, 12-month expiry",
      "Box: echo <PAT> | sudo DOCKER_CONFIG=/DATA/AppData/ptec-elibrary/.docker docker login ghcr.io -u <user> --password-stdin",
      "Verify: sudo ./deploy/deploy.sh --force pulls successfully",
      "GitHub: delete the old PAT (LAST)",
    ],
  },
};

function printPlan(name) {
  const entry = REGISTRY[name];
  if (!entry) {
    console.error(`Unknown secret: ${name}\nKnown: ${Object.keys(REGISTRY).join(", ")}`);
    console.error("Full inventory (incl. non-rotatable public values): docs/SECRET-REGISTRY.md");
    process.exit(2);
  }
  const value = entry.generate ? entry.generate() : null;
  console.log(`Rotation plan: ${name}`);
  console.log(`  Locations (${entry.locations.length}): ${entry.locations.join(" · ")}`);
  console.log(`  Impact: ${entry.impact}`);
  if (value) {
    console.log(`\n  Generated value (use it in every step below, then clear your terminal):`);
    console.log(`  ${value}`);
  } else {
    console.log(`\n  This secret is issued by its provider — no value to generate here.`);
  }
  console.log(`\n  Steps, in order (new everywhere → verify → revoke old LAST):`);
  entry.steps.forEach((s, i) => console.log(`  ${i + 1}. ${value ? s.replaceAll("{V}", value) : s}`));
  console.log(`\n  Finish: record the rotation date in docs/SECRET-REGISTRY.md §Rotation log.`);
}

const name = process.argv[2];
if (!name) {
  console.log("Rotatable secrets (node scripts/ops/rotate-secret.mjs <NAME>):\n");
  for (const [k, v] of Object.entries(REGISTRY)) {
    console.log(`  ${k.padEnd(28)} ${v.locations.length} location(s) — ${v.locations.join(", ")}`);
  }
  console.log("\nFull inventory + cadence: docs/SECRET-REGISTRY.md");
} else {
  printPlan(name);
}
