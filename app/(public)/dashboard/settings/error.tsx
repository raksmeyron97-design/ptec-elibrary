"use client";

import Icon from "@/components/ui/core/Icon";

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 min-h-[400px] flex flex-col items-center justify-center text-center">
      <div className="h-16 w-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-6">
        <Icon name="alert-triangle" className="text-3xl" />
      </div>
      <h2 className="text-xl font-bold text-text-heading mb-2">Something went wrong</h2>
      <p className="text-text-muted mb-8 max-w-md">
        {error.message || "An unexpected error occurred while loading your settings."}
      </p>
      <button type="button" onClick={() => reset()}
        className="h-11 px-6 rounded-xl bg-brand text-brand-contrast font-bold hover:bg-brand-hover transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
