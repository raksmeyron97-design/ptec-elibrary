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
      className="relative hidden md:flex items-center justify-between w-48 lg:w-64 rounded-full bg-paper/80 py-2.5 pl-11 pr-2.5 text-[13px] font-medium text-text-muted transition-all hover:bg-bg-surface hover:text-text-heading border border-divider/60 hover:border-brand/30 hover:shadow-sm group"
      aria-label="Search e-Library"
    >
      <Icon name="search" className="absolute left-3.5 text-[18px] text-text-muted group-hover:text-brand transition-colors" />
      <span className="whitespace-nowrap overflow-hidden text-ellipsis text-left flex-1 mr-2">
        Search e-Library...
      </span>
      
      <kbd className="hidden sm:inline-flex items-center gap-1 rounded-[4px] border border-divider bg-bg-surface px-1.5 py-1 font-sans text-[10px] font-bold text-text-muted transition-colors group-hover:border-brand/30 group-hover:text-brand group-hover:bg-brand/5 shadow-sm">
        <span className="text-[10px]">{isMac ? "⌘" : "Ctrl"}</span>K
      </kbd>
    </button>
  );
}