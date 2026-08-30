#!/usr/bin/env node
// Telegram alert dispatcher — the primary active alert channel
// (docs/ALERT-CATALOG.md §Delivery channels, docs/MONITORING.md).
//
// Node builtins only, like the backup toolchain: runs anywhere the repo and
// an .env exist (dev machine, ZimaOS box, CI runner with env-injected
// secrets). Uses the same bot that delivers contact-form messages
// (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID), so no new credentials exist.
//
// Usage:
//   node scripts/ops/alert-telegram.mjs \
//     --severity 1 --title "Site down" --service uptime-probe \
//     --message "GET /api/health failed 3x" --runbook "docs/RUNBOOKS.md §I1"
//   node scripts/ops/alert-telegram.mjs --test     # verify bot + chat wiring
//
// Exit codes: 0 sent · 1 Telegram refused/unreachable · 2 credentials missing.
// Callers that alert on failure should treat a non-zero exit as "the alert
// channel itself is down" and fall back to their own logging — never crash
// the calling job harder because the alert could not be delivered.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../backup/lib.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const SEVERITY_TAGS = {
  1: "🚨 SEV 1",
  2: "⚠️ SEV 2",
  3: "🔔 SEV 3",
  4: "ℹ️ SEV 4",
};

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Phnom Penh wall-clock beside UTC — responders think in local time. */
function timestamps(d = new Date()) {
  const utc = d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const local = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Phnom_Penh",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(d);
  return `${utc} · ${local} Phnom Penh`;
}

/**
 * Send one alert. Returns true on success, false on delivery failure.
 * Never throws — an alert path must not take its caller down with it.
 */
export async function sendTelegramAlert(env, { title, message, severity = 3, runbook, service }) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;

  const sev = SEVERITY_TAGS[severity] ?? SEVERITY_TAGS[3];
  const lines = [
    `${sev} — <b>${escapeHtml(title)}</b>`,
    service ? `Service: <code>${escapeHtml(service)}</code>` : null,
    message ? escapeHtml(message) : null,
    runbook ? `Runbook: ${escapeHtml(runbook)}` : null,
    `<i>${escapeHtml(timestamps())}</i>`,
  ].filter(Boolean);

  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15_000);
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: lines.join("\n"),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: ctl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`Telegram refused the alert: HTTP ${res.status} ${body.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`Telegram unreachable: ${e.message}`);
    return false;
  }
}

function parseArgs(argv) {
  const out = { severity: 3, test: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--test") out.test = true;
    else if (a === "--severity") out.severity = Number(argv[++i]);
    else if (a === "--title") out.title = argv[++i];
    else if (a === "--message") out.message = argv[++i];
    else if (a === "--runbook") out.runbook = argv[++i];
    else if (a === "--service") out.service = argv[++i];
    else {
      console.error(`Unknown argument: ${a}`);
      process.exit(2);
    }
  }
  if (!out.test && !out.title) {
    console.error("Required: --title (or --test). See the header of this file for usage.");
    process.exit(2);
  }
  if (![1, 2, 3, 4].includes(out.severity)) {
    console.error(`--severity must be 1-4, got: ${out.severity}`);
    process.exit(2);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnv(REPO_ROOT);

  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    console.error(
      "TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set (in the environment or .env/.env.local).",
    );
    process.exit(2);
  }

  if (args.test) {
    // getMe proves the token; the message proves the chat id.
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`);
    if (!res.ok) {
      console.error(`Bot token rejected: HTTP ${res.status}`);
      process.exit(1);
    }
    const me = await res.json();
    console.log(`Bot OK: @${me.result?.username}`);
    const ok = await sendTelegramAlert(env, {
      title: "Test alert — wiring check",
      severity: 4,
      service: "alert-telegram --test",
      message: "If you can read this, the PTEC alert channel works.",
    });
    console.log(ok ? "Test alert delivered." : "Test alert NOT delivered.");
    process.exit(ok ? 0 : 1);
  }

  const ok = await sendTelegramAlert(env, args);
  if (ok) console.log("Alert delivered.");
  process.exit(ok ? 0 : 1);
}

// CLI entry — skipped when imported (backup scripts import sendTelegramAlert).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error("alert-telegram crashed:", e.message);
    process.exit(1);
  });
}
