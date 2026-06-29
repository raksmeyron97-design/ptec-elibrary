import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendPush, type PushPayload } from "@/lib/push";
import { ADMIN_PANEL_ROLES } from "@/lib/types/roles";
import type { AppRole } from "@/lib/types/roles";

export async function POST(req: NextRequest) {
  // Verify admin
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await authClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!ADMIN_PANEL_ROLES.includes(profile?.role as AppRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body: PushPayload & { userId?: string } = await req.json();
  if (!body.title || !body.body) {
    return NextResponse.json({ error: "title and body are required" }, { status: 400 });
  }

  const db = createServiceClient();
  let query = db.from("push_subscriptions").select("endpoint, p256dh, auth_key");
  if (body.userId) query = query.eq("user_id", body.userId);

  const { data: subs } = await query;
  if (!subs?.length) return NextResponse.json({ sent: 0 });

  const payload: PushPayload = {
    title: body.title,
    body:  body.body,
    url:   body.url   ?? "/",
    icon:  body.icon  ?? "/icons/icon-192.png",
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

  return NextResponse.json({ sent, expired: expired.length });
}
