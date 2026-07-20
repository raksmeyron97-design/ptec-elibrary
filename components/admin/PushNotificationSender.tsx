"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Bell, Send, Loader2 } from "lucide-react";
import { useToast } from "@/components/admin/kit";

export default function PushNotificationSender() {
  const t = useTranslations("adminAnnouncements.push");
  const toast = useToast();
  const [title, setTitle]   = useState("");
  const [body, setBody]     = useState("");
  const [url, setUrl]       = useState("/");
  const [busy, setBusy]     = useState(false);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setBusy(true);

    try {
      const res = await fetch("/api/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), body: body.trim(), url }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? t("failed"));
      } else {
        toast.success(t("sent", { count: data.sent ?? 0 }));
        setTitle("");
        setBody("");
        setUrl("/");
      }
    } catch {
      toast.error(t("network"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10">
          <Bell className="h-4 w-4 text-brand" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-[14px] font-bold text-text-heading">{t("heading")}</h2>
          <p className="text-[11.5px] text-text-muted">{t("subheading")}</p>
        </div>
      </div>

      <form onSubmit={handleSend} className="flex flex-col gap-3">
        <div>
          <label
            htmlFor="push-title"
            className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-muted"
          >
            {t("titleLabel")} <span className="text-danger">*</span>
          </label>
          <input
            id="push-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("placeholderTitle")}
            maxLength={80}
            required
            className="w-full rounded-xl border border-divider bg-paper px-3.5 py-2.5 text-[13px] text-text-body placeholder:text-text-muted/50 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </div>

        <div>
          <label
            htmlFor="push-body"
            className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-muted"
          >
            {t("messageLabel")} <span className="text-danger">*</span>
          </label>
          <textarea
            id="push-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("placeholderMessage")}
            maxLength={180}
            rows={2}
            required
            className="w-full resize-none rounded-xl border border-divider bg-paper px-3.5 py-2.5 text-[13px] text-text-body placeholder:text-text-muted/50 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </div>

        <div>
          <label
            htmlFor="push-url"
            className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-muted"
          >
            {t("linkLabel")}
          </label>
          <input
            id="push-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t("placeholderLink")}
            className="w-full rounded-xl border border-divider bg-paper px-3.5 py-2.5 text-[13px] text-text-body placeholder:text-text-muted/50 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </div>

        <button
          type="submit"
          disabled={busy || !title.trim() || !body.trim()}
          className="flex items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-[13px] font-bold text-white transition hover:bg-brand-hover disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="h-4 w-4" aria-hidden="true" />
          )}
          {busy ? t("sending") : t("send")}
        </button>
      </form>
    </div>
  );
}
