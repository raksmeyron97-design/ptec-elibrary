import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { pushJson, requirePushUser } from "@/app/api/push/_utils";

export async function GET(req: NextRequest) {
  const auth = await requirePushUser();
  if (auth instanceof NextResponse) return auth;

  const endpoint = req.nextUrl.searchParams.get("endpoint")?.trim() ?? "";
  const db = createServiceClient();

  let endpointSubscribed = false;
  if (endpoint) {
    const { data } = await db
      .from("push_subscriptions")
      .select("id, enabled")
      .eq("user_id", auth.user.id)
      .eq("endpoint", endpoint)
      .eq("enabled", true)
      .maybeSingle();
    endpointSubscribed = !!data;
  }

  const { count } = await db
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", auth.user.id)
    .eq("enabled", true);

  return pushJson({
    ok: true,
    endpointSubscribed,
    activeSubscriptions: count ?? 0,
    vapidPublicKeyConfigured: !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  });
}
