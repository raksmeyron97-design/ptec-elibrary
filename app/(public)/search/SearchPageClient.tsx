"use client";

import Script from "next/script";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/core/Icon";

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

const SUGGESTIONS = [
  "ភាសាខ្មែរ",
  "Mathematics",
  "Teaching methods",
  "Child development",
  "ការអប់រំ",
  "Pedagogy",
];

// Native Google CSE layout will handle styling

export default function SearchPageClient() {
  const params = useSearchParams();
  const router = useRouter();
  const q = params.get("q") ?? "";

  const [input, setInput] = useState(q);
  const [focused, setFocused] = useState(false);
  const lastRan = useRef("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setInput(q); }, [q]);

  // We rely on native Google CSE layout now, no MutationObserver needed

  // Execute the CSE search when the URL query changes
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
    setTimeout(() => run(), 300);
  }, [q]);

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const t = input.trim();
    if (!t) return;
    if (t === q) {
      window.google?.search?.cse?.element?.getElement(GNAME)?.execute(t);
    } else {
      router.push(`/search?q=${encodeURIComponent(t)}`);
    }
  };

  const clearInput = () => {
    setInput("");
    inputRef.current?.focus();
  };

  return (
    <>
      <Script
        src="https://cse.google.com/cse.js?cx=5542ee23a89194b67"
        strategy="afterInteractive"
      />
      <style>{`
        /* ── Google CSE Custom Theme for PTEC ── */
        .gsc-control-cse {
          font-family: inherit !important;
          background-color: transparent !important;
          border: none !important;
          padding: 0 !important;
        }
        /* Tabs (Refinements) */
        .gsc-tabsArea {
          border-bottom: 1px solid var(--ptec-border) !important;
          margin-bottom: 24px !important;
        }
        .gsc-tabHeader {
          color: var(--ptec-text-muted) !important;
          font-family: inherit !important;
          font-weight: 600 !important;
          font-size: 14px !important;
          padding: 10px 16px 8px !important;
          margin-right: 8px !important;
          border: none !important;
          background: transparent !important;
          border-bottom: 3px solid transparent !important;
          transition: all 0.2s ease;
        }
        .gsc-tabHeader.gsc-tabhActive {
          color: var(--ptec-brand) !important;
          border-bottom: 3px solid var(--ptec-brand) !important;
        }
        /* Result Cards */
        .gsc-webResult.gsc-result {
          background-color: var(--ptec-bg-surface) !important;
          border: 1px solid var(--ptec-border) !important;
          border-radius: 12px !important;
          padding: 20px !important;
          margin-bottom: 16px !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.02) !important;
        }
        /* Title */
        .gs-title, .gs-title * {
          color: var(--ptec-brand) !important;
          text-decoration: none !important;
          font-weight: 600 !important;
          font-size: 17px !important;
          font-family: inherit !important;
          transition: color 0.15s ease;
        }
        .gs-title:hover, .gs-title *:hover {
          text-decoration: underline !important;
        }
        /* URL */
        .gs-visibleUrl, .gs-visibleUrl-short {
          color: var(--ptec-text-muted) !important;
          font-size: 13px !important;
          margin-top: 4px !important;
          margin-bottom: 8px !important;
        }
        /* Snippet */
        .gs-snippet {
          color: var(--ptec-text-heading) !important;
          font-size: 14px !important;
          line-height: 1.6 !important;
          font-family: inherit !important;
        }
        /* Thumbnail Image */
        .gs-image {
          border-radius: 8px !important;
          border: 1px solid var(--ptec-border) !important;
          object-fit: cover !important;
        }
        /* Pagination */
        .gsc-cursor-box {
          margin-top: 32px !important;
          text-align: center !important;
        }
        .gsc-cursor-page {
          display: inline-block !important;
          color: var(--ptec-text-muted) !important;
          font-weight: 600 !important;
          font-size: 14px !important;
          padding: 8px 14px !important;
          margin: 0 4px !important;
          border-radius: 8px !important;
          transition: all 0.2s ease;
          cursor: pointer !important;
        }
        .gsc-cursor-page:hover {
          background-color: color-mix(in srgb, var(--ptec-text-muted) 10%, transparent) !important;
        }
        .gsc-cursor-page.gsc-cursor-current-page {
          background-color: var(--ptec-brand) !important;
          color: white !important;
        }
        /* Hide default branding & unneeded elements */
        .gcsc-branding { display: none !important; }
        .gsc-above-wrapper-area { border-bottom: none !important; padding: 0 !important; }
        .gsc-result-info { color: var(--ptec-text-muted) !important; font-size: 13px !important; padding-left: 4px !important; margin-bottom: 16px !important; }
      `}</style>

      {/* ── Search bar ── */}
      <form onSubmit={handleSearch} className="mb-8">
        <div
          className="flex items-center h-[54px] rounded-2xl overflow-hidden transition-all duration-150"
          style={{
            background: "var(--ptec-bg-surface)",
            border: `1.5px solid ${focused ? "var(--ptec-brand)" : "var(--ptec-border)"}`,
            boxShadow: focused ? "0 0 0 3px rgba(30,58,138,.10)" : "none",
          }}
        >
          {/* Leading icon */}
          <span className="flex-shrink-0 pl-4 pr-2 pointer-events-none">
            <Icon name="search" className="text-[18px]" style={{ color: "var(--ptec-text-muted)" } as React.CSSProperties} />
          </span>

          {/* Text input */}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Search books, authors, research…"
            autoFocus
            className="flex-1 min-w-0 h-full bg-transparent text-[15px] font-medium outline-none"
            style={{ color: "var(--ptec-text-heading)" }}
          />

          {/* Clear button */}
          {input && (
            <button
              type="button"
              onClick={clearInput}
              aria-label="Clear"
              className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full mx-1 cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/10"
              style={{ color: "var(--ptec-text-muted)" }}
            >
              <Icon name="x" className="text-[12px]" />
            </button>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={!input.trim()}
            aria-label="Search"
            className="flex-shrink-0 flex items-center gap-1.5 h-[42px] px-4 mx-1.5 rounded-xl text-[13px] font-semibold transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 active:scale-95"
            style={{ background: "var(--ptec-brand)", color: "#fff" }}
          >
            <Icon name="search" className="text-[13px]" />
            Search
          </button>
        </div>
      </form>

      {/* ── Google CSE results (always inline) ── */}
      <div className="gcse-searchresults-only" data-gname={GNAME} />

      {/* ── Empty state ── */}
      {!q && (
        <div
          className="flex flex-col items-center gap-6 py-20 text-center rounded-2xl"
          style={{
            border: "1.5px dashed var(--ptec-border)",
            background: "var(--ptec-bg-surface)",
          }}
        >
          <div
            className="flex items-center justify-center w-16 h-16 rounded-2xl"
            style={{ background: "color-mix(in srgb, var(--ptec-brand) 8%, transparent)" }}
          >
            <Icon
              name="search"
              className="text-[28px]"
              style={{ color: "var(--ptec-brand)", opacity: 0.5 } as React.CSSProperties}
            />
          </div>

          <div>
            <p className="text-[16px] font-semibold mb-1.5" style={{ color: "var(--ptec-text-heading)" }}>
              Search the PTEC Library
            </p>
            <p className="text-[13px]" style={{ color: "var(--ptec-text-muted)" }}>
              Books, research reports, and educational resources
            </p>
          </div>

          {/* Suggestion chips */}
          <div className="flex flex-wrap gap-2 justify-center px-8">
            <p className="w-full text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--ptec-text-muted)" }}>
              Try searching for
            </p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => router.push(`/search?q=${encodeURIComponent(s)}`)}
                className="px-3.5 py-1.5 rounded-full text-[12.5px] font-medium transition-all duration-150 cursor-pointer hover:opacity-80 active:scale-95"
                style={{
                  background: "color-mix(in srgb, var(--ptec-brand) 8%, transparent)",
                  color: "var(--ptec-brand)",
                  border: "1px solid color-mix(in srgb, var(--ptec-brand) 20%, transparent)",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
