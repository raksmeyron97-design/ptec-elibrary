"use client";

import { useState, useEffect } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return new Uint8Array([...raw].map((c) => c.charCodeAt(0)));
}

export default function PushSubscribeButton() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    if ("serviceWorker" in navigator && "PushManager" in window) {
      setSupported(true);
      setPermission(Notification.permission);

      navigator.serviceWorker.ready.then((reg) =>
        reg.pushManager.getSubscription().then((sub) => setSubscribed(!!sub)),
      );
    }
  }, []);

  if (!supported) return null;

  async function subscribe() {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") { setBusy(false); return; }

      const reg = await navigator.serviceWorker.ready;
      const rawKey = urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        applicationServerKey: rawKey as any,
      });

      const json = sub.toJSON();
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint, keys: json.keys }),
      });
      setSubscribed(true);
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } finally {
      setBusy(false);
    }
  }

  if (permission === "denied") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-divider bg-paper px-3.5 py-2.5 text-[12.5px] text-text-muted">
        <BellOff className="h-4 w-4" />
        Notifications blocked in browser settings
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={subscribed ? unsubscribe : subscribe}
      disabled={busy}
      className={`inline-flex items-center gap-2 rounded-[12px] border px-4 py-2.5 text-[13px] font-semibold transition-all disabled:opacity-60 ${
        subscribed
          ? "border-brand bg-brand/10 text-brand hover:bg-brand/20"
          : "border-divider bg-paper text-text-body hover:border-brand/50 hover:text-brand"
      }`}
    >
      {busy
        ? <Loader2 className="h-4 w-4 animate-spin" />
        : subscribed
          ? <Bell className="h-4 w-4" />
          : <BellOff className="h-4 w-4" />
      }
      {subscribed ? "Push notifications on" : "Enable push notifications"}
    </button>
  );
}
