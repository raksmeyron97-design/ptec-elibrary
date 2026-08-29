"use client";

import { useId } from "react";

/**
 * A labelled on/off switch for admin forms.
 *
 * WHY A SHARED ONE. Three surfaces had already hand-rolled this control
 * (`team/_components/TeamForm.tsx` twice, and the pattern was about to be
 * copied a fourth time for publication download permission). Each copy has to
 * get `role="switch"`, `aria-checked`, the 44px hit area and the
 * on/off wording right independently, and the kit exists precisely so they do
 * not have to.
 *
 * WHY NOT A CHECKBOX. The brief is explicit — "Use a proper switch component
 * with explanatory text. Do not use an ambiguous checkbox." A checkbox says
 * "this option is selected"; a switch says "this setting is on", and it
 * announces its state to a screen reader as on/off rather than as
 * checked/unchecked. Download permission is a setting.
 *
 * The consequence text is the point of the component, not decoration: a
 * librarian toggling this needs to read what readers will and will not be able
 * to do, at the moment they toggle it. `onDescription`/`offDescription` swap
 * with the state so the panel always describes the CURRENT setting rather than
 * the one being offered.
 */
export default function Switch({
  checked,
  onChange,
  label,
  description,
  onDescription,
  offDescription,
  disabled = false,
  tone = "brand",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** The setting's name, e.g. "Download permission". */
  label: string;
  /** One line that does not change with the state. */
  description?: string;
  /** What is true while the switch is on. Shown only when it is. */
  onDescription?: React.ReactNode;
  /** What is true while the switch is off. Shown only when it is. */
  offDescription?: React.ReactNode;
  disabled?: boolean;
  /**
   * `brand` for a neutral setting; `success` where "on" is the permissive,
   * expected state and "off" is a deliberate restriction worth seeing.
   */
  tone?: "brand" | "success";
}) {
  const labelId = useId();
  const descId = useId();

  const onColor = tone === "success" ? "bg-success" : "bg-brand";
  const activeShell =
    tone === "success"
      ? "border-success-line bg-success-soft"
      : "border-brand/40 bg-brand/5";

  const stateDescription = checked ? onDescription : offDescription;

  return (
    <div
      className={`rounded-xl border px-4 py-3.5 transition-colors ${
        checked ? activeShell : "border-divider bg-paper"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p id={labelId} className="text-sm font-semibold text-text-heading">
            {label}
          </p>
          {description && (
            <p id={descId} className="mt-0.5 text-xs leading-5 text-text-muted">
              {description}
            </p>
          )}
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-labelledby={labelId}
          aria-describedby={description ? descId : undefined}
          disabled={disabled}
          onClick={() => onChange(!checked)}
          // min-h-11/min-w-11 rather than the visual 20x36 track: the target a
          // finger has to hit is the button, and the track alone is under half
          // the 44px minimum.
          className="focus-field -m-2 inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg p-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span
            aria-hidden="true"
            className={`relative block h-5 w-9 rounded-full transition-colors duration-150 ${
              checked ? onColor : "bg-divider"
            }`}
          >
            <span
              className={`absolute top-0.5 block h-4 w-4 rounded-full bg-bg-surface shadow transition-transform duration-150 ${
                checked ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </span>
        </button>
      </div>

      {stateDescription && (
        <div className="mt-3 border-t border-divider/70 pt-3 text-xs leading-6 text-text-body">
          {stateDescription}
        </div>
      )}
    </div>
  );
}
