"use client";

import Link from "next/link";

const SearchIcon = () => (
  <svg
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="h-[18px] w-[18px] flex-shrink-0 transition-transform duration-300 ease-out group-hover:scale-110 group-hover:rotate-6 group-active:scale-90 group-active:rotate-0 motion-reduce:transition-none motion-reduce:transform-none"
  >
    <circle cx="8.5" cy="8.5" r="5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M13 13L17 17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
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
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 rounded-full opacity-0 shadow-[0_4px_16px_rgba(30,58,138,0.12)] transition-opacity duration-300 ease-out group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
        />
        <SearchIcon />
      </Link>

      {/* sm+: expandable search button */}
      <Link
        href="/search"
        aria-label="Search the library"
        className="group hidden sm:flex relative items-center h-10 rounded-full border border-divider bg-bg-surface shadow-sm overflow-hidden transition-all duration-300 ease-out hover:border-brand/30 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-app motion-reduce:transition-none text-text-muted"
        style={{ minWidth: 0 }}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 rounded-full opacity-0 shadow-[0_4px_16px_rgba(30,58,138,0.12)] transition-opacity duration-300 ease-out group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
        />

        {/* Left: search icon */}
        <span className="flex items-center justify-center h-full pl-3.5 pr-2.5">
          <SearchIcon />
        </span>

        {/* Reveal: purpose text */}
        <span className="max-w-0 overflow-hidden transition-[max-width] duration-300 ease-out group-hover:max-w-[160px] group-focus-visible:max-w-[160px] motion-reduce:transition-none">
          <span className="whitespace-nowrap pr-4 text-sm">
            Search the library
          </span>
        </span>
      </Link>
    </>
  );
}
