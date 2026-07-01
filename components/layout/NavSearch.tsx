"use client";

import Link from "next/link";

const GoogleColoredSearch = () => (
  <svg
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="h-[18px] w-[18px] flex-shrink-0 transition-transform duration-300 ease-out group-hover:scale-110 group-hover:rotate-6 group-active:scale-90 group-active:rotate-0 motion-reduce:transition-none motion-reduce:transform-none"
  >
    <circle cx="8.5" cy="8.5" r="5" stroke="#4285F4" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M13 13L17 17" stroke="#EA4335" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

const GoogleWordmark = () => (
  <svg viewBox="0 0 74 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-[13px] w-auto flex-shrink-0">
    <path d="M9.24 8.19v2.46h5.88c-.18 1.38-.64 2.39-1.34 3.1-.86.86-2.2 1.8-4.54 1.8-3.62 0-6.45-2.92-6.45-6.54s2.83-6.54 6.45-6.54c1.95 0 3.38.77 4.43 1.76L15.4 2.5C13.94 1.08 11.98 0 9.24 0 4.28 0 .11 4.04.11 9s4.17 9 9.13 9c2.68 0 4.7-.88 6.28-2.52 1.62-1.62 2.13-3.91 2.13-5.75 0-.57-.04-1.1-.13-1.54H9.24z" fill="#4285F4"/>
    <path d="M25 6.19c-3.21 0-5.83 2.44-5.83 5.81 0 3.34 2.62 5.81 5.83 5.81s5.83-2.46 5.83-5.81c0-3.37-2.62-5.81-5.83-5.81zm0 9.33c-1.76 0-3.28-1.45-3.28-3.52s1.52-3.52 3.28-3.52 3.28 1.46 3.28 3.52-1.52 3.52-3.28 3.52z" fill="#EA4335"/>
    <path d="M53.58 7.49h-.09c-.57-.68-1.67-1.3-3.06-1.3C47.53 6.19 45 8.72 45 12c0 3.26 2.53 5.81 5.43 5.81 1.39 0 2.49-.62 3.06-1.32h.09v.81c0 2.22-1.19 3.41-3.1 3.41-1.56 0-2.53-1.12-2.93-2.07l-2.22.92c.64 1.54 2.33 3.43 5.15 3.43 2.99 0 5.52-1.76 5.52-6.05V6.49h-2.42v1zm-2.93 8.03c-1.76 0-3.1-1.5-3.1-3.52s1.34-3.52 3.1-3.52c1.74 0 3.1 1.52 3.1 3.54s-1.36 3.5-3.1 3.5z" fill="#4285F4"/>
    <path d="M38 6.19c-3.21 0-5.83 2.44-5.83 5.81 0 3.34 2.62 5.81 5.83 5.81s5.83-2.46 5.83-5.81c0-3.37-2.62-5.81-5.83-5.81zm0 9.33c-1.76 0-3.28-1.45-3.28-3.52s1.52-3.52 3.28-3.52 3.28 1.46 3.28 3.52-1.52 3.52-3.28 3.52z" fill="#FBBC05"/>
    <path d="M58 .24h2.51v17.57H58z" fill="#34A853"/>
    <path d="M63.93 14.85c-1.3 0-2.22-.59-2.82-1.76l7.77-3.21-.26-.66c-.48-1.29-1.96-3.68-4.97-3.68-2.99 0-5.48 2.35-5.48 5.81 0 3.26 2.46 5.81 5.76 5.81 2.66 0 4.2-1.63 4.84-2.57l-1.98-1.32c-.66.96-1.56 1.58-2.86 1.58zm-.18-7.15c1.03 0 1.91.53 2.2 1.28l-5.25 2.17c0-2.44 1.73-3.45 3.05-3.45z" fill="#EA4335"/>
  </svg>
);

export default function NavSearch() {
  return (
    <>
      {/* Mobile: icon only */}
      <Link
        href="/search"
        aria-label="Search"
        className="group sm:hidden relative flex h-10 w-10 items-center justify-center rounded-full border border-divider bg-bg-surface shadow-sm text-text-muted transition-all duration-300 ease-out hover:border-brand/30 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-app motion-reduce:transition-none"
      >
        {/* Glow: pre-rendered shadow, faded in/out via opacity only (compositor, no repaint) */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 rounded-full opacity-0 shadow-[0_4px_16px_rgba(30,58,138,0.12)] transition-opacity duration-300 ease-out group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
        />
        <GoogleColoredSearch />
      </Link>

      {/* sm+: Google-style search button — expands on hover/focus to state its purpose */}
      <Link
        href="/search"
        aria-label="Search with Google"
        className="group hidden sm:flex relative items-center h-10 rounded-full border border-divider bg-bg-surface shadow-sm overflow-hidden transition-all duration-300 ease-out hover:border-brand/30 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-app motion-reduce:transition-none"
        style={{ minWidth: 0 }}
      >
        {/* Glow: pre-rendered shadow, faded in/out via opacity only (compositor, no repaint) */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 rounded-full opacity-0 shadow-[0_4px_16px_rgba(30,58,138,0.12)] transition-opacity duration-300 ease-out group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
        />

        {/* Left: search icon */}
        <span className="flex items-center justify-center h-full pl-3.5 pr-2.5">
          <GoogleColoredSearch />
        </span>

        {/* Reveal: purpose text, only takes up space once expanded */}
        <span className="max-w-0 overflow-hidden transition-[max-width] duration-300 ease-out group-hover:max-w-[160px] group-focus-visible:max-w-[160px] motion-reduce:transition-none">
          <span className="whitespace-nowrap pr-3 text-sm text-text-muted">
            Search the library
          </span>
        </span>

        {/* Divider */}
        <span className="w-px h-5 bg-divider flex-shrink-0" />

        {/* Right: Google wordmark */}
        <span className="relative flex items-center overflow-hidden px-3 h-full">
          <GoogleWordmark />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-6 -translate-x-[150%] skew-x-[-20deg] bg-gradient-to-r from-transparent via-white/70 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[420%] group-focus-visible:translate-x-[420%] motion-reduce:hidden"
          />
        </span>
      </Link>
    </>
  );
}