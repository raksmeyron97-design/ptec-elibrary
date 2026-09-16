"use client";

// components/ui/pwa/ConnectivityBanner.tsx
// Says so when the connection drops, instead of letting the reader's next tap
// fail silently on a flaky campus network. While offline: "You're offline —
// saved pages and downloaded books still open", with a link to the
// downloaded books (/offline-books, which works with the radio off). When the
// connection returns: "Back online" for a few seconds, then it goes.
//
// The state is the browser's own (navigator.onLine + the online/offline
// events) through useSyncExternalStore, so the server render — and the first
// client render — is "online" and draws nothing; there is no flash of a
// banner on a normal load. `navigator.onLine === false` is reliable ("no
// network at all"); `true` only means a network exists, which is why this
// never claims more than "offline" and says nothing about slow connections.
//
// Placement: fixed above the assistant's floating button, which is itself
// above the phone tab bar (var(--ptec-mobile-nav-clearance)), so it covers
// neither. Motion is opacity + transform, 200 ms, none under reduced motion.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { WifiOff, Wifi } from "lucide-react";
import { Link } from "@/i18n/navigation";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

const BACK_ONLINE_MS = 3500;

export default function ConnectivityBanner({
  offlineText,
  onlineText,
  actionLabel,
}: {
  offlineText: string;
  onlineText: string;
  actionLabel: string;
}) {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  // "Back online" answers the browser's `online` event, which fires only on a
  // real offline → online transition — so a page that loads online never
  // shows it. Set from the event, never from render or an effect body.
  const [showBack, setShowBack] = useState(false);
  const wasOffline = useRef(false);
  useEffect(() => {
    let timer: number | undefined;
    // A page that STARTS offline gets an `online` event as soon as the
    // connection is there — but also, sometimes, one that merely reflects the
    // browser settling its own network state. "Back online" is only true if
    // this page saw the connection go away first.
    if (!navigator.onLine) wasOffline.current = true;
    const onOnline = () => {
      if (!wasOffline.current) return;
      wasOffline.current = false;
      window.clearTimeout(timer);
      setShowBack(true);
      timer = window.setTimeout(() => setShowBack(false), BACK_ONLINE_MS);
    };
    const onOffline = () => {
      wasOffline.current = true;
      window.clearTimeout(timer);
      setShowBack(false);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const visible = !online || showBack;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 bottom-[calc(var(--ptec-mobile-nav-clearance)+4.75rem)] z-[90] mx-auto flex max-w-md justify-center print:hidden lg:bottom-6"
    >
      <div
        className={`pointer-events-auto flex min-h-11 w-full items-center gap-3 rounded-2xl px-4 py-2 text-[14px] leading-snug shadow-lg transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none ${
          online ? "border border-success-line bg-success-soft text-success-text" : "bg-[var(--ptec-plate)] text-white"
        } ${
          visible
            ? "visible translate-y-0 opacity-100"
            : // `invisible`, not opacity alone: a transparent box at the foot of
              // the page is still hit-tested, and this one sits exactly where
              // the footer's own links are (e2e/footer-mobile.spec.ts catches it).
              "invisible pointer-events-none translate-y-2 opacity-0"
        }`}
        aria-hidden={!visible}
      >
        {online ? (
          <Wifi className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
        ) : (
          <WifiOff className="h-[18px] w-[18px] shrink-0 text-gold-200" aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1">{online ? onlineText : offlineText}</span>
        {!online && (
          <Link
            href="/offline-books"
            className="shrink-0 rounded-lg px-2 py-1.5 text-[13px] font-semibold text-gold-200 underline underline-offset-4"
          >
            {actionLabel}
          </Link>
        )}
      </div>
    </div>
  );
}
