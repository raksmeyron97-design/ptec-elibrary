// app/catalogs/[slug]/error.tsx
"use client";

import { useEffect } from "react";
import { Link } from "@/i18n/navigation";
export default function CatalogBookError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Catalog book page error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-bg-app">
      {/* Breadcrumb */}
      <div className="bg-bg-surface border-b border-divider px-4 py-3 md:px-12">
        <div className="mx-auto max-w-[1100px] flex items-center gap-2 text-sm text-text-muted">
          <Link href="/" className="hover:text-brand transition">
            Home
          </Link>
          <span>›</span>
          <Link href="/catalogs" className="hover:text-brand transition">
            Books In Library
          </Link>
          <span>›</span>
          <span className="text-text-muted">Error</span>
        </div>
      </div>

      {/* Error state */}
      <div className="mx-auto max-w-[1100px] px-4 py-8 md:px-12">
        <div className="flex min-h-[450px] flex-col items-center justify-center rounded-2xl border border-dashed border-red-200 bg-bg-surface p-10 text-center">
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
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              <line x1="9" y1="9" x2="5" y2="13" />
              <line x1="5" y1="9" x2="9" y2="13" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-text-heading">
            Couldn&apos;t load this book
          </h2>
          <p className="mt-2 max-w-md text-sm text-text-muted">
            Something went wrong while loading the book details. This might be a
            temporary issue &mdash; please try again.
          </p>
          {error.digest && (
            <p className="mt-2 text-xs text-text-muted font-mono">
              Error ref: {error.digest}
            </p>
          )}
          <div className="mt-6 flex items-center gap-3">
            <button type="button">
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
            <Link
              href="/catalogs"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-divider bg-bg-surface px-6 text-sm font-semibold text-text-body transition hover:border-divider hover:text-text-heading"
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
                <path d="M19 12H5m0 0 7 7m-7-7 7-7" />
              </svg>
              Back to catalogue
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
