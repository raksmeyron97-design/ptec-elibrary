/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Settings, Library, LogOut, ShieldCheck,
  BookOpen, Bookmark, BookMarked, CheckCircle2,
  CalendarDays, Mail, UserCircle, Hash, Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSavedBooks } from "@/app/actions/saved-books";
import { getMyReadingLists } from "@/app/actions/reading-lists";
import { getReadingStats } from "@/app/actions/reading-analytics";
import { getNewContentForSubscriptions } from "@/app/actions/subscriptions";
import DownloadHistory from "@/components/ui/pwa/DownloadHistory";
import DashboardTabs from "@/components/ui/dashboard/DashboardTabs";
import ReadingStats from "@/components/ui/dashboard/ReadingStats";
import RecommendedBooks from "@/components/ui/dashboard/RecommendedBooks";
import ExportMyLibrary from "@/components/ui/dashboard/ExportMyLibrary";
import NewForYou from "@/components/ui/dashboard/NewForYou";
import Avatar from "@/components/ui/Avatar";
import { mapRowToBook } from "@/lib/books";
import { getTranslations } from "next-intl/server";
import type { AppRole } from "@/lib/types/roles";
import { ADMIN_PANEL_ROLES } from "@/lib/types/roles";

export const dynamic = "force-dynamic";

type Profile = {
  full_name: string | null;
  email: string;
  role: AppRole;
  avatar_url: string | null;
  created_at: string;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?callbackUrl=/dashboard");

  const BOOK_FIELDS = `id, title, slug, description, cover_url, cover_color,
    department, language, pages, rating,
    authors ( name ), categories ( name ), departments ( name ), book_files ( format, file_url )`;

  const [profileResult, savedBooks, progressResult, readingLists, readingStats, subAlerts] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, email, role, avatar_url, created_at")
      .eq("id", user.id)
      .single<Profile>(),
    getSavedBooks(),
    supabase
      .from("reading_progress")
      .select(`book_id, progress_pct, last_read_at, books ( ${BOOK_FIELDS} )`)
      .eq("user_id", user.id)
      .gt("progress_pct", 0)
      .order("last_read_at", { ascending: false }),
    getMyReadingLists(),
    getReadingStats(),
    getNewContentForSubscriptions(),
  ]);

  const profile  = profileResult.data;
  const progress = progressResult.data ?? [];

  const googleAvatar = user.user_metadata?.avatar_url || user.user_metadata?.picture;
  const googleName   = user.user_metadata?.full_name  || user.user_metadata?.name;
  const avatarUrl    = profile?.avatar_url ?? googleAvatar ?? null;
  const displayName  = profile?.full_name || googleName || profile?.email || user.email || "Reader";
  const isAdmin      = ADMIN_PANEL_ROLES.includes(profile?.role as AppRole);

  const inProgress = progress.filter((p) => p.progress_pct < 100);
  const completed  = progress.filter((p) => p.progress_pct >= 100);

  const inProgressBooks: any[] = inProgress.slice(0, 8).flatMap((p) => {
    if (!p.books) return [];
    return [{ ...mapRowToBook(p.books as any), progressPct: p.progress_pct }];
  });

  const completedBooks: any[] = completed.slice(0, 6).flatMap((p) => {
    if (!p.books) return [];
    return [{ ...mapRowToBook(p.books as any), progressPct: 100 }];
  });

  const stats = [
    {
      icon: <Bookmark className="h-5 w-5" />,
      value: savedBooks.length,
      label: t("statSaved"),
      iconColor: "text-sky-300",
      iconBg: "bg-sky-500/20",
      glow: "shadow-sky-500/20",
      border: "border-sky-500/25",
      bar: "from-sky-500 to-blue-500",
      ring: "ring-sky-500/30",
    },
    {
      icon: <BookOpen className="h-5 w-5" />,
      value: inProgress.length,
      label: t("statInProgress"),
      iconColor: "text-amber-300",
      iconBg: "bg-amber-500/20",
      glow: "shadow-amber-500/20",
      border: "border-amber-500/25",
      bar: "from-amber-400 to-orange-500",
      ring: "ring-amber-500/30",
    },
    {
      icon: <CheckCircle2 className="h-5 w-5" />,
      value: completed.length,
      label: t("statCompleted"),
      iconColor: "text-emerald-300",
      iconBg: "bg-emerald-500/20",
      glow: "shadow-emerald-500/20",
      border: "border-emerald-500/25",
      bar: "from-emerald-400 to-teal-500",
      ring: "ring-emerald-500/30",
    },
    {
      icon: <BookMarked className="h-5 w-5" />,
      value: readingLists.length,
      label: "Reading Lists",
      iconColor: "text-violet-300",
      iconBg: "bg-violet-500/20",
      glow: "shadow-violet-500/20",
      border: "border-violet-500/25",
      bar: "from-violet-400 to-purple-500",
      ring: "ring-violet-500/30",
    },
  ];

  const accountFields = [
    { icon: <UserCircle   className="h-3.5 w-3.5" />, label: t("labelFullName"),    value: profile?.full_name || "—"                          },
    { icon: <Mail         className="h-3.5 w-3.5" />, label: t("labelEmail"),       value: profile?.email ?? user.email ?? "—"                },
    { icon: <ShieldCheck  className="h-3.5 w-3.5" />, label: t("labelRole"),        value: profile?.role ?? "reader"                          },
    { icon: <CalendarDays className="h-3.5 w-3.5" />, label: t("labelMemberSince"), value: profile?.created_at ? formatDate(profile.created_at) : "—" },
    { icon: <Hash         className="h-3.5 w-3.5" />, label: t("labelUserId"),      value: user.id.slice(0, 8) + "…"                          },
    { icon: <Zap          className="h-3.5 w-3.5" />, label: t("labelStatus"),      value: t("statusActive")                                  },
  ];

  return (
    <div className="min-h-screen bg-bg-body">

      {/* ── Hero Banner ─────────────────────────────────────── */}
      <div
        className="relative overflow-hidden px-4 pb-0 pt-8 sm:px-8 md:px-12"
        style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 60%, #1e40af 100%)" }}
      >
        {/* Decorative orbs */}
        <div className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, #DDB022 0%, transparent 70%)" }} />
        <div className="pointer-events-none absolute bottom-0 left-1/4 h-64 w-64 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #6366f1 0%, transparent 70%)" }} />

        <div className="relative mx-auto max-w-[1300px]">
          {/* Top row: avatar + info + actions */}
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            {/* Left: avatar + info */}
            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                <Avatar
                  url={avatarUrl}
                  name={displayName}
                  email={profile?.email ?? user.email ?? ""}
                  size={72}
                  className="ring-4 ring-white/15 shadow-xl"
                />
                <span className="absolute bottom-0.5 right-0.5 h-4 w-4 rounded-full border-2 border-blue-900 bg-emerald-400 shadow" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-khmer-serif text-[22px] font-bold text-white leading-tight truncate">
                    {displayName}
                  </h1>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                    isAdmin
                      ? "bg-amber-400/20 text-amber-200 border border-amber-400/30"
                      : "bg-white/10 text-blue-200 border border-white/15"
                  }`}>
                    {isAdmin ? "Admin" : t("reader")}
                  </span>
                </div>
                <p className="mt-0.5 text-[13px] text-blue-300 truncate">{profile?.email ?? user.email}</p>
                {profile?.created_at && (
                  <p className="mt-1 flex items-center gap-1.5 text-[12px] text-blue-400">
                    <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                    Member since {formatDate(profile.created_at)}
                  </p>
                )}
              </div>
            </div>

            {/* Right: quick actions */}
            <div className="flex flex-wrap gap-2 sm:shrink-0">
              <Link href="/books"
                className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-[13px] font-semibold text-white backdrop-blur-sm transition hover:bg-white/20 border border-white/10">
                <Library className="h-4 w-4" />
                {t("browse")}
              </Link>
              {isAdmin && (
                <Link href="/admin"
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-500/20 px-4 py-2 text-[13px] font-semibold text-amber-200 backdrop-blur-sm transition hover:bg-amber-500/30 border border-amber-400/20">
                  <ShieldCheck className="h-4 w-4" />
                  Admin
                </Link>
              )}
              <Link href="/dashboard/settings"
                className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-[13px] font-semibold text-white backdrop-blur-sm transition hover:bg-white/20 border border-white/10">
                <Settings className="h-4 w-4" />
                {t("settings")}
              </Link>
              <form action="/auth/signout" method="POST">
                <button type="submit"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-[13px] font-semibold text-blue-300 backdrop-blur-sm transition hover:border-white/30 hover:text-white">
                  <LogOut className="h-4 w-4" />
                  {t("signOut")}
                </button>
              </form>
            </div>
          </div>

          {/* Stats bar */}
          <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3 pb-6">
            {stats.map((s, i) => (
              <div key={i}
                aria-label={`${s.value} ${s.label}`}
                className={`group relative overflow-hidden rounded-2xl border ${s.border} bg-white/[0.08] backdrop-blur-md shadow-lg ring-1 ${s.ring} transition-all duration-200 hover:bg-white/[0.13] hover:scale-[1.02] cursor-default`}
              >
                {/* Top gradient bar */}
                <div className={`absolute inset-x-0 top-0 h-[2.5px] bg-gradient-to-r ${s.bar}`} />

                {/* Background glow orb */}
                <div className={`absolute -right-3 -top-3 h-16 w-16 rounded-full bg-gradient-to-br ${s.bar} opacity-[0.12] blur-xl`} />

                {/* ── Mobile: vertical (icon → number → label) ── */}
                <div className="relative flex flex-col gap-2 px-3.5 py-3.5 sm:hidden">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${s.iconBg} ${s.iconColor}`}>
                    {s.icon}
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[30px] font-bold text-white leading-none tracking-tight">{s.value}</span>
                  </div>
                  <p className="text-[11.5px] font-medium text-blue-200/75 leading-tight">{s.label}</p>
                </div>

                {/* ── Desktop: horizontal (icon | number + label) ── */}
                <div className="relative hidden sm:flex items-center gap-3 px-4 py-4">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${s.iconBg} ${s.iconColor} ring-1 ${s.ring}`}>
                    {s.icon}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[28px] font-bold text-white leading-none tracking-tight">{s.value}</p>
                    <p className="mt-1 text-[11px] font-medium text-blue-200/70 leading-tight truncate">{s.label}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── New for You (subscription alerts) ───────────────── */}
      <NewForYou alerts={subAlerts} />

      {/* ── Main content ────────────────────────────────────── */}
      <div className="mx-auto max-w-[1300px] px-4 pt-4 pb-12 sm:px-8 md:px-12">
        <div className="flex gap-6 lg:items-start">

          {/* ── Left: tabs + recommendations ── */}
          <div className="min-w-0 flex-1">
            <DashboardTabs
              inProgressBooks={inProgressBooks}
              completedBooks={completedBooks}
              savedBooks={savedBooks as any}
              readingLists={readingLists}
              browseLabel={t("browseCatalogue")}
              browseMoreLabel={t("browseMore")}
              totalInProgress={inProgress.length}
              totalCompleted={completed.length}
            />
            <RecommendedBooks />
          </div>

          {/* ── Right: sticky sidebar ── */}
          <aside className="hidden lg:block w-72 shrink-0">
            <div className="sticky top-20 space-y-4">

              {/* Reading Stats */}
              <ReadingStats stats={readingStats} />

              {/* Quick links */}
              <div className="rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm">
                <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-text-muted">Quick Links</p>
                <nav className="flex flex-col gap-1">
                  {[
                    { href: "/books",            icon: <Library className="h-4 w-4" />,     label: "Browse Library" },
                    { href: "/theses",            icon: <BookOpen className="h-4 w-4" />,    label: "Theses" },
                    { href: "/dashboard/settings",icon: <Settings className="h-4 w-4" />,   label: "Settings" },
                    ...(isAdmin ? [{ href: "/admin", icon: <ShieldCheck className="h-4 w-4" />, label: "Admin Panel" }] : []),
                  ].map((l) => (
                    <Link key={l.href} href={l.href}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium text-text-body transition hover:bg-paper hover:text-brand">
                      <span className="text-text-muted">{l.icon}</span>
                      {l.label}
                    </Link>
                  ))}
                  <ExportMyLibrary />
                </nav>
              </div>

              {/* Account info */}
              <div className="rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm">
                <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-text-muted">{t("accountInfo")}</p>
                <div className="flex flex-col gap-2.5">
                  {accountFields.map(({ icon, label, value }) => (
                    <div key={label} className="flex items-start gap-2.5">
                      <span className="mt-0.5 shrink-0 text-text-muted">{icon}</span>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted/70">{label}</p>
                        <p className="truncate text-[12.5px] font-semibold text-text-heading">{value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Download history */}
              <div className="rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm">
                <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-text-muted">Recent Downloads</p>
                <DownloadHistory />
              </div>

            </div>
          </aside>
        </div>

        {/* Mobile: account info below content */}
        <div className="mt-8 lg:hidden space-y-4">
          <div className="rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-text-muted">{t("accountInfo")}</p>
            <div className="grid grid-cols-2 gap-2.5">
              {accountFields.map(({ icon, label, value }) => (
                <div key={label} className="rounded-xl border border-divider bg-paper px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">{label}</p>
                  <p className="mt-0.5 truncate text-[12px] font-semibold text-text-heading">{value}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-text-muted">Recent Downloads</p>
            <DownloadHistory />
          </div>
        </div>
      </div>
    </div>
  );
}
