#!/usr/bin/env node
// Break-glass admin provisioning (docs/BREAK-GLASS-PROCEDURE.md, risk F1:
// exactly one admin-capable account is a bus-factor-1 lockout waiting to
// happen).
//
// Creates — or verifies — a second super_admin account whose credentials go
// straight into a sealed envelope / password-manager emergency access, never
// into daily use. Node builtins only; service-role key from .env.
//
// Usage:
//   node scripts/ops/create-breakglass-admin.mjs --email breakglass@example.org          # verify/report only
//   node scripts/ops/create-breakglass-admin.mjs --email breakglass@example.org --create # actually provision
//
// Safety: without --create this only READS (does the account exist, what
// role, is it sealed-worthy) — safe to run any time, including in the
// quarterly access review. --create refuses to touch an email that already
// has an account. The generated password is printed ONCE, to stdout, for the
// envelope; it is never written to disk and never logged anywhere else.
//
// --create also refuses to run unless stdout is an interactive terminal. The
// one-time print is the whole handoff, so a redirect (`> out.txt`, a pipe into
// `tee`, a CI step, `script`/`asciinema`) would quietly turn a sealed-envelope
// credential into a file nobody remembers to shred. Failing before the account
// exists is the cheap side of that trade.

import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv, requireEnv, restHeaders } from "../backup/lib.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** ~26 chars from a 160-bit pool — memorability is an anti-goal here. */
function generatePassword() {
  // base64url, filtered to avoid ambiguous chars; regenerate until long enough
  let pw = "";
  while (pw.length < 26) {
    pw += randomBytes(30).toString("base64url").replace(/[-_0OIl1]/g, "");
  }
  return pw.slice(0, 26);
}

async function adminApi(env, method, pathname, body) {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1${pathname}`, {
    method,
    headers: { ...restHeaders(env), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${pathname} → ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

async function findUserByEmail(env, email) {
  // GoTrue admin listing is paginated; the user set here is small.
  for (let page = 1; page <= 20; page++) {
    const json = await adminApi(env, "GET", `/admin/users?page=${page}&per_page=100`);
    const users = json.users ?? [];
    const hit = users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (users.length < 100) return null;
  }
  return null;
}

async function getProfile(env, userId) {
  const res = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=id,role,is_super_admin`,
    { headers: restHeaders(env) },
  );
  if (!res.ok) throw new Error(`profiles read failed: ${res.status}`);
  const rows = await res.json();
  return rows[0] ?? null;
}

async function main() {
  const args = process.argv.slice(2);
  const create = args.includes("--create");
  const emailIdx = args.indexOf("--email");
  const email = emailIdx >= 0 ? args[emailIdx + 1] : null;

  if (!email || !email.includes("@")) {
    console.error("Required: --email <address>  (add --create to provision)");
    process.exit(2);
  }

  const env = loadEnv(REPO_ROOT);
  requireEnv(env, ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);

  // Always report the current admin roster first — the point of this script
  // is knowing whether the library survives losing one account.
  const rosterRes = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?or=(role.in.(admin,super_admin),is_super_admin.eq.true)&select=id,role,is_super_admin`,
    { headers: restHeaders(env) },
  );
  const roster = rosterRes.ok ? await rosterRes.json() : [];
  console.log(`Admin-capable profiles right now: ${roster.length}`);
  if (roster.length <= 1) {
    console.log("  → bus factor 1: losing that account locks the library's admin panel.");
  }

  const existing = await findUserByEmail(env, email);

  if (!create) {
    if (!existing) {
      console.log(`\n${email}: no account. Run again with --create to provision the break-glass admin.`);
      process.exit(roster.length <= 1 ? 1 : 0);
    }
    const profile = await getProfile(env, existing.id);
    const isSuper = profile?.role === "super_admin" || profile?.is_super_admin === true;
    console.log(`\n${email}: exists (id ${existing.id})`);
    console.log(`  role: ${profile?.role ?? "no profile row"} · is_super_admin: ${profile?.is_super_admin ?? false}`);
    console.log(`  last sign-in: ${existing.last_sign_in_at ?? "never (good — break-glass should be dormant)"}`);
    console.log(isSuper ? "  ✓ break-glass ready" : "  ✗ NOT super_admin — fix the role via /admin/users (audited) or re-run with --create on a fresh address");
    process.exit(isSuper ? 0 : 1);
  }

  // --create path
  if (!process.stdout.isTTY) {
    console.error("\nRefusing to --create with stdout redirected.");
    console.error("The generated password is shown exactly once and must not land in a log file,");
    console.error("a CI transcript or a scrollback capture. Re-run attached to a terminal.");
    process.exit(2);
  }
  if (existing) {
    console.error(`\n${email} already has an account (id ${existing.id}).`);
    console.error("Refusing to touch it — resetting an existing account's password from a script would be indistinguishable from a takeover in the audit trail.");
    console.error("Verify it instead (run without --create), or pick a fresh address.");
    process.exit(1);
  }

  const password = generatePassword();
  console.log(`\nCreating break-glass super_admin ${email} …`);
  const user = await adminApi(env, "POST", "/admin/users", {
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Break-glass admin (sealed — see BREAK-GLASS-PROCEDURE.md)" },
  });

  // handle_new_user creates the profile row as a reader; promote it.
  const up = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`, {
    method: "PATCH",
    headers: { ...restHeaders(env), "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ role: "super_admin", is_super_admin: true }),
  });
  const rows = up.ok ? await up.json() : [];
  if (!up.ok || rows.length === 0) {
    console.error(`Auth user created (${user.id}) but the profile promotion failed (${up.status}).`);
    console.error("Finish by setting role=super_admin for that id via /admin/users, then re-run without --create to verify.");
    process.exit(1);
  }

  console.log(`  ✓ auth user ${user.id} created (email confirmed)`);
  console.log("  ✓ profile promoted to super_admin");
  console.log("\n─── WRITE THIS INTO THE SEALED ENVELOPE, THEN CLEAR YOUR TERMINAL ───");
  console.log(`  URL:      ${env.NEXT_PUBLIC_SITE_URL ?? "https://library.ptec.edu.kh"}/admin/login`);
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
  console.log("──────────────────────────────────────────────────────────────────────");
  console.log("Next (docs/BREAK-GLASS-PROCEDURE.md): seal it, record the seal date in");
  console.log("the quarterly review sheet, and NEVER use this account for daily work.");
  console.log("MFA enrolls on first activation (/admin/mfa) — that is by design.");
}

main().catch((e) => {
  console.error("create-breakglass-admin failed:", e.message);
  process.exit(1);
});
