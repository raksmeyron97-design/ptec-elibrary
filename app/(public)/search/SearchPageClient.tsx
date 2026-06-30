"use client";

import Script from "next/script";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    google?: {
      search?: {
        cse?: {
          element?: {
            getElement(name: string): { execute(q: string): void } | null | undefined;
          };
        };
      };
    };
  }
}

export default function SearchPageClient() {
  const params   = useSearchParams();
  const q        = params.get("q") ?? "";
  const ranRef   = useRef(false);

  // Pre-fill from ?q= URL param on initial load
  useEffect(() => {
    if (!q || ranRef.current) return;
    const tryRun = (n = 0) => {
      const el = window.google?.search?.cse?.element?.getElement("ptec-page-search");
      if (el) {
        el.execute(q);
        ranRef.current = true;
      } else if (n < 30) {
        setTimeout(() => tryRun(n + 1), 150);
      }
    };
    setTimeout(() => tryRun(), 300);
  }, [q]);

  return (
    <>
      <Script
        src="https://cse.google.com/cse.js?cx=5542ee23a89194b67"
        strategy="afterInteractive"
      />
      <div className="ptec-gcse-page">
        {/* Google native input — gives real autocomplete ("Enhanced by Google") */}
        <div
          className="gcse-searchbox-only"
          data-gname="ptec-page-search"
          data-queryParameterName="q"
          data-enableHistory="true"
        />
        {/* Results render inline here — no overlay */}
        <div
          className="gcse-searchresults-only"
          data-gname="ptec-page-search"
        />
      </div>
    </>
  );
}
