// app/auth/login/page.tsx
// LoginPage  →  async SERVER component  (fetches stats with service role, bypasses RLS)
// LoginContent → "use client" component (handles form state, auth, receives stats as props)

import { Suspense } from "react";
import { createServiceClient } from "@/lib/supabase/server";
import { getCollectionStats } from "@/lib/collection-stats";
import { getSiteConfig } from "@/lib/system-settings/config";
import LoginContent from "./LoginContent";

export const revalidate = 60;

// ── Server-side stats fetch ──────────────────────────────────────────────────
// The resource figure MUST come from lib/collection-stats.ts. This screen used
// to run its own `books where is_published` count with the service role: same
// predicate today, but a second implementation that no cache tag invalidated
// and that nothing stopped from drifting the next time the rule changed.
// Views / downloads / members are engagement metrics, not resource counts, so
// they stay local — but they now also skip the "select every row and sum in
// JS" pattern's worst property by being read the same way as before.
async function getLoginStats() {
  const supabase = createServiceClient();
  const [stats, downloadsRes, viewsRes, usersRes] = await Promise.all([
    getCollectionStats(),
    supabase.from("books").select("download_count").eq("is_published", true),
    supabase.from("books").select("view_count").eq("is_published", true),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
  ]);
  const totalDownloads = (downloadsRes.data ?? []).reduce((s, b) => s + (b.download_count ?? 0), 0);
  const totalViews     = (viewsRes.data    ?? []).reduce((s, b) => s + (b.view_count     ?? 0), 0);
  return {
    // null (stats unavailable) suppresses the figure rather than claiming 0.
    totalBooks:     stats?.books ?? null,
    totalDownloads,
    totalViews,
    totalUsers:     usersRes.count     ?? 0,
  };
}

function formatStat(n: number | null): string | null {
  // Small numbers are anti-proof ("9+ downloads" reads as "nobody uses this")
  // — suppress the stat entirely until it clears a floor worth showing. A
  // null input means the figure could not be read at all; suppress that too
  // rather than rendering a fabricated total.
  if (n === null || n < 10) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M+`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K+`;
  return `${n}+`;
}

// ── Page (server) ────────────────────────────────────────────────────────────
export default async function LoginPage() {
  const raw = await getLoginStats();
  // Published organization values for the marketing panel (this is the only
  // place the auth screens learn the institution name / website).
  const cfg = await getSiteConfig();
  const site = {
    institution: cfg.name.en,
    website: cfg.links.website,
    websiteLabel: cfg.links.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""),
  };


  const stats = {
    books:     formatStat(raw.totalBooks),
    downloads: formatStat(raw.totalDownloads),
    views:     formatStat(raw.totalViews),
    users:     formatStat(raw.totalUsers),
  };

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-paper text-text-muted font-sans">
          <svg className="h-4 w-4 animate-spin mr-2" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
            <path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" className="opacity-75" />
          </svg>
          <span>កំពុងផ្ទុក...</span>
        </div>
      }
    >
      <LoginContent stats={stats} site={site} />
    </Suspense>
  );
}