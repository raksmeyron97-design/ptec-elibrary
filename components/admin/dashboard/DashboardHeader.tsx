import Link from "next/link";
import {
  Upload, FileText, Users, ExternalLink, BookOpen, Eye, AlertTriangle,
} from "lucide-react";

const APP_TZ = "Asia/Phnom_Penh";

function getGreeting(): string {
  const hour = parseInt(
    new Date().toLocaleString("en-US", { timeZone: APP_TZ, hour: "numeric", hour12: false }),
    10,
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const QUICK_ACTIONS = [
  { label: "Upload Book", href: "/admin/upload", icon: Upload },
  { label: "New Post", href: "/admin/posts/new", icon: FileText },
  { label: "Manage Users", href: "/admin/users", icon: Users },
] as const;

/**
 * Compact hero: one blue band with the date, a personal greeting, a
 * one-line status summary, and the actions an admin reaches for daily.
 */
export default function DashboardHeader({
  name,
  booksPublished,
  users,
  attentionCount,
  publicSiteUrl,
}: {
  name: string | null;
  booksPublished: number;
  users: number;
  attentionCount: number;
  publicSiteUrl: string;
}) {
  const todayLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TZ,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());

  const firstName = name?.trim().split(/\s+/)[0] ?? "Admin";
  const nf = (n: number) => n.toLocaleString("en-US");

  const chips = [
    { icon: BookOpen, text: `${nf(booksPublished)} books published` },
    { icon: Eye, text: `${nf(users)} registered users` },
    {
      icon: AlertTriangle,
      text: attentionCount === 0 ? "Nothing needs attention" : `${attentionCount} need${attentionCount === 1 ? "s" : ""} attention`,
      highlight: attentionCount > 0,
    },
  ];

  const actionClass =
    "flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold text-white transition-all duration-200 cursor-pointer hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DDB022]";

  return (
    <div
      className="relative overflow-hidden rounded-2xl px-5 py-5 sm:px-7"
      style={{ background: "linear-gradient(135deg, #1E3A8A 0%, #162d70 55%, #0F2160 100%)" }}
    >
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#DDB022" }}>
            {todayLabel}
          </p>
          <h2 className="text-lg font-bold leading-snug text-white sm:text-xl">
            {getGreeting()}, {firstName}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {chips.map(({ icon: Icon, text, highlight }) => (
              <span
                key={text}
                className="flex items-center gap-1.5 text-xs"
                style={{ color: highlight ? "#FBBF24" : "rgba(255,255,255,0.6)" }}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {text}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 lg:shrink-0 lg:justify-end">
          {QUICK_ACTIONS.map(({ label, href, icon: Icon }) => (
            <Link key={label} href={href} className={actionClass} style={{ background: "rgba(255,255,255,0.12)" }}>
              <Icon className="h-3.5 w-3.5 opacity-80" aria-hidden="true" />
              {label}
            </Link>
          ))}
          <a
            href={publicSiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={actionClass}
            style={{ background: "rgba(221,176,34,0.22)", border: "1px solid rgba(221,176,34,0.4)" }}
          >
            <ExternalLink className="h-3.5 w-3.5 opacity-80" aria-hidden="true" />
            View Public Site
          </a>
        </div>
      </div>
    </div>
  );
}
