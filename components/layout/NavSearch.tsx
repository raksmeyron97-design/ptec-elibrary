"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/ui/core/Icon";

export default function NavSearch() {
  const [isMac, setIsMac] = useState(true);

  useEffect(() => {
    setIsMac(navigator.userAgent.indexOf("Mac OS X") !== -1);
  }, []);

  function openCommandPalette() {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true })
    );
  }

  return (
    <button
      onClick={openCommandPalette}
      className="relative hidden items-center rounded-full bg-paper/60 py-2.5 pl-11 pr-3 text-[14px] font-medium text-text-muted transition-all hover:bg-paper hover:text-text-heading md:flex border border-divider/50 group"
      aria-label="Search e-Library"
    >
      <Icon name="search" className="absolute left-3.5 text-[18px] text-text-muted group-hover:text-brand transition-colors" />
      <span className="mr-6">Search e-Library...</span>
      
      <kbd className="hidden sm:inline-flex items-center gap-1 rounded-md border border-divider bg-bg-surface px-1.5 py-0.5 font-sans text-[11px] font-semibold text-text-muted shadow-sm transition-colors group-hover:border-brand/30 group-hover:text-brand">
        <span className="text-[10px]">{isMac ? "⌘" : "Ctrl"}</span>K
      </kbd>
    </button>
  );
}