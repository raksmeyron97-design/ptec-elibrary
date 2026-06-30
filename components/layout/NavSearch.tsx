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
    <>
      {/* Mobile: icon only */}
      <button
        type="button"
        onClick={openCommandPalette}
        aria-label="Search"
        className="sm:hidden flex h-10 w-10 items-center justify-center rounded-full border border-divider bg-bg-surface shadow-sm text-text-muted transition-all duration-300 hover:border-brand/40 hover:text-brand hover:shadow-md hover:bg-brand/5 active:scale-95"
      >
        <Icon name="search" className="text-[18px]" />
      </button>

      {/* sm+: full premium search bar */}
      <button
        type="button"
        onClick={openCommandPalette}
        className="hidden sm:flex group relative h-[42px] w-[260px] lg:w-[300px] items-center justify-between rounded-full border border-divider bg-bg-surface shadow-sm pl-11 pr-2.5 text-sm text-text-muted transition-all duration-300 hover:border-brand/40 hover:ring-4 hover:ring-brand/5 hover:bg-bg-surface overflow-hidden active:scale-[0.98]"
      >
        {/* Shimmer effect on hover */}
        <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-brand/[0.04] to-transparent group-hover:translate-x-full transition-transform duration-[1500ms] ease-in-out opacity-0 group-hover:opacity-100" />
        
        <Icon 
          name="search" 
          className="absolute left-4 text-[18px] text-text-muted/70 group-hover:text-brand group-hover:scale-110 transition-all duration-300 z-10" 
        />
        
        <span className="whitespace-nowrap overflow-hidden text-ellipsis text-left flex-1 mr-2 font-medium z-10 group-hover:text-text-heading transition-colors duration-300">
          Search global...
        </span>
        
        <div className="relative z-10 flex items-center">
          <kbd className="inline-flex items-center gap-1 rounded-[6px] border border-divider bg-black/[0.03] dark:bg-white/[0.05] px-2 py-1 font-sans text-[11px] font-bold text-text-muted transition-all duration-300 group-hover:border-brand/30 group-hover:text-brand group-hover:bg-brand/10 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <span className="text-[11px] opacity-80">{isMac ? "⌘" : "Ctrl"}</span>K
          </kbd>
        </div>
      </button>
    </>
  );
}