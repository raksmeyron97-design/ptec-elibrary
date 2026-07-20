"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { X, Megaphone, AlertTriangle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { PublicBannerAnnouncement } from "@/lib/announcements-public";

const DISMISS_KEY = "ptec.dismissedAnnouncements";

function readDismissed(): Set<string> {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function persistDismissed(ids: Set<string>) {
  try {
    // Cap stored history so this never grows unbounded across a long-lived browser profile.
    window.localStorage.setItem(DISMISS_KEY, JSON.stringify([...ids].slice(-50)));
  } catch {
    // Storage unavailable (private mode / quota) — dismissal just won't persist.
  }
}

export default function AnnouncementBanner({ announcements }: { announcements: PublicBannerAnnouncement[] }) {
  const t = useTranslations("announcementBanner");
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // One-time read from localStorage after hydration — cannot run during
    // SSR/render, so this is a legitimate external-system subscription.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(readDismissed());
    setHydrated(true);
  }, []);

  function dismiss(id: string) {
    setDismissed((prev) => {
      const next = new Set(prev).add(id);
      persistDismissed(next);
      return next;
    });
  }

  // Render nothing until hydrated to avoid a flash of a banner the reader
  // already dismissed on a previous visit.
  if (!hydrated) return null;

  const visible = announcements.filter((a) => a.dismissible === false || !dismissed.has(a.id));
  if (visible.length === 0) return null;

  return (
    <div role="region" aria-label={t("regionLabel")} className="flex flex-col gap-px">
      {visible.map((a) => {
        const isUrgent = a.priority === "urgent";
        return (
          <div
            key={a.id}
            className={`flex items-center gap-3 px-4 py-2.5 text-sm ${isUrgent ? "bg-danger text-white" : "bg-brand text-white"}`}
          >
            {isUrgent ? <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> : <Megaphone className="h-4 w-4 shrink-0" aria-hidden="true" />}
            <p className="min-w-0 flex-1 truncate">
              <span className="font-semibold">{a.title}</span>
              {a.summary && <span className="ml-1.5 hidden font-normal opacity-90 sm:inline">{a.summary}</span>}
            </p>
            {a.ctaUrl && a.ctaLabel && (
              a.ctaUrl.startsWith("/") ? (
                <Link href={a.ctaUrl} className="shrink-0 whitespace-nowrap rounded-md bg-white/15 px-2.5 py-1 text-xs font-semibold underline-offset-2 hover:bg-white/25 hover:underline">
                  {a.ctaLabel}
                </Link>
              ) : (
                <a href={a.ctaUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 whitespace-nowrap rounded-md bg-white/15 px-2.5 py-1 text-xs font-semibold underline-offset-2 hover:bg-white/25 hover:underline">
                  {a.ctaLabel}
                </a>
              )
            )}
            {a.dismissible && (
              <button
                type="button"
                onClick={() => dismiss(a.id)}
                aria-label={t("dismiss")}
                className="shrink-0 rounded-md p-1 transition hover:bg-white/15"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
