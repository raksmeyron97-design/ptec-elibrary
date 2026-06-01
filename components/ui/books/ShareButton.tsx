"use client";

import { useState, useEffect, useCallback } from "react";
import Icon from "@/components/ui/core/Icon";

interface ShareButtonProps {
  url: string;
  title?: string;
}

/* ── Brand glyphs (inline — Icon component has no brand logos) ─────────────── */
const Glyph = {
  facebook: (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
      <path d="M15.12 5.32H17V2.14A26.1 26.1 0 0 0 14.26 2c-2.72 0-4.58 1.66-4.58 4.7v2.6H6.6v3.56h3.08V22h3.68v-9.14h3.06l.46-3.56h-3.52V7.05c0-1.03.28-1.73 1.76-1.73Z" />
    </svg>
  ),
  telegram: (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
      <path d="M9.78 15.6 9.6 19.1c.36 0 .52-.16.7-.34l1.7-1.62 3.52 2.58c.64.36 1.1.17 1.27-.6l2.3-10.78c.22-1-.36-1.4-1-.16L4.4 11.7c-1 .4-.98.95-.18 1.2l3.5 1.1 8.12-5.12c.38-.25.73-.11.45.14L9.78 15.6Z" />
    </svg>
  ),
  whatsapp: (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 0 0-8.6 15.07L2 22l5.05-1.32A10 10 0 1 0 12 2Zm5.5 14.16c-.23.65-1.34 1.24-1.86 1.28-.5.04-.98.23-3.3-.69-2.78-1.1-4.55-3.95-4.69-4.13-.14-.18-1.13-1.5-1.13-2.86 0-1.36.71-2.03.97-2.31.25-.27.55-.34.73-.34l.53.01c.17 0 .4-.06.62.48.23.55.78 1.92.85 2.06.07.14.11.3.02.48-.09.18-.14.3-.27.46-.14.16-.29.36-.41.48-.14.14-.28.29-.12.56.16.27.71 1.18 1.53 1.91 1.06.94 1.95 1.23 2.22 1.37.27.14.43.11.59-.07.16-.18.68-.79.86-1.06.18-.27.36-.23.61-.14.25.09 1.6.76 1.87.9.27.14.46.2.53.32.07.11.07.65-.16 1.3Z" />
    </svg>
  ),
  twitter: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
      <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.22-6.82-5.97 6.82H1.66l7.73-8.84L1.24 2.25h6.83l4.71 6.23 5.46-6.23Zm-1.16 17.52h1.83L7.01 4.13H5.04l12.04 15.64Z" />
    </svg>
  ),
  linkedin: (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14ZM8.34 18.34V9.99H5.67v8.35h2.67ZM7 8.84a1.55 1.55 0 1 0 0-3.1 1.55 1.55 0 0 0 0 3.1Zm11.34 9.5v-4.57c0-2.45-1.31-3.59-3.06-3.59-1.41 0-2.04.78-2.39 1.32v-1.13h-2.67c.04.75 0 8.35 0 8.35h2.67v-4.66c0-.24.02-.48.09-.65.19-.48.63-.98 1.36-.98.96 0 1.34.73 1.34 1.8v4.49h2.66Z" />
    </svg>
  ),
};

type Target = {
  key: keyof typeof Glyph;
  label: string;
  bg: string;
  href: (u: string, t: string) => string;
};

const TARGETS: Target[] = [
  { key: "facebook", label: "Facebook", bg: "bg-[#1877F2]", href: (u) => `https://www.facebook.com/sharer/sharer.php?u=${u}` },
  { key: "telegram", label: "Telegram", bg: "bg-[#37AEE2]", href: (u, t) => `https://t.me/share/url?url=${u}&text=${t}` },
  { key: "whatsapp", label: "WhatsApp", bg: "bg-[#25D366]", href: (u, t) => `https://wa.me/?text=${t}%20${u}` },
  { key: "twitter", label: "Twitter", bg: "bg-[#1DA1F2]", href: (u, t) => `https://twitter.com/intent/tweet?url=${u}&text=${t}` },
  { key: "linkedin", label: "LinkedIn", bg: "bg-[#0A66C2]", href: (u) => `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
];

export default function ShareButton({ url, title = "PTEC Library" }: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  // Esc to close + lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close]);

  const openShare = (target: Target) => {
    const href = target.href(encodeURIComponent(url), encodeURIComponent(title));
    window.open(href, "_blank", "noopener,noreferrer,width=600,height=600");
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Share"
        aria-label="Share"
        className="inline-flex h-full min-h-[46px] items-center justify-center gap-2 rounded-[14px] border border-divider bg-bg-surface px-4 py-2 font-bold text-text-heading transition-colors hover:border-brand/30 hover:bg-brand/5 focus:outline-none"
      >
        <Icon name="share" className="text-[20px] text-text-muted" />
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label="Share this resource"
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-bg-surface p-6 shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
              <h2 className="font-khmer-serif text-xl font-bold text-text-heading">ចែករំលែក</h2>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-paper hover:text-text-heading"
              >
                <Icon name="x" className="text-[20px]" />
              </button>
            </div>

            {/* Brand cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {TARGETS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => openShare(t)}
                  className={`flex flex-col items-center justify-center gap-2 rounded-2xl ${t.bg} py-5 text-white transition-transform hover:-translate-y-0.5 hover:opacity-95 focus:outline-none`}
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20">
                    {Glyph[t.key]}
                  </span>
                  <span className="text-sm font-bold">{t.label}</span>
                </button>
              ))}
            </div>

            {/* Copy link */}
            <div className="mt-6">
              <p className="mb-2 text-sm font-semibold text-text-body">ឬចម្លងតំណភ្ជាប់</p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 truncate rounded-xl border border-divider bg-paper px-4 py-2.5 text-sm text-text-body outline-none"
                />
                <button
                  type="button"
                  onClick={copyLink}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-contrast transition-colors hover:bg-brand-hover"
                >
                  <Icon name={copied ? "check" : "external-link"} className="text-base" />
                  {copied ? "បានចម្លង!" : "ចម្លង"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}