"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Megaphone } from "lucide-react";
import { createAnnouncement } from "@/app/actions/notifications";
import type { Notification } from "@/app/actions/notifications";
import { EmptyState, useToast } from "@/components/admin/kit";

type Props = { announcements: Notification[] };

const inputClass =
  "h-10 w-full rounded-lg border border-divider bg-bg-surface px-3 text-sm text-text-body placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand/30";
const textareaClass =
  "w-full rounded-lg border border-divider bg-bg-surface px-3 py-2 text-sm text-text-body placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none";
const labelClass = "block text-xs font-semibold text-text-muted mb-1.5";

export default function AnnouncementsClient({ announcements: initialList }: Props) {
  const t = useTranslations("adminAnnouncements");
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState(initialList);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    const res = await createAnnouncement({
      title_en: fd.get("title_en") as string,
      title_km: (fd.get("title_km") as string) || undefined,
      body_en:  (fd.get("body_en")  as string) || undefined,
      body_km:  (fd.get("body_km")  as string) || undefined,
      link:     (fd.get("link")     as string) || undefined,
    });

    setLoading(false);

    if (!res.success) {
      toast.error(res.error ?? t("toasts.failed"));
      return;
    }

    toast.success(t("toasts.sent"));
    (e.target as HTMLFormElement).reset();

    // Optimistic prepend
    setList((prev) => [
      {
        id: crypto.randomUUID(),
        type: "announcement",
        title_en: fd.get("title_en") as string,
        title_km: (fd.get("title_km") as string) || null,
        body_en:  (fd.get("body_en")  as string) || null,
        body_km:  (fd.get("body_km")  as string) || null,
        link:     (fd.get("link")     as string) || null,
        target_role: null,
        created_at: new Date().toISOString(),
        is_read: false,
      },
      ...prev,
    ]);
  }

  return (
    <div className="space-y-6">
      {/* Form */}
      <div className="rounded-xl border border-divider bg-bg-surface p-6 space-y-4">
        <h2 className="text-base font-semibold text-text-heading">{t("form.heading")}</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="ann-title-en">
                {t("form.titleEn")} <span className="text-danger">*</span>
              </label>
              <input
                id="ann-title-en"
                name="title_en"
                required
                placeholder={t("form.placeholderTitleEn")}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="ann-title-km">
                {t("form.titleKm")}
              </label>
              <input
                id="ann-title-km"
                name="title_km"
                placeholder={t("form.placeholderTitleKm")}
                className={`${inputClass} font-khmer`}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="ann-body-en">
                {t("form.bodyEn")}
              </label>
              <textarea
                id="ann-body-en"
                name="body_en"
                rows={3}
                placeholder={t("form.placeholderBodyEn")}
                className={textareaClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="ann-body-km">
                {t("form.bodyKm")}
              </label>
              <textarea
                id="ann-body-km"
                name="body_km"
                rows={3}
                placeholder={t("form.placeholderBodyKm")}
                className={`${textareaClass} font-khmer`}
              />
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="ann-link">
              {t("form.link")}
            </label>
            <input
              id="ann-link"
              name="link"
              placeholder={t("form.placeholderLink")}
              className={inputClass}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-brand px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-60 transition-colors"
          >
            {loading ? t("form.sending") : t("form.submit")}
          </button>
        </form>
      </div>

      {/* Past announcements */}
      <div className="rounded-xl border border-divider bg-bg-surface overflow-hidden">
        <div className="px-4 py-3 border-b border-divider">
          <h2 className="text-sm font-semibold text-text-heading">{t("list.heading")}</h2>
        </div>

        {list.length === 0 ? (
          <EmptyState
            icon={<Megaphone className="h-6 w-6" />}
            title={t("list.emptyTitle")}
            description={t("list.emptyDescription")}
            className="rounded-none border-0"
          />
        ) : (
          <ul className="divide-y divide-divider">
            {list.map((a) => (
              <li key={a.id} className="px-4 py-3">
                <p className="text-sm font-medium text-text-body">{a.title_en}</p>
                {a.title_km && (
                  <p className="text-xs text-text-muted font-khmer mt-0.5">{a.title_km}</p>
                )}
                {a.body_en && (
                  <p className="text-xs text-text-muted mt-1 line-clamp-2">{a.body_en}</p>
                )}
                <p className="text-[11px] text-text-muted mt-1.5">
                  {new Date(a.created_at).toLocaleString()}
                  {a.link && (
                    <span className="ml-2 text-brand">→ {a.link}</span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
