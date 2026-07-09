"use client";

import { useEffect, useRef, useState } from "react";
import { Monitor, Smartphone, X } from "lucide-react";
import Markdown from "@/app/[locale]/(public)/posts/[slug]/Markdown";
import { CATEGORY_BADGE_STYLES } from "@/lib/admin/posts-shared";

type Viewport = "desktop" | "mobile";

export default function PostPreviewModal({
  title,
  category,
  tags,
  excerpt,
  content,
  coverUrl,
  authorName,
  dateLabel,
  onClose,
}: {
  title: string;
  category: string;
  tags: string[];
  excerpt: string;
  content: string;
  coverUrl: string | null;
  authorName: string;
  dateLabel: string;
  onClose: () => void;
}) {
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const headingId = "post-preview-heading";
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 0);

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab") return;
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), a[href]",
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(focusTimer);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-bg-surface shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-divider px-5 py-3">
          <h2 id={headingId} className="text-sm font-bold text-text-heading">Post preview</h2>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-divider bg-paper p-0.5">
              <button
                type="button"
                onClick={() => setViewport("desktop")}
                aria-pressed={viewport === "desktop"}
                aria-label="Desktop preview"
                title="Desktop preview"
                className={`flex h-8 w-8 items-center justify-center rounded-md transition ${viewport === "desktop" ? "bg-brand text-white" : "text-text-muted hover:text-text-body"}`}
              >
                <Monitor className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewport("mobile")}
                aria-pressed={viewport === "mobile"}
                aria-label="Mobile preview"
                title="Mobile preview"
                className={`flex h-8 w-8 items-center justify-center rounded-md transition ${viewport === "mobile" ? "bg-brand text-white" : "text-text-muted hover:text-text-body"}`}
              >
                <Smartphone className="h-4 w-4" />
              </button>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close preview"
              className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition hover:bg-paper hover:text-text-heading"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto bg-paper p-4 sm:p-6">
          <div
            className={`mx-auto overflow-hidden rounded-xl bg-bg-surface shadow-sm transition-all ${viewport === "mobile" ? "max-w-[390px]" : "max-w-full"}`}
          >
            {coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverUrl} alt="" className="h-48 w-full object-cover" />
            )}
            <div className="p-5 sm:p-8">
              <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${CATEGORY_BADGE_STYLES[category] ?? CATEGORY_BADGE_STYLES.Other}`}>
                {category}
              </span>
              <h1 className="mt-3 text-2xl font-bold leading-relaxed text-text-heading">{title || "Untitled post"}</h1>
              <p className="mt-2 text-sm text-text-muted">{authorName} · {dateLabel}</p>
              {excerpt && <p className="mt-4 text-base leading-relaxed text-text-body">{excerpt}</p>}
              <div className="prose-content mt-6">
                {content.trim() ? <Markdown content={content} /> : (
                  <p className="text-sm text-text-muted">Nothing to preview yet.</p>
                )}
              </div>
              {tags.length > 0 && (
                <div className="mt-8 flex flex-wrap gap-2 border-t border-divider pt-5">
                  {tags.map((tag) => (
                    <span key={tag} className="rounded-full border border-divider bg-paper px-3 py-1 text-xs text-text-muted">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
