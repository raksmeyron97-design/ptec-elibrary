// app/(auth)/auth/signup/page.tsx
import { Suspense } from "react";
import { createServiceClient } from "@/lib/supabase/server";
import { getCollectionStats } from "@/lib/collection-stats";
import { getSiteConfig } from "@/lib/system-settings/config";
import SignupContent from "./SignupContent";

export const revalidate = 60;

// ── Server-side stats fetch ──────────────────────────────────────────────────
// Resource figure from lib/collection-stats.ts — see the note in
// app/(auth)/auth/login/page.tsx; this screen ran the same duplicate count.
async function getSignupStats() {
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
    totalBooks:     stats?.books ?? null,
    totalDownloads,
    totalViews,
    totalUsers:     usersRes.count     ?? 0,
  };
}

function formatStat(n: number | null): string | null {
  // null = the figure could not be read; render nothing rather than "0".
  if (n === null || n <= 0) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M+`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K+`;
  return `${n}+`;
}

// ── Page (server) ────────────────────────────────────────────────────────────
export default async function SignupPage() {
  const raw = await getSignupStats();
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
          <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
            <path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" className="opacity-75" />
          </svg>
          <span>កំពុងផ្ទុក...</span>
        </div>
      }
    >
      <SignupContent stats={stats} site={site} />
    </Suspense>
  );
}
