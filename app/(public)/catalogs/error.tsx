// app/catalogs/error.tsx
"use client";

import { useEffect } from "react";

export default function CatalogsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Catalogs page error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#F5F6FA]">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 py-6 md:px-12">
        <div className="mx-auto max-w-[1400px]">
          <h1 className="text-2xl font-bold text-[#0a1629]">Books In Library</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Find physical books available at RULE Library
          </p>
        </div>
      </div>

      {/* Error state */}
      <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-12">
        <div className="flex min-h-[400px] flex-col items-center justify-center rounded-2xl border border-dashed border-red-200 bg-white p-10 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
            <svg
              className="h-7 w-7 text-red-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-800">
            Something went wrong
          </h2>
          <p className="mt-2 max-w-md text-sm text-slate-500">
            We couldn&apos;t load the book catalogue. This might be a temporary
            issue &mdash; please try again.
          </p>
          {error.digest && (
            <p className="mt-2 text-xs text-slate-400 font-mono">
              Error ref: {error.digest}
            </p>
          )}
          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={reset}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0a1629] px-6 text-sm font-semibold text-white transition hover:bg-[#007c91]"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              Try again
            </button>
            <a
              href="/home"
              className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
            >
              Go home
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}