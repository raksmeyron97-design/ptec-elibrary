// Public reader-facing announcement banner data. No cookies()/headers() —
// the whole public tree must stay prerenderable (see app/[locale]/(public)/layout.tsx).
// Cached under TAGS.announcementBanner; publish/pause/archive/expire call
// revalidateAnnouncementBanner() (lib/cache/revalidate.ts) to bust it.

import "server-only";

import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { TAGS } from "@/lib/cache/revalidate";

export interface PublicBannerAnnouncement {
  id: string;
  title: string;
  summary: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  priority: "normal" | "important" | "urgent";
  pinned: boolean;
  dismissible: boolean;
}

/** At most this many banners stack at once — more would be alert fatigue,
 *  not information (mirrors the composer's "pinnedHelp" copy). */
const MAX_BANNERS = 2;

async function fetchActiveBanners(): Promise<
  { id: string; title_en: string; title_km: string | null; summary_en: string | null; summary_km: string | null; cta_label_en: string | null; cta_label_km: string | null; cta_url: string | null; priority: string; pinned: boolean; dismissible: boolean }[]
> {
  const db = createServiceClient();
  const now = new Date().toISOString();

  const { data, error } = await db
    .from("announcements")
    .select("id, title_en, title_km, summary_en, summary_km, cta_label_en, cta_label_km, cta_url, priority, pinned, dismissible, expires_at")
    .eq("channel_banner", true)
    // The banner renders in a cookie-free, prerendered public layout with no
    // notion of "who is viewing" — it can only ever honestly represent an
    // "everyone" audience. A banner-enabled announcement restricted to a
    // role/individual/push-enabled audience is deliberately excluded here
    // (same limitation as the notifications bridge — see
    // lib/admin/announcements/notifications-bridge.ts) so a restricted
    // announcement can never leak to the public via this channel.
    .eq("audience_type", "all_active")
    .in("status", ["active", "partially_delivered"])
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("pinned", { ascending: false })
    .order("priority", { ascending: false })
    .order("published_at", { ascending: false })
    .limit(MAX_BANNERS);

  if (error) return [];
  return data ?? [];
}

const getCachedActiveBanners = unstable_cache(fetchActiveBanners, ["announcement-banner-active"], {
  tags: [TAGS.announcementBanner],
  revalidate: 300,
});

export async function getActiveBannerAnnouncements(locale: string): Promise<PublicBannerAnnouncement[]> {
  const rows = await getCachedActiveBanners();
  const isKm = locale === "km";

  return rows.map((r) => ({
    id: r.id,
    title: (isKm && r.title_km?.trim()) || r.title_en,
    summary: (isKm ? r.summary_km : r.summary_en) ?? (isKm ? r.summary_en : null),
    ctaLabel: (isKm ? r.cta_label_km : r.cta_label_en) ?? (isKm ? r.cta_label_en : null),
    ctaUrl: r.cta_url,
    priority: (["normal", "important", "urgent"].includes(r.priority) ? r.priority : "normal") as PublicBannerAnnouncement["priority"],
    pinned: r.pinned,
    dismissible: r.dismissible,
  }));
}
