import type { InputHTMLAttributes } from "react";
import { AlertCircle } from "lucide-react";

/**
 * A single labelled text input with an accessible error message.
 *
 * Shared by the name and email fields rather than two near-identical
 * components — the markup difference between them is a `type` and an
 * `autoComplete` value, not a reason to fork the component.
 *
 * Uses `.focus-field` (app/globals.css) for the single-indicator focus
 * system the rest of the app has moved to, rather than the page's previous
 * hand-rolled `focus:ring-2 focus:ring-brand/15`.
 */
export default function TextField({
  id,
  label,
  error,
  ...inputProps
}: {
  id: string;
  label: string;
  error: string | null;
} & InputHTMLAttributes<HTMLInputElement>) {
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-text-body">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`focus-field h-12 w-full rounded-xl border bg-bg-surface px-4 text-[15px] text-text-heading placeholder-text-muted outline-none transition ${
          error ? "border-danger-line" : "border-divider"
        }`}
        {...inputProps}
      />
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 flex items-center gap-1 text-xs text-danger-text">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}
