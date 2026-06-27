import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { rateLimit } from "@/lib/rate-limit";

const COOLDOWN_MS = 2 * 60 * 1000;
const MAX_PER_HOUR = 3;
const HOUR_MS = 60 * 60 * 1000;

function getClientIP(req: NextRequest): string {
  // Prefer x-real-ip: the platform/proxy (Vercel) sets this to the true client
  // IP and the client cannot override it. The LEFT-most x-forwarded-for value is
  // client-controlled and must not be trusted for rate limiting; fall back to the
  // RIGHT-most entry (added by the closest trusted hop) only if x-real-ip is absent.
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return "unknown";
}

// Verify a Cloudflare Turnstile token. If TURNSTILE_SECRET_KEY is not configured,
// verification is skipped (no behavior change) so the form keeps working until the
// secret is set in the deployment.
async function verifyTurnstile(token: string | undefined, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.error("[SECURITY] TURNSTILE_SECRET_KEY is not configured — blocking request");
    return false;
  }
  if (!token) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

async function checkLimit(ip: string, supabase: SupabaseClient) {
  const now = Date.now();
  const { data } = await supabase.from("contact_rate_limit").select("history").eq("ip", ip).single();
  let history: number[] = data ? data.history : [];
  history = history.filter((t: number) => now - t < HOUR_MS);

  if (history.length === 0) return { blocked: false, history };

  const last = history[history.length - 1];
  const elapsed = now - last;
  if (elapsed < COOLDOWN_MS) {
    const secondsLeft = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
    return { blocked: true, reason: "cooldown", secondsLeft, history };
  }

  if (history.length >= MAX_PER_HOUR) {
    const oldest = Math.min(...history);
    const secondsLeft = Math.ceil((HOUR_MS - (now - oldest)) / 1000);
    return { blocked: true, reason: "hourly", secondsLeft, history };
  }

  return { blocked: false, history };
}

async function recordSend(ip: string, history: number[], supabase: SupabaseClient) {
  const now = Date.now();
  history.push(now);
  await supabase.from("contact_rate_limit").upsert({ ip, history });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, email, message, turnstileToken } = body;

  // Validate
  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    return NextResponse.json({ error: "All fields are required." }, { status: 400 });
  }

  const emailRE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRE.test(email.trim())) {
    return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
  }

  if (name.trim().length > 100 || message.trim().length > 2000) {
    return NextResponse.json({ error: "Input too long." }, { status: 400 });
  }

  const ip = getClientIP(req);

  // 0. CAPTCHA (enforced only when TURNSTILE_SECRET_KEY is configured)
  if (!(await verifyTurnstile(turnstileToken, ip))) {
    return NextResponse.json({ error: "Captcha verification failed." }, { status: 403 });
  }

  // 1. In-memory DDoS protection (fast fail)
  const memLimit = await rateLimit(ip, 10, 60 * 1000); // Max 10 requests per minute per IP
  if (!memLimit.success) {
    return NextResponse.json(
      { error: "Too many rapid requests. Please slow down.", secondsLeft: Math.ceil((memLimit.reset - Date.now()) / 1000) },
      { status: 429 }
    );
  }

  // 2. Persistent Business Logic limit (3 per hour)
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const limit = await checkLimit(ip, supabase);

  if (limit.blocked) {
    const msg =
      limit.reason === "cooldown"
        ? `Please wait ${limit.secondsLeft} seconds before sending again.`
        : `Too many messages. Try again in ${Math.ceil(limit.secondsLeft! / 60)} minutes.`;
    return NextResponse.json(
      { error: msg, secondsLeft: limit.secondsLeft, reason: limit.reason },
      { status: 429 }
    );
  }

  // Send to Telegram
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  if (!BOT_TOKEN || !CHAT_ID) {
    console.error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
    return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  const text = `📬 New message from library\n\n👤 Name: ${name.trim()}\n📧 Email: ${email.trim()}\n💬 Message:\n${message.trim()}`;

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text }),
    });

    if (!tgRes.ok) {
      const err = await tgRes.text();
      console.error("Telegram error:", err);
      throw new Error("Telegram API error");
    }

    await recordSend(ip, limit.history, supabase);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to send message. Please email us directly." },
      { status: 502 }
    );
  }
}