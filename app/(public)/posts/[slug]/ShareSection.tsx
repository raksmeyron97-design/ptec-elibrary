"use client";
import { useState, useCallback, useEffect } from "react";

interface ShareSectionProps {
  postTitle: string;
}

export default function ShareSection({ postTitle }: ShareSectionProps) {
  const [copied, setCopied] = useState(false);
  const [pageUrl, setPageUrl] = useState("");

  useEffect(() => {
    setPageUrl(window.location.href);
  }, []);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      // silent fallback
    }
    setCopied(false);
    requestAnimationFrame(() => setCopied(true));
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const fbUrl = pageUrl
    ? `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`
    : "#";
  const tgUrl = pageUrl
    ? `https://t.me/share/url?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(postTitle)}`
    : "#";

  return (
    <>
      <div className="bg-blue-950 rounded-xl p-5 shadow-md">
        <h3 className="font-khmer-serif font-bold text-white text-lg mb-4">ចែករំលែកអត្ថបទ</h3>
        <div className="flex flex-col gap-2">
          <a
            href={fbUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 text-blue-100 text-sm transition-transform hover:translate-x-1"
          >
            <span className="w-[34px] h-[34px] rounded-md bg-[#1877F2] flex items-center justify-center flex-none">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff">
                <path d="M22 12a10 10 0 10-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.7-3.9 1.1 0 2.2.2 2.2.2v2.4h-1.2c-1.2 0-1.6.8-1.6 1.6V12h2.7l-.4 2.9h-2.3v7A10 10 0 0022 12z" />
              </svg>
            </span>
            Facebook
          </a>

          <a
            href={tgUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 text-blue-100 text-sm transition-transform hover:translate-x-1"
          >
            <span className="w-[34px] h-[34px] rounded-md bg-[#29A9EB] flex items-center justify-center flex-none">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff">
                <path d="M21.9 4.3l-3.3 15.6c-.2 1.1-.9 1.4-1.9.9l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6 14.2l-4.9-1.5c-1.1-.3-1.1-1 .2-1.5L20.6 2.9c.9-.3 1.6.2 1.3 1.4z" />
              </svg>
            </span>
            Telegram
          </a>

          <button
            onClick={onCopy}
            className="flex items-center gap-3 text-blue-100 text-sm transition-transform hover:translate-x-1 cursor-pointer"
          >
            <span className="w-[34px] h-[34px] rounded-md bg-white/[0.14] flex items-center justify-center flex-none">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.5 1.5" />
                <path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.5-1.5" />
              </svg>
            </span>
            ចម្លងតំណ
          </button>
        </div>
      </div>

      {/* Toast */}
      {copied && (
        <div
          className="fixed bottom-7 left-1/2 -translate-x-1/2 bg-blue-950 text-white px-6 py-3 rounded-full text-sm font-semibold shadow-lg z-50"
          style={{ animation: "ppToast 2s ease forwards" }}
        >
          បានចម្លងតំណរួចរាល់ ✓
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
