"use client";

import Script from "next/script";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/core/Icon";

// Minimal type for the CSE element API
declare global {
  interface Window {
    google?: {
      search?: {
        cse?: {
          element?: {
            getElement(name: string): { execute(q: string): void } | undefined | null;
          };
        };
      };
    };
  }
}

const GNAME = "ptec-search";

export default function SearchPageClient() {
  const params = useSearchParams();
  const router = useRouter();
  const q      = params.get("q") ?? "";

  const [input, setInput] = useState(q);
  const lastRan = useRef("");

  // Sync input with URL param
  useEffect(() => { setInput(q); }, [q]);

  // When ?q= changes, programmatically execute the CSE results widget.
  // We ONLY use gcse-searchresults-only below — there is NO CSE searchbox
  // on this page, so the widget can never redirect to a different domain.
  useEffect(() => {
    if (!q || lastRan.current === q) return;

    const run = (n = 0) => {
      const el = window.google?.search?.cse?.element?.getElement(GNAME);
      if (el) {
        el.execute(q);
        lastRan.current = q;
      } else if (n < 50) {
        setTimeout(() => run(n + 1), 150);
      }
    };

    // Small delay so the script has time to initialise on first load
    setTimeout(() => run(), 300);
  }, [q]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const t = input.trim();
    if (!t) return;
    if (t === q) {
      // Same query — re-execute directly
      window.google?.search?.cse?.element?.getElement(GNAME)?.execute(t);
    } else {
      router.push(`/search?q=${encodeURIComponent(t)}`);
    }
  };

  return (
    <>
      {/* Google CSE script — loads your engine cx=5542ee23a89194b67 */}
      <Script
        src="https://cse.google.com/cse.js?cx=5542ee23a89194b67"
        strategy="afterInteractive"
      />

      {/* ── Custom search bar ──────────────────────────────────────────────── */}
      <form onSubmit={handleSearch} className="mb-8">
        <div className="relative flex items-center">
          <div className="absolute left-4 pointer-events-none">
            <Icon name="search" className="text-[20px] text-text-muted" />
          </div>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search books, authors, research…"
            autoFocus
            className="w-full h-[54px] pl-12 pr-[110px] rounded-2xl text-[15px] font-medium outline-none shadow-sm"
            style={{
              background: "var(--ptec-bg-surface)",
              border: "1.5px solid var(--ptec-border)",
              color: "var(--ptec-text-heading)",
              transition: "border-color .15s, box-shadow .15s",
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "var(--ptec-brand)";
              e.target.style.boxShadow   = "0 0 0 3px rgba(30,58,138,.10)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "var(--ptec-border)";
              e.target.style.boxShadow   = "none";
            }}
          />

          {input && (
            <button
              type="button"
              onClick={() => setInput("")}
              aria-label="Clear"
              className="absolute right-[62px] flex items-center justify-center w-7 h-7 rounded-full cursor-pointer transition-colors hover:bg-paper"
              style={{ color: "var(--ptec-text-muted)" }}
            >
              <Icon name="x" className="text-[13px]" />
            </button>
          )}

          <button
            type="submit"
            disabled={!input.trim()}
            aria-label="Search"
            className="absolute right-2 flex items-center gap-1.5 h-[40px] px-3.5 rounded-xl text-[13px] font-semibold transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 active:scale-95"
            style={{ background: "var(--ptec-brand)", color: "#fff" }}
          >
            <Icon name="search" className="text-[13px]" />
            Search
          </button>
        </div>
      </form>

      {/* ── Google CSE results — rendered inline, no redirect ─────────────── */}
      {/*
        IMPORTANT: this is gcse-searchresults-only (no searchbox).
        Results are triggered via el.execute(q) above.
        This widget never navigates away from this page.
      */}
      <div className="gcse-searchresults-only" data-gname={GNAME} />

      {/* Empty state when no query */}
      {!q && (
        <div
          className="mt-4 flex flex-col items-center gap-3 py-16 text-center rounded-2xl"
          style={{ border: "1px dashed var(--ptec-border)", background: "var(--ptec-bg-surface)" }}
        >
          <Icon
            name="search"
            className="text-[40px] opacity-15"
            style={{ color: "var(--ptec-text-muted)" } as React.CSSProperties}
          />
          <p className="text-[15px] font-medium" style={{ color: "var(--ptec-text-heading)" }}>
            Start typing to search
          </p>
          <p className="text-[13px]" style={{ color: "var(--ptec-text-muted)" }}>
            Results are powered by Google · searches across PTEC
          </p>
        </div>
      )}
    </>
  );
}
