"use server";

import { revalidateLocalizedPath as revalidatePath } from "@/lib/cache/revalidate";
import { createClient, createServiceClient } from "@/lib/supabase/server";

// 'department'/'category' filter books; 'publications' is a content-type-level
// channel (filter_value 'all') for new journal articles (migration 0054).
export type SubscriptionFilterType = "department" | "category" | "publications";

export type Subscription = {
  id:            string;
  filter_type:   SubscriptionFilterType;
  filter_value:  string;
  display_label: string | null;
  created_at:    string;
};

export type NewContentAlert = {
  book_id:       string;
  title:         string;
  slug:          string;
  cover_url:     string | null;
  created_at:    string;
  matched_label: string;
  /** Detail-page link; defaults to /books/[slug] when absent. */
  url?:          string;
};

export async function getMySubscriptions(): Promise<Subscription[]> {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return [];

  const db = createServiceClient();
  const { data } = await db
    .from("content_subscriptions")
    .select("id, filter_type, filter_value, display_label, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (data ?? []) as Subscription[];
}

export async function toggleSubscription(
  filterType:   SubscriptionFilterType,
  filterValue:  string,
  displayLabel: string,
): Promise<{ subscribed: boolean }> {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const db = createServiceClient();
  const { data: existing } = await db
    .from("content_subscriptions")
    .select("id")
    .eq("user_id", user.id)
    .eq("filter_type", filterType)
    .eq("filter_value", filterValue)
    .maybeSingle();

  if (existing) {
    await db.from("content_subscriptions").delete().eq("id", existing.id);
    revalidatePath("/dashboard");
    return { subscribed: false };
  }

  await db.from("content_subscriptions").insert({
    user_id:       user.id,
    filter_type:   filterType,
    filter_value:  filterValue,
    display_label: displayLabel,
  });
  revalidatePath("/dashboard");
  return { subscribed: true };
}

export async function isSubscribed(
  filterType:  SubscriptionFilterType,
  filterValue: string,
): Promise<boolean> {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return false;

  const db = createServiceClient();
  const { data } = await db
    .from("content_subscriptions")
    .select("id")
    .eq("user_id", user.id)
    .eq("filter_type", filterType)
    .eq("filter_value", filterValue)
    .maybeSingle();

  return !!data;
}

export async function getNewContentForSubscriptions(): Promise<NewContentAlert[]> {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return [];

  const db = createServiceClient();
  const subs = await getMySubscriptions();
  if (subs.length === 0) return [];

  const since = new Date();
  since.setDate(since.getDate() - 30);
  const sinceISO = since.toISOString();

  const seen = new Set<string>();
  const alerts: NewContentAlert[] = [];

  for (const sub of subs) {
    if (sub.filter_type === "department") {
      const { data } = await db
        .from("books")
        .select("id, title, slug, cover_url, created_at")
        .eq("is_published", true)
        .eq("department", sub.filter_value)
        .gte("created_at", sinceISO)
        .order("created_at", { ascending: false })
        .limit(3);

      for (const b of data ?? []) {
        if (seen.has(b.id)) continue;
        seen.add(b.id);
        alerts.push({
          book_id:       b.id,
          title:         b.title,
          slug:          b.slug,
          cover_url:     b.cover_url,
          created_at:    b.created_at,
          matched_label: sub.display_label ?? sub.filter_value,
        });
      }
    } else if (sub.filter_type === "category") {
      // Look up category_id by name, then query books
      const { data: cat } = await db
        .from("categories")
        .select("id")
        .eq("name", sub.filter_value)
        .maybeSingle();

      if (!cat) continue;

      const { data } = await db
        .from("books")
        .select("id, title, slug, cover_url, created_at")
        .eq("is_published", true)
        .eq("category_id", cat.id)
        .gte("created_at", sinceISO)
        .order("created_at", { ascending: false })
        .limit(3);

      for (const b of data ?? []) {
        if (seen.has(b.id)) continue;
        seen.add(b.id);
        alerts.push({
          book_id:       b.id,
          title:         b.title,
          slug:          b.slug,
          cover_url:     b.cover_url,
          created_at:    b.created_at,
          matched_label: sub.display_label ?? sub.filter_value,
        });
      }
    } else if (sub.filter_type === "publications") {
      const { data } = await db
        .from("publications")
        .select("id, title, slug, cover_url, published_at")
        .eq("is_published", true)
        .gte("published_at", sinceISO)
        .order("published_at", { ascending: false })
        .limit(3);

      for (const p of data ?? []) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        alerts.push({
          book_id:       p.id,
          title:         p.title,
          slug:          p.slug,
          cover_url:     p.cover_url,
          created_at:    p.published_at,
          matched_label: sub.display_label ?? "Publications",
          url:           `/publications/${p.slug}`,
        });
      }
    }

    if (alerts.length >= 6) break;
  }

  return alerts;
}
