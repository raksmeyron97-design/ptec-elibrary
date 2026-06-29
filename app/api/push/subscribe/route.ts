import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

// POST  /api/push/subscribe  — save a new push subscription
// DELETE /api/push/subscribe  — remove a subscription by endpoint
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const body = await req.json();
  const { endpoint, keys } = body ?? {};

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  const db = createServiceClient();
  const { error } = await db.from("push_subscriptions").upsert({
    user_id: user?.id ?? null,
    endpoint,
    p256dh: keys.p256dh,
    auth_key: keys.auth,
  }, { onConflict: "endpoint" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json();
  const { endpoint } = body ?? {};
  if (!endpoint) return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });

  const db = createServiceClient();
  await db.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return NextResponse.json({ ok: true });
}
