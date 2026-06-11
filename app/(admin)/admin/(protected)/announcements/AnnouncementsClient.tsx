"use client";

import { useState } from "react";
import { createAnnouncement } from "@/app/actions/notifications";
import type { Notification } from "@/app/actions/notifications";

type Props = { announcements: Notification[] };

export default function AnnouncementsClient({ announcements: initialList }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [list, setList] = useState(initialList);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
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
      setError(res.error ?? "Failed to send announcement.");
      return;
    }

    setSuccess(true);
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
        <h2 className="text-base font-semibold text-text-heading">New Announcement</h2>

        {error && (
          <p className="rounded-lg bg-danger/10 px-4 py-2.5 text-sm text-danger">{error}</p>
        )}
        {success && (
          <p className="rounded-lg bg-success/10 px-4 py-2.5 text-sm text-success">
            Announcement sent to all users.
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1.5">
                Title (English) <span className="text-danger">*</span>
              </label>
              <input
                name="title_en"
                required
                placeholder="e.g. Library closed on 1 January"
                className="h-10 w-full rounded-lg border border-divider bg-bg-surface px-3 text-sm text-text-body placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1.5">
                Title (Khmer)
              </label>
              <input
                name="title_km"
                placeholder="ចំណងជើងជាភាសាខ្មែរ"
                className="h-10 w-full rounded-lg border border-divider bg-bg-surface px-3 text-sm text-text-body placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand/30 font-khmer"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1.5">
                Body (English)
              </label>
              <textarea
                name="body_en"
                rows={3}
                placeholder="Optional description..."
                className="w-full rounded-lg border border-divider bg-bg-surface px-3 py-2 text-sm text-text-body placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1.5">
                Body (Khmer)
              </label>
              <textarea
                name="body_km"
                rows={3}
                placeholder="សរសេរបន្ថែម..."
                className="w-full rounded-lg border border-divider bg-bg-surface px-3 py-2 text-sm text-text-body placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none font-khmer"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1.5">
              Link (optional)
            </label>
            <input
              name="link"
              placeholder="/books or /research"
              className="h-10 w-full rounded-lg border border-divider bg-bg-surface px-3 text-sm text-text-body placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-brand px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-60 transition-colors"
          >
            {loading ? "Sending…" : "Send to All Users"}
          </button>
        </form>
      </div>

      {/* Past announcements */}
      <div className="rounded-xl border border-divider bg-bg-surface overflow-hidden">
        <div className="px-4 py-3 border-b border-divider">
          <span className="text-sm font-semibold text-text-heading">Recent Announcements</span>
        </div>

        {list.length === 0 ? (
          <p className="px-4 py-8 text-sm text-text-muted text-center">No announcements yet.</p>
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
