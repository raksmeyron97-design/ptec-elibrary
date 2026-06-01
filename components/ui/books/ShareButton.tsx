"use client";

import { useState, useRef, useEffect } from "react";
import Icon from "@/components/ui/Icon";

interface ShareButtonProps {
  url: string;
}

export default function ShareButton({ url }: ShareButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ url });
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setIsOpen(!isOpen);
        }
      }
    } else {
      setIsOpen(!isOpen);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        setIsOpen(false);
      }, 2000);
    } catch (err) {
      console.error("Failed to copy link", err);
    }
  };

  return (
    <div className="relative inline-flex" ref={popoverRef}>
      <button
        onClick={handleShare}
        className="inline-flex h-full min-h-[46px] items-center justify-center gap-2 rounded-[14px] border border-divider bg-bg-surface px-4 py-2 font-bold text-text-heading transition-colors hover:border-brand/30 hover:bg-brand/5 focus:outline-none"
        title="Share"
      >
        <Icon name="share" className="text-[20px] text-text-muted" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-10 mt-2 w-48 rounded-xl border border-divider bg-bg-surface p-2 shadow-lg sm:left-0 sm:right-auto">
          <div className="flex flex-col gap-1">
            <button
              onClick={copyLink}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-text-heading hover:bg-brand/5 hover:text-brand transition-colors"
            >
              <Icon name={copied ? "check" : "external-link"} className="text-base" />
              {copied ? "Copied!" : "Copy link"}
            </button>
            <a
              href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-text-heading hover:bg-brand/5 hover:text-brand transition-colors"
              onClick={() => setIsOpen(false)}
            >
              <Icon name="globe" className="text-base" />
              Facebook
            </a>
            <a
              href={`https://t.me/share/url?url=${encodeURIComponent(url)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-text-heading hover:bg-brand/5 hover:text-brand transition-colors"
              onClick={() => setIsOpen(false)}
            >
              <Icon name="send" className="text-base" />
              Telegram
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
