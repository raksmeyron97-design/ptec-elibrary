import type { InputHTMLAttributes, ReactNode } from "react";
import { AlertCircle, Eye, EyeOff } from "lucide-react";

/**
 * A password input with a visibility toggle, shared by the password and
 * confirm-password fields (the toggle button, error row and focus styling
 * are identical between them — only the content below the field differs:
 * the live requirements checklist vs the match indicator).
 */
export default function PasswordField({
  id,
  label,
  error,
  show,
  onToggleShow,
  showLabel,
  hideLabel,
  below,
  labelAddon,
  ...inputProps
}: {
  id: string;
  label: string;
  error: string | null;
  show: boolean;
  onToggleShow: () => void;
  showLabel: string;
  hideLabel: string;
  /** Rendered below the field — the requirements checklist or the match status. */
  below?: ReactNode;
  /** e.g. a "Forgot password?" link, rendered beside the label. */
  labelAddon?: ReactNode;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const errorId = `${id}-error`;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-semibold text-text-body">{label}</label>
        {labelAddon}
      </div>
      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={`focus-field h-12 w-full rounded-xl border bg-bg-surface px-4 pr-12 text-[15px] text-text-heading placeholder-text-muted outline-none transition ${
            error ? "border-danger-line" : "border-divider"
          }`}
          {...inputProps}
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-text-muted transition hover:text-text-body"
          aria-label={show ? hideLabel : showLabel}
          aria-pressed={show}
        >
          {show ? <EyeOff className="h-[18px] w-[18px]" aria-hidden="true" /> : <Eye className="h-[18px] w-[18px]" aria-hidden="true" />}
        </button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 flex items-center gap-1 text-xs text-danger-text">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
      {below}
    </div>
  );
}
