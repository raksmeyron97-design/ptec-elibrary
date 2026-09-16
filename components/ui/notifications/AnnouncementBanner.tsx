"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { X, Megaphone, AlertTriangle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { ANNOUNCEMENT_ID_ATTR, DISMISS_STORAGE_KEY as DISMISS_KEY } from "@/lib/announcements/dismiss";
import type { PublicBannerAnnouncement } from "@/lib/announcements-public";

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

  // Every announcement is rendered, on the server and on the client alike, and
  // a dismissed one is HIDDEN rather than absent. Returning null until hydrated
  // is what used to cost a layout shift on every public page: the document grew
  // by the banner's height about a second after load, and a control pressed in
  // that window took its pointerdown and its mouseup on two different elements,
  // so no click was produced at all.
  //
  // The flash that guarded against is handled earlier instead, by
  // AnnouncementDismissScript — so the markup the server sends and the markup
  // the client hydrates are identical, and nothing moves.
  const isHidden = (a: PublicBannerAnnouncement) => a.dismissible !== false && dismissed.has(a.id);
  // Only ever reached after hydration: before it, `dismissed` is empty. The
  // rows are already display:none by then, so dropping the empty landmark
  // moves nothing.
  if (hydrated && announcements.every(isHidden)) return null;

  return (
    <div role="region" aria-label={t("regionLabel")} className="flex flex-col gap-px">
      {announcements.map((a) => {
        const isUrgent = a.priority === "urgent";
        return (
          <div
            key={a.id}
            {...{ [ANNOUNCEMENT_ID_ATTR]: a.id }}
            hidden={isHidden(a)}
            className={`flex items-center gap-3 px-4 py-2.5 text-sm ${isUrgent ? "bg-danger text-danger-contrast" : "bg-brand text-brand-contrast"}`}
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
