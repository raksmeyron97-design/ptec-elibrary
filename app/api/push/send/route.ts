import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthError, requireStaff } from "@/lib/auth/requireAdmin";
import { logAdminAction } from "@/app/actions/audit";
import { logSecurityEvent } from "@/lib/security-log";
import { sendPush, type PushPayload } from "@/lib/push";
import { safeInternalUrl } from "@/lib/push-utils";

const MAX_TITLE = 120;
const MAX_BODY = 500;

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
  let query = db
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth_key, failure_count")
    .eq("enabled", true);
  if (typeof body.userId === "string" && body.userId) {
    query = query.eq("user_id", body.userId);
  }

  const { data: subs } = await query;
  if (!subs?.length) return NextResponse.json({ sent: 0 });

  const payload: PushPayload = {
    title: body.title.trim(),
    body:  body.body.trim(),
    url:   safeInternalUrl(body.url),
    icon:  typeof body.icon === "string" && body.icon.startsWith("/") ? body.icon : "/favicon/web-app-manifest-192x192.png",
    badge: "/favicon/favicon-96x96.png",
    type: "BROADCAST",
  };

  let sent = 0;
  let expired = 0;
  let failed = 0;
  const now = new Date().toISOString();

  await Promise.allSettled(
    subs.map(async (sub) => {
      const res = await sendPush(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
        payload,
      );
      if (res.ok) {
        sent++;
        await db.from("push_subscriptions").update({ last_success_at: now, failure_count: 0 }).eq("endpoint", sub.endpoint);
      } else if (res.expired) {
        expired++;
        await db
          .from("push_subscriptions")
          .update({ enabled: false, last_failure_at: now, failure_count: ((sub.failure_count as number | null) ?? 0) + 1 })
          .eq("endpoint", sub.endpoint);
      } else {
        failed++;
        await db
          .from("push_subscriptions")
          .update({ last_failure_at: now, failure_count: ((sub.failure_count as number | null) ?? 0) + 1 })
          .eq("endpoint", sub.endpoint);
      }
    }),
  );

  await logAdminAction(admin.userId, "push.broadcast", "push_subscriptions", undefined, {
    targeted_user: body.userId ?? "all",
    recipients: subs.length,
    sent,
    expired,
    failed,
  });

  return NextResponse.json({ sent, expired, failed });
}
