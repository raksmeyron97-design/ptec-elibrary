"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import Icon from "@/components/ui/core/Icon";

const GoogleLogo = () => (
  <svg viewBox="0 0 74 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-[18px] w-auto inline-block align-middle">
    <path d="M9.24 8.19v2.46h5.88c-.18 1.38-.64 2.39-1.34 3.1-.86.86-2.2 1.8-4.54 1.8-3.62 0-6.45-2.92-6.45-6.54s2.83-6.54 6.45-6.54c1.95 0 3.38.77 4.43 1.76L15.4 2.5C13.94 1.08 11.98 0 9.24 0 4.28 0 .11 4.04.11 9s4.17 9 9.13 9c2.68 0 4.7-.88 6.28-2.52 1.62-1.62 2.13-3.91 2.13-5.75 0-.57-.04-1.1-.13-1.54H9.24z" fill="#4285F4"/>
    <path d="M25 6.19c-3.21 0-5.83 2.44-5.83 5.81 0 3.34 2.62 5.81 5.83 5.81s5.83-2.46 5.83-5.81c0-3.37-2.62-5.81-5.83-5.81zm0 9.33c-1.76 0-3.28-1.45-3.28-3.52s1.52-3.52 3.28-3.52 3.28 1.46 3.28 3.52-1.52 3.52-3.28 3.52z" fill="#EA4335"/>
    <path d="M53.58 7.49h-.09c-.57-.68-1.67-1.3-3.06-1.3C47.53 6.19 45 8.72 45 12c0 3.26 2.53 5.81 5.43 5.81 1.39 0 2.49-.62 3.06-1.32h.09v.81c0 2.22-1.19 3.41-3.1 3.41-1.56 0-2.53-1.12-2.93-2.07l-2.22.92c.64 1.54 2.33 3.43 5.15 3.43 2.99 0 5.52-1.76 5.52-6.05V6.49h-2.42v1zm-2.93 8.03c-1.76 0-3.1-1.5-3.1-3.52s1.34-3.52 3.1-3.52c1.74 0 3.1 1.52 3.1 3.54s-1.36 3.5-3.1 3.5z" fill="#4285F4"/>
    <path d="M38 6.19c-3.21 0-5.83 2.44-5.83 5.81 0 3.34 2.62 5.81 5.83 5.81s5.83-2.46 5.83-5.81c0-3.37-2.62-5.81-5.83-5.81zm0 9.33c-1.76 0-3.28-1.45-3.28-3.52s1.52-3.52 3.28-3.52 3.28 1.46 3.28 3.52-1.52 3.52-3.28 3.52z" fill="#FBBC05"/>
    <path d="M58 .24h2.51v17.57H58z" fill="#34A853"/>
    <path d="M63.93 14.85c-1.3 0-2.22-.59-2.82-1.76l7.77-3.21-.26-.66c-.48-1.29-1.96-3.68-4.97-3.68-2.99 0-5.48 2.35-5.48 5.81 0 3.26 2.46 5.81 5.76 5.81 2.66 0 4.2-1.63 4.84-2.57l-1.98-1.32c-.66.96-1.56 1.58-2.86 1.58zm-.18-7.15c1.03 0 1.91.53 2.2 1.28l-5.25 2.17c0-2.44 1.73-3.45 3.05-3.45z" fill="#EA4335"/>
  </svg>
);

/* PTEC search brand icon */
const SearchBrandIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-5 h-5">
    <circle cx="8.5" cy="8.5" r="5" stroke="white" strokeWidth="1.75" strokeLinecap="round"/>
    <path d="M13 13L17 17" stroke="white" strokeWidth="1.75" strokeLinecap="round"/>
  </svg>
);

export default function GoogleSearchModal() {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Cmd+K / Ctrl+K toggle
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((v) => !v);
      }
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Scroll-lock
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  // Focus CSE input when modal opens — retry until CSE finishes rendering
  useEffect(() => {
    if (!isOpen) return;
    let id: ReturnType<typeof setTimeout>;
    const tryFocus = (n = 0) => {
      const el = document.querySelector<HTMLInputElement>(".gsc-input");
      if (el) { el.focus(); return; }
      if (n < 20) id = setTimeout(() => tryFocus(n + 1), 80);
    };
    id = setTimeout(() => tryFocus(), 100);
    return () => clearTimeout(id);
  }, [isOpen]);

  // Click-outside to close
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (isOpen && containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [isOpen]);

  return (
    <>
      {/* Google CSE script — always loaded once, never re-initialised */}
      <Script
        src="https://cse.google.com/cse.js?cx=5542ee23a89194b67"
        strategy="afterInteractive"
      />

      {/* ── Backdrop ─────────────────────────────────────────────── */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Global Search"
        aria-hidden={!isOpen}
        className={`fixed inset-0 z-[100] flex items-start justify-center pt-[7vh] px-4 pb-8
          bg-black/60 backdrop-blur-md
          transition-opacity duration-200
          ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      >
        {/* ── Modal card ─────────────────────────────────────────── */}
        <div
          ref={containerRef}
          className={`relative w-full max-w-[700px] rounded-2xl overflow-hidden flex flex-col max-h-[88vh]
            transition-all duration-[220ms] ease-out
            ${isOpen
              ? "opacity-100 scale-100 translate-y-0"
              : "opacity-0 scale-[0.96] -translate-y-3"
            }`}
          style={{
            background: "var(--ptec-bg-surface)",
            border: "1px solid var(--ptec-border)",
            boxShadow: "0 32px 80px -12px rgba(11,21,48,0.45), 0 0 0 1px rgba(11,21,48,0.06)",
          }}
        >
          {/* Top gradient accent line */}
          <div
            className="absolute top-0 inset-x-0 h-[3px] z-10"
            style={{
              background: "linear-gradient(90deg, var(--ptec-brand) 0%, #3A5FC4 50%, var(--ptec-accent) 100%)",
            }}
          />

          {/* ── Header ───────────────────────────────────────────── */}
          <div
            className="relative flex flex-col items-center gap-1.5 px-6 pt-8 pb-5"
            style={{ background: "var(--ptec-bg-app)", borderBottom: "1px solid var(--ptec-border)" }}
          >
            {/* Close — ESC button */}
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close search"
              className="group absolute top-3.5 right-3.5 flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold tracking-wider uppercase transition-all duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand/40
                border-divider bg-bg-surface text-text-muted
                hover:border-brand/40 hover:text-brand hover:bg-brand/5"
            >
              <Icon name="x" className="text-[12px] transition-transform duration-150 group-hover:rotate-90" />
              <span className="hidden sm:inline">ESC</span>
            </button>

            {/* Brand icon badge */}
            <div
              className="flex items-center justify-center w-11 h-11 rounded-[12px] shadow-lg mb-0.5 flex-shrink-0"
              style={{
                background: "linear-gradient(135deg, var(--ptec-brand) 0%, #27499f 100%)",
                boxShadow: "0 8px 20px -6px rgba(30,58,138,0.55)",
              }}
            >
              <SearchBrandIcon />
            </div>

            {/* Title */}
            <h2
              className="text-[22px] font-bold tracking-tight leading-tight"
              style={{ color: "var(--ptec-text-heading)" }}
            >
              Global Search
            </h2>

            {/* "Powered by Google" row */}
            <div
              className="flex items-center gap-2 text-[10.5px] font-semibold tracking-[0.1em] uppercase mt-0.5"
              style={{ color: "var(--ptec-text-muted)" }}
            >
              <span
                className="inline-block h-px w-8 rounded"
                style={{ background: "var(--ptec-accent-line)", opacity: 0.55 }}
              />
              <span>Powered by</span>
              <GoogleLogo />
              <span
                className="inline-block h-px w-8 rounded"
                style={{ background: "var(--ptec-accent-line)", opacity: 0.55 }}
              />
            </div>
          </div>

          {/* ── Google CSE ───────────────────────────────────────── */}
          <div className="overflow-y-auto overscroll-contain ptec-gsc-container flex-1 px-5 py-4">
            <div className="gcse-search" />
          </div>

          {/* ── Footer ───────────────────────────────────────────── */}
          <div
            className="hidden sm:flex items-center justify-between px-5 py-2.5 text-[11px]"
            style={{
              borderTop: "1px solid var(--ptec-border)",
              background: "var(--ptec-bg-app)",
              color: "var(--ptec-text-muted)",
            }}
          >
            {/* Live indicator */}
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2 flex-shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span>
                Searching{" "}
                <span className="font-semibold" style={{ color: "var(--ptec-brand)" }}>
                  ptec.edu.kh
                </span>
              </span>
            </div>

            {/* Keyboard hints */}
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <kbd
                  className="rounded-md border px-1.5 py-0.5 font-sans font-medium text-[10px] shadow-sm"
                  style={{ borderColor: "var(--ptec-border)", background: "var(--ptec-bg-surface)" }}
                >
                  ↵
                </kbd>
                search
              </span>
              <span className="w-px h-3 rounded" style={{ background: "var(--ptec-border)" }} />
              <span className="flex items-center gap-1.5">
                <kbd
                  className="rounded-md border px-1.5 py-0.5 font-sans font-medium text-[10px] shadow-sm"
                  style={{ borderColor: "var(--ptec-border)", background: "var(--ptec-bg-surface)" }}
                >
                  ESC
                </kbd>
                close
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
