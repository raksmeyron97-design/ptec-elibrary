import { NextRequest, NextResponse } from "next/server";

const COOLDOWN_MS = 2 * 60 * 1000;
const MAX_PER_HOUR = 3;
const HOUR_MS = 60 * 60 * 1000;

const ipHistory: Record<string, number[]> = {};

function getClientIP(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function checkLimit(ip: string) {
  const now = Date.now();
  const history = (ipHistory[ip] || []).filter((t) => now - t < HOUR_MS);
  ipHistory[ip] = history;

  if (history.length === 0) return { blocked: false };

  const last = history[history.length - 1];
  const elapsed = now - last;
  if (elapsed < COOLDOWN_MS) {
    const secondsLeft = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
    return { blocked: true, reason: "cooldown", secondsLeft };
  }

  if (history.length >= MAX_PER_HOUR) {
    const oldest = Math.min(...history);
    const secondsLeft = Math.ceil((HOUR_MS - (now - oldest)) / 1000);
    return { blocked: true, reason: "hourly", secondsLeft };
  }

  return { blocked: false };
}

function recordSend(ip: string) {
  const now = Date.now();
  const history = (ipHistory[ip] || []).filter((t) => now - t < HOUR_MS);
  history.push(now);
  ipHistory[ip] = history;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, email, message } = body;

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

  // Rate limit
  const ip = getClientIP(req);
  const limit = checkLimit(ip);

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

    recordSend(ip);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to send message. Please email us directly." },
      { status: 502 }
    );
  }
}