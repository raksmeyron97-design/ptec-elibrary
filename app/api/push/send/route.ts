import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthError, requireStaff } from "@/lib/auth/requireAdmin";
import { logAdminAction } from "@/app/actions/audit";
import { logSecurityEvent } from "@/lib/security-log";
import { sendPush, type PushPayload } from "@/lib/push";

const MAX_TITLE = 120;
const MAX_BODY = 500;

/** Only allow same-site relative paths or https URLs as the notification target. */
function safeUrl(url: unknown): string {
  if (typeof url !== "string" || url.length === 0 || url.length > 2000) return "/";
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  if (url.startsWith("https://")) return url;
  return "/";
}

export async function POST(req: NextRequest) {
  // requireStaff enforces role AND MFA (AAL2) — same bar as the rest of the
  // admin surface, unlike a bare profiles.role check.
  let admin;
  try {
    admin = await requireStaff();
  } catch (err) {
    if (isAdminAuthError(err)) {
      if (err.status === 403) {
        logSecurityEvent({ type: "auth_forbidden", where: "/api/push/send" });
      }
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const body: PushPayload & { userId?: string } = await req
    .json()
    .catch(() => ({}) as PushPayload);

  if (
    typeof body.title !== "string" ||
    typeof body.body !== "string" ||
    !body.title.trim() ||
    !body.body.trim()
  ) {
    return NextResponse.json({ error: "title and body are required" }, { status: 400 });
  }
  if (body.title.length > MAX_TITLE || body.body.length > MAX_BODY) {
    return NextResponse.json(
      { error: `title (max ${MAX_TITLE}) or body (max ${MAX_BODY}) too long` },
      { status: 400 },
    );
  }

  const db = admin.supabase;
  let query = db.from("push_subscriptions").select("endpoint, p256dh, auth_key");
  if (typeof body.userId === "string" && body.userId) {
    query = query.eq("user_id", body.userId);
  }

  const { data: subs } = await query;
  if (!subs?.length) return NextResponse.json({ sent: 0 });

  const payload: PushPayload = {
    title: body.title.trim(),
    body:  body.body.trim(),
    url:   safeUrl(body.url),
    icon:  typeof body.icon === "string" && body.icon.startsWith("/") ? body.icon : "/icons/icon-192.png",
  };

  let sent = 0;
  const expired: string[] = [];

  await Promise.allSettled(
    subs.map(async (sub) => {
      const res = await sendPush(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
        payload,
      );
      if (res.ok) { sent++; }
      else if (res.expired) { expired.push(sub.endpoint); }
    }),
  );

  // Clean up expired subscriptions
  if (expired.length > 0) {
    await db.from("push_subscriptions").delete().in("endpoint", expired);
  }

  await logAdminAction(admin.userId, "push_broadcast", "push_subscriptions", undefined, {
    targeted_user: body.userId ?? "all",
    recipients: subs.length,
    sent,
  });

  return NextResponse.json({ sent, expired: expired.length });
}
