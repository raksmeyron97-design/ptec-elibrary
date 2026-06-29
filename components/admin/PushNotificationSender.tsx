"use client";

import { useState } from "react";
import { Bell, Send, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

export default function PushNotificationSender() {
  const [title, setTitle]   = useState("");
  const [body, setBody]     = useState("");
  const [url, setUrl]       = useState("/");
  const [busy, setBusy]     = useState(false);
  const [result, setResult] = useState<{ sent?: number; error?: string } | null>(null);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setBusy(true);
    setResult(null);

    try {
      const res = await fetch("/api/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), body: body.trim(), url }),
      });
      const data = await res.json();
      if (!res.ok) setResult({ error: data.error ?? "Failed to send." });
      else setResult({ sent: data.sent });
    } catch {
      setResult({ error: "Network error. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10">
          <Bell className="h-4 w-4 text-brand" />
        </div>
        <div>
          <h3 className="text-[14px] font-bold text-text-heading">Push Notification</h3>
          <p className="text-[11.5px] text-text-muted">Send to all subscribed users</p>
        </div>
      </div>

      <form onSubmit={handleSend} className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. New books added!"
            maxLength={80}
            required
            className="w-full rounded-xl border border-divider bg-paper px-3.5 py-2.5 text-[13px] text-text-body placeholder:text-text-muted/50 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            Message <span className="text-red-500">*</span>
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Brief message shown in the notification…"
            maxLength={180}
            rows={2}
            required
            className="w-full resize-none rounded-xl border border-divider bg-paper px-3.5 py-2.5 text-[13px] text-text-body placeholder:text-text-muted/50 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            Link (optional)
          </label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="/books"
            className="w-full rounded-xl border border-divider bg-paper px-3.5 py-2.5 text-[13px] text-text-body placeholder:text-text-muted/50 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </div>

        {result?.error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[12.5px] text-red-700 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" /> {result.error}
          </div>
        )}
        {result?.sent !== undefined && (
          <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2.5 text-[12.5px] text-green-700 dark:border-green-800/40 dark:bg-green-900/20 dark:text-green-400">
            <CheckCircle className="h-4 w-4 shrink-0" />
            Sent to {result.sent} device{result.sent !== 1 ? "s" : ""}.
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !title.trim() || !body.trim()}
          className="flex items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-[13px] font-bold text-white transition hover:bg-brand-hover disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {busy ? "Sending…" : "Send Push Notification"}
        </button>
      </form>
    </div>
  );
}
