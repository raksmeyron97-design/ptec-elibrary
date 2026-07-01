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

export default function SearchPageClient() {
  const params = useSearchParams();
  const router = useRouter();
  const q = params.get("q") ?? "";

  const [input, setInput] = useState(q);
  const [focused, setFocused] = useState(false);
  const lastRan = useRef("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setInput(q); }, [q]);

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
        /* ── Google CSE — PTEC Theme ── */
        .gsc-control-cse {
          font-family: inherit !important;
          background-color: transparent !important;
          border: none !important;
          padding: 0 !important;
        }
        /* Hide CSE's own search bar */
        .gsc-search-box { display: none !important; }

        /* Refinement tabs */
        .gsc-tabsArea {
          border-bottom: 1px solid var(--ptec-border) !important;
          margin-bottom: 20px !important;
        }
        .gsc-tabHeader {
          color: var(--ptec-text-muted) !important;
          font-family: inherit !important;
          font-weight: 600 !important;
          font-size: 13px !important;
          padding: 9px 14px 7px !important;
          margin-right: 4px !important;
          border: none !important;
          background: transparent !important;
          border-bottom: 2px solid transparent !important;
          transition: all 0.15s ease !important;
          cursor: pointer !important;
        }
        .gsc-tabHeader:hover { color: var(--ptec-brand) !important; }
        .gsc-tabHeader.gsc-tabhActive {
          color: var(--ptec-brand) !important;
          border-bottom: 2px solid var(--ptec-brand) !important;
        }

        /* Result info line */
        .gsc-result-info {
          color: var(--ptec-text-muted) !important;
          font-size: 12px !important;
          padding: 0 4px 16px !important;
          font-family: inherit !important;
        }

        /* Result cards */
        .gsc-webResult.gsc-result {
          background-color: var(--ptec-bg-surface) !important;
          border: 1px solid var(--ptec-border) !important;
          border-radius: 14px !important;
          padding: 18px 20px !important;
          margin-bottom: 12px !important;
          transition: border-color 0.15s ease, box-shadow 0.15s ease !important;
        }
        .gsc-webResult.gsc-result:hover {
          border-color: color-mix(in srgb, var(--ptec-brand) 30%, transparent) !important;
          box-shadow: 0 4px 16px rgba(30,58,138,0.06) !important;
        }

        /* Title */
        .gs-title, .gs-title * {
          color: var(--ptec-brand) !important;
          text-decoration: none !important;
          font-weight: 600 !important;
          font-size: 16px !important;
          font-family: inherit !important;
          line-height: 1.4 !important;
        }
        .gs-title:hover, .gs-title *:hover {
          text-decoration: underline !important;
          text-underline-offset: 2px !important;
        }

        /* URL breadcrumb */
        .gs-visibleUrl, .gs-visibleUrl-short {
          color: var(--ptec-text-muted) !important;
          font-size: 12px !important;
          margin: 3px 0 6px !important;
          font-family: inherit !important;
        }

        /* Snippet */
        .gs-snippet {
          color: var(--ptec-text-body) !important;
          font-size: 13.5px !important;
          line-height: 1.65 !important;
          font-family: inherit !important;
        }
        .gs-snippet b, .gs-snippet em {
          color: var(--ptec-text-heading) !important;
          font-weight: 600 !important;
          font-style: normal !important;
        }

        /* Thumbnail */
        .gs-image {
          border-radius: 8px !important;
          border: 1px solid var(--ptec-border) !important;
          object-fit: cover !important;
        }

        /* Pagination */
        .gsc-cursor-box {
          margin-top: 28px !important;
          text-align: center !important;
        }
        .gsc-cursor-page {
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          min-width: 36px !important;
          height: 36px !important;
          padding: 0 10px !important;
          color: var(--ptec-text-muted) !important;
          font-weight: 600 !important;
          font-size: 13px !important;
          margin: 0 3px !important;
          border-radius: 10px !important;
          border: 1px solid var(--ptec-border) !important;
          background: var(--ptec-bg-surface) !important;
          transition: all 0.15s ease !important;
          cursor: pointer !important;
          font-family: inherit !important;
        }
        .gsc-cursor-page:hover {
          border-color: color-mix(in srgb, var(--ptec-brand) 40%, transparent) !important;
          color: var(--ptec-brand) !important;
          background: color-mix(in srgb, var(--ptec-brand) 5%, transparent) !important;
        }
        .gsc-cursor-page.gsc-cursor-current-page {
          background: var(--ptec-brand) !important;
          color: #fff !important;
          border-color: var(--ptec-brand) !important;
        }

        /* Above-wrapper area */
        .gsc-above-wrapper-area {
          border-bottom: none !important;
          padding: 0 !important;
          margin-bottom: 4px !important;
        }

        /* Hide branding */
        .gcsc-branding { display: none !important; }

        /* No results */
        .gs-no-results-result .gs-snippet {
          color: var(--ptec-text-muted) !important;
          font-size: 14px !important;
          padding: 32px 0 !important;
        }
      `}</style>

      {/* ── Search bar ──────────────────────────────────────────────── */}
      <form onSubmit={handleSearch} className="mb-8">
        <div
          className="relative flex items-center h-[52px] rounded-2xl overflow-hidden transition-all duration-200"
          style={{
            background: "var(--ptec-bg-surface)",
            border: `1.5px solid ${focused ? "var(--ptec-brand)" : "var(--ptec-border)"}`,
            boxShadow: focused
              ? "0 0 0 3px color-mix(in srgb, var(--ptec-brand) 12%, transparent), 0 2px 8px rgba(30,58,138,0.06)"
              : "0 1px 4px rgba(11,21,48,0.04)",
          }}
        >
          {/* Search icon */}
          <span className="flex-shrink-0 pl-4 pr-2.5 pointer-events-none">
            <Icon
              name="search"
              className="text-[17px]"
              style={{ color: focused ? "var(--ptec-brand)" : "var(--ptec-text-muted)", transition: "color 0.15s" } as React.CSSProperties}
            />
          </span>

          {/* Input */}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Search books, authors, research…"
            autoFocus
            className="flex-1 min-w-0 h-full bg-transparent text-[15px] font-medium outline-none placeholder:font-normal"
            style={{
              color: "var(--ptec-text-heading)",
            }}
          />

          {/* Clear */}
          {input && (
            <button
              type="button"
              onClick={clearInput}
              aria-label="Clear"
              className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full mx-1 cursor-pointer transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--ptec-border)_80%,transparent)]"
              style={{ color: "var(--ptec-text-muted)" }}
            >
              <Icon name="x" className="text-[12px]" />
            </button>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!input.trim()}
            aria-label="Search"
            className="flex-shrink-0 flex items-center gap-1.5 h-[40px] px-4 mx-1.5 rounded-xl text-[13px] font-semibold transition-all duration-150 cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed hover:opacity-90 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-offset-1"
            style={{
              background: "var(--ptec-brand)",
              color: "#fff",
            }}
          >
            <Icon name="search" className="text-[12px]" />
            <span>Search</span>
          </button>
        </div>

        {/* Query tag when searching */}
        {q && (
          <div className="flex items-center gap-2 mt-3 px-1">
            <span className="text-[12px]" style={{ color: "var(--ptec-text-muted)" }}>Results for</span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-semibold"
              style={{
                background: "color-mix(in srgb, var(--ptec-brand) 8%, transparent)",
                color: "var(--ptec-brand)",
                border: "1px solid color-mix(in srgb, var(--ptec-brand) 20%, transparent)",
              }}
            >
              {q}
            </span>
          </div>
        )}
      </form>

      {/* ── Google CSE results ──────────────────────────────────────── */}
      <div className="gcse-searchresults-only" data-gname={GNAME} />

      {/* ── Empty / idle state ──────────────────────────────────────── */}
      {!q && (
        <div className="relative overflow-hidden rounded-2xl" style={{ border: "1.5px dashed var(--ptec-border)", background: "var(--ptec-bg-surface)" }}>
          {/* Subtle grid pattern */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `linear-gradient(var(--ptec-brand) 1px, transparent 1px), linear-gradient(90deg, var(--ptec-brand) 1px, transparent 1px)`,
              backgroundSize: "32px 32px",
            }}
          />

          <div className="relative flex flex-col items-center gap-7 py-16 px-6 text-center">
            {/* Icon */}
            <div
              className="flex items-center justify-center w-14 h-14 rounded-2xl shadow-sm"
              style={{
                background: "color-mix(in srgb, var(--ptec-brand) 8%, transparent)",
                border: "1px solid color-mix(in srgb, var(--ptec-brand) 15%, transparent)",
              }}
            >
              <Icon
                name="search"
                className="text-[24px]"
                style={{ color: "var(--ptec-brand)", opacity: 0.6 } as React.CSSProperties}
              />
            </div>

            {/* Copy */}
            <div className="max-w-xs">
              <p className="text-[17px] font-bold mb-2" style={{ color: "var(--ptec-text-heading)" }}>
                Search the PTEC Library
              </p>
              <p className="text-[13px] leading-relaxed" style={{ color: "var(--ptec-text-muted)" }}>
                Books, research reports, and educational resources — all indexed and searchable.
              </p>
            </div>

            {/* Suggestion chips */}
            <div className="flex flex-col items-center gap-3 w-full max-w-sm">
              <p
                className="text-[10px] font-bold uppercase tracking-[0.12em]"
                style={{ color: "var(--ptec-text-muted)" }}
              >
                Try searching for
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => router.push(`/search?q=${encodeURIComponent(s)}`)}
                    className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full text-[12.5px] font-medium transition-all duration-150 cursor-pointer active:scale-95"
                    style={{
                      background: "color-mix(in srgb, var(--ptec-brand) 7%, transparent)",
                      color: "var(--ptec-brand)",
                      border: "1px solid color-mix(in srgb, var(--ptec-brand) 20%, transparent)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "color-mix(in srgb, var(--ptec-brand) 14%, transparent)";
                      e.currentTarget.style.borderColor = "color-mix(in srgb, var(--ptec-brand) 35%, transparent)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "color-mix(in srgb, var(--ptec-brand) 7%, transparent)";
                      e.currentTarget.style.borderColor = "color-mix(in srgb, var(--ptec-brand) 20%, transparent)";
                    }}
                  >
                    <Icon name="search" className="text-[10px] opacity-60" />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
