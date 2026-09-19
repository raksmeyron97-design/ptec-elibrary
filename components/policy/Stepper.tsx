// components/policy/Stepper.tsx
//
// A horizontal lifecycle: the four moments a borrower passes through, with a
// connecting line.
//
// It is an ordered LIST, not a progress indicator. Nothing here tracks where
// a particular reader is — every step is equally "current" because the diagram
// describes the process, not a session. So there is no `aria-current`, no
// `role="progressbar"` and no step marked complete: an assistive technology is
// told exactly what a sighted reader sees, which is four numbered stages.
//
// The connecting line is drawn with a border on the list item rather than a
// pseudo-element spanning the row, so it cannot run past the last step or
// survive a wrap to two rows on a narrow screen.
//
// Server component.

import {
  Calendar,
  CheckCircle2,
  CreditCard,
  Repeat2,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  card: CreditCard,
  calendar: Calendar,
  repeat: Repeat2,
  check: CheckCircle2,
};

export type StepperItem = {
  id: string;
  icon: keyof typeof ICONS | string;
  title: string;
  body: string;
};

export default function Stepper({
  items,
  label,
  km,
}: {
  items: StepperItem[];
  /** Accessible name for the list, e.g. "How a loan works". */
  label: string;
  km: boolean;
}) {
  const font = km ? "font-khmer-serif" : "";

  return (
    <ol
      aria-label={label}
      className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0"
    >
      {items.map((step, i) => {
        const Icon = ICONS[step.icon] ?? CheckCircle2;
        const last = i === items.length - 1;
        return (
          <li key={step.id} className="relative flex gap-4 lg:block lg:pr-6">
            {/* The connector. Hidden on the last step, and only drawn once the
                steps are actually in a row — stacked, it would point at
                nothing. Decorative, so it is out of the a11y tree. */}
            {!last && (
              <span
                aria-hidden="true"
                className="absolute left-[21px] top-12 hidden h-[calc(100%-1rem)] w-px bg-divider sm:block lg:left-11 lg:top-[21px] lg:h-px lg:w-[calc(100%-3.5rem)]"
              />
            )}
            <span className="relative z-[1] flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-brand/25 bg-brand/10 text-brand">
              <Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
              {/* The step number is read out; the icon beside it is not, so a
                  screen-reader user gets "Step 2" rather than an unlabelled
                  graphic. */}
              <span className="sr-only">{i + 1}.</span>
            </span>
            <div className="min-w-0 lg:mt-4">
              <h3
                className={`policy-wrap text-[15px] font-semibold text-text-heading ${font}`}
              >
                {step.title}
              </h3>
              <p className="policy-copy mt-1 text-[13.5px] text-text-body">{step.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
