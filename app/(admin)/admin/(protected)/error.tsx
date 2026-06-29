'use client';

import { useEffect } from 'react';
import { ShieldOff, RotateCcw } from 'lucide-react';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const isForbidden =
    error.message === "Forbidden" ||
    error.message?.toLowerCase().includes("forbidden") ||
    error.message?.toLowerCase().includes("not authorized") ||
    error.message?.toLowerCase().includes("unauthorized");

  if (isForbidden) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 max-w-md w-full shadow-sm">
          <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldOff className="w-7 h-7 text-amber-600" />
          </div>
          <h2 className="text-xl font-bold text-amber-800 mb-2">Access Denied</h2>
          <p className="text-sm text-amber-700/80 leading-relaxed mb-6">
            You don&apos;t have permission to view this page. Please contact an administrator
            if you believe this is a mistake.
          </p>
          <a
            href="/admin"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Back to Dashboard
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
      <div className="bg-red-50 border border-red-100 rounded-xl p-8 max-w-md w-full shadow-sm">
        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-red-700 mb-3">Something went wrong!</h2>
        <p className="text-sm text-red-600/80 mb-6">
          {error.message || 'An unexpected error occurred while loading this page.'}
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Try again
        </button>
      </div>
    </div>
  );
}
