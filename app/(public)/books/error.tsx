"use client";

// app/books/error.tsx
// Shown by Next.js when the /books page throws during render or data fetch.

import { useEffect } from "react";
import Link from "next/link";

export default function BooksError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[/books error]", error);
  }, [error]);

  return (
    <section className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-20 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
        <svg className="h-8 w-8 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
      </div>
      <h1 className="text-xl font-bold text-text-heading">Unable to load catalogue</h1>
      <p className="mt-2 max-w-sm text-sm text-text-muted">
        Something went wrong while fetching books. This is usually temporary.
      </p>
      <div className="mt-6 flex gap-3">
        <button
          onClick={reset}
          className="inline-flex h-10 items-center rounded-[12px] bg-brand px-5 text-sm font-semibold text-white transition hover:bg-brand-hover"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex h-10 items-center rounded-[12px] border border-divider px-5 text-sm font-semibold text-text-body transition hover:bg-paper"
        >
          Go home
        </Link>
      </div>
    </section>
  );
}