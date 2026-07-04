"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";

export default function CopyLinkButton({
  url,
  className,
  compact = false,
}: {
  url: string;
  className?: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — non-fatal */
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className={
        className ??
        `inline-flex cursor-pointer items-center justify-center gap-2 rounded-[14px] border border-divider bg-bg-surface font-bold text-text-heading transition-all duration-150 hover:border-brand/30 hover:bg-brand/5 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 ${
          compact ? "px-3 py-2 text-[13px]" : "px-5 py-3 text-[15px]"
        }`
      }
    >
      {copied ? (
        <Check className={compact ? "h-4 w-4 text-emerald-600" : "h-[18px] w-[18px] text-emerald-600"} />
      ) : (
        <Link2 className={compact ? "h-4 w-4" : "h-[18px] w-[18px]"} />
      )}
      {copied ? "Copied!" : "Copy Link"}
    </button>
  );
}
