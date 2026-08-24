"use client";

import { useId } from "react";
import {
  ERROR_CLASS,
  HINT_CLASS,
  INPUT_CLASS,
  INPUT_INVALID_CLASS,
  LABEL_CLASS,
} from "./styles";

/**
 * The admin field wrapper: label, required marker, control, and a single slot
 * that holds either the hint or the error.
 *
 * Written because the panel had eight label styles, three input bases and
 * `aria-invalid` on twenty-two controls out of several hundred — every form
 * re-derived the same markup and each one got a slightly different amount of it
 * right. Wiring the accessibility here once means a form author cannot forget
 * it.
 *
 * Two shapes, deliberately:
 *
 *   <Field label="Title" required error={errors.title}>
 *     {(p) => <input {...p} value={…} onChange={…} />}
 *   </Field>
 *
 * The render-prop form hands back `id`, `aria-invalid`, `aria-describedby` and
 * the base `className`, so the control cannot be mislabelled. Pass plain
 * children instead when the control is a composite that manages its own
 * labelling (TagInput, a dropzone, an authorship editor) — then supply
 * `htmlFor` if a real control inside owns that id.
 */

export interface FieldControlProps {
  id: string;
  className: string;
  "aria-invalid": true | undefined;
  "aria-describedby": string | undefined;
  required: boolean | undefined;
}

export default function Field({
  label,
  required,
  hint,
  error,
  htmlFor,
  className = "",
  labelSuffix,
  children,
}: {
  label: React.ReactNode;
  /** Renders the `*` and sets `required` on the control. Mark required, never optional. */
  required?: boolean;
  /** Shown only while there is no error — the two share one slot. */
  hint?: React.ReactNode;
  error?: string;
  /** Only for the plain-children form, when a control inside owns this id. */
  htmlFor?: string;
  className?: string;
  /** Small trailing affordance on the label row — a counter, a "generate" link. */
  labelSuffix?: React.ReactNode;
  children: React.ReactNode | ((props: FieldControlProps) => React.ReactNode);
}) {
  const reactId = useId();
  const id = htmlFor ?? `f${reactId.replace(/:/g, "")}`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const describedBy =
    [error ? errorId : null, hint && !error ? hintId : null].filter(Boolean).join(" ") ||
    undefined;

  const controlProps: FieldControlProps = {
    id,
    className: error ? `${INPUT_CLASS} ${INPUT_INVALID_CLASS}` : INPUT_CLASS,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    required: required || undefined,
  };

  return (
    <div className={`min-w-0 ${className}`}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className={LABEL_CLASS}>
          {label}
          {required && (
            <span className="ms-0.5 font-normal text-danger" aria-hidden="true">
              *
            </span>
          )}
        </label>
        {labelSuffix}
      </div>

      {typeof children === "function" ? children(controlProps) : children}

      {error ? (
        <p id={errorId} role="alert" className={ERROR_CLASS}>
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className={HINT_CLASS}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
