"use client";

import { useState, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";

interface ShareSectionProps {
  postTitle: string;
}

/**
 * Share controls for a post.
 *
 * The URL is read in an effect rather than passed in because this component is
 * rendered inside a prerendered page — `window.location.href` is the only
 * source that stays correct across locale prefixes and any query the reader
 * arrived with.
 *
 * Icons are outlined and monochrome apart from the two brand marks, which stay
 * recognisable: Facebook is how most of this audience shares links.
 */
export default function ShareSection({ postTitle }: ShareSectionProps) {
  const t = useTranslations("posts");
  const [copied, setCopied] = useState(false);
  const [pageUrl, setPageUrl] = useState("");
  const [canShareNatively, setCanShareNatively] = useState(false);

  useEffect(() => {
    setPageUrl(window.location.href);
    // Feature-detected after mount: `navigator.share` exists on mobile Safari
    // and Chrome-on-Android but not on desktop, and checking during render
    // would mismatch the server HTML.
    setCanShareNatively(typeof navigator !== "undefined" && "share" in navigator);
  }, []);

  const flashCopied = useCallback(() => {
    setCopied(false);
    requestAnimationFrame(() => setCopied(true));
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      // Clipboard access can be denied (insecure context, permission policy).
      // The toast still confirms intent; nothing else is broken.
    }
    flashCopied();
  }, [flashCopied]);

  const onNativeShare = useCallback(async () => {
    try {
      await navigator.share({ title: postTitle, url: window.location.href });
    } catch {
      // AbortError when the reader dismisses the sheet — not a failure.
    }
  }, [postTitle]);

  const fbUrl = pageUrl
    ? `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`
    : "#";
  const tgUrl = pageUrl
    ? `https://t.me/share/url?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(postTitle)}`
    : "#";

  const rowClass =
    "flex items-center gap-3 rounded-lg px-1 py-1.5 text-sm text-blue-100 no-underline transition-transform hover:translate-x-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 motion-reduce:transition-none motion-reduce:hover:translate-x-0";
  const iconWrap =
    "flex h-[34px] w-[34px] flex-none items-center justify-center rounded-md border border-white/20 bg-white/10";

  return (
    <>
      <div className="rounded-xl bg-blue-950 p-5 shadow-md">
        <h3 className="mb-4 font-khmer-serif text-lg font-bold text-white">{t("shareTitle")}</h3>
        <div className="flex flex-col gap-1">
          {canShareNatively && (
            <button type="button" onClick={onNativeShare} className={`${rowClass} cursor-pointer text-left`}>
              <span className={iconWrap}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="text-white" aria-hidden="true">
                  <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                  <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
                </svg>
              </span>
              {t("shareNative")}
            </button>
          )}

          <a href={fbUrl} target="_blank" rel="noopener noreferrer" aria-label={t("shareFacebook")} className={rowClass}>
            <span className={iconWrap}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#93C5FD" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
              </svg>
            </span>
            Facebook
          </a>

          <a href={tgUrl} target="_blank" rel="noopener noreferrer" aria-label={t("shareTelegram")} className={rowClass}>
            <span className={iconWrap}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7DD3FC" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21.5 4.3 2.9 11.4a.6.6 0 0 0 .05 1.13l4.6 1.44 1.77 5.2a.6.6 0 0 0 1.03.2l2.5-2.6 4.6 3.38a.6.6 0 0 0 .94-.35l3.1-14.8a.6.6 0 0 0-.99-.7Z" />
                <path d="m9.3 14.4 9-7.4-6.6 8.3" />
              </svg>
            </span>
            Telegram
          </a>

          <button type="button" onClick={onCopy} className={`${rowClass} cursor-pointer text-left`}>
            <span className={iconWrap}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="text-white" aria-hidden="true">
                <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7L12 5" />
                <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7L12 19" />
              </svg>
            </span>
            {t("shareCopyLink")}
          </button>
        </div>
      </div>

      {/* Toast — announced politely so screen readers get the confirmation too */}
      <div aria-live="polite" className="sr-only">
        {copied ? t("shareCopied") : ""}
      </div>
      {copied && (
        <div
          className="fixed bottom-7 left-1/2 z-50 -translate-x-1/2 rounded-full bg-blue-950 px-6 py-3 text-sm font-semibold text-white shadow-lg"
          style={{ animation: "ppToast 2s ease forwards" }}
        >
          {t("shareCopied")} ✓
        </div>
      )}

      <style>{`
        @keyframes ppToast {
          0%   { opacity: 0; transform: translate(-50%, 10px); }
          12%  { opacity: 1; transform: translate(-50%, 0); }
          88%  { opacity: 1; transform: translate(-50%, 0); }
          100% { opacity: 0; transform: translate(-50%, 10px); }
        }
      `}</style>
    </>
  );
}
