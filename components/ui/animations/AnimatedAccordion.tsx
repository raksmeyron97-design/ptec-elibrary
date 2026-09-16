"use client";

// components/ui/animations/AnimatedAccordion.tsx
// A disclosure row (the homepage FAQ). Opening fades and lifts the panel in —
// opacity + transform, 200 ms (`.tab-panel-in`, app/globals.css) — instead of
// tweening its height: height is a layout property, so every frame of the old
// framer-motion animation re-laid-out the whole FAQ column, on the low-end
// phones this library is read on. The chevron turns by transform. Reduced
// motion turns both off (the `.tab-panel-in` rule and motion-reduce).

import { useId, useState, type ReactNode } from "react";

type AnimatedAccordionProps = {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
};

export default function AnimatedAccordion({
  title,
  children,
  defaultOpen = false,
  className,
}: AnimatedAccordionProps) {
  const [open, setOpen] = useState(defaultOpen);
  // A row open by default is simply open on first render; the entrance is
  // for a reader's tap.
  const [toggled, setToggled] = useState(false);
  const panelId = useId();

  return (
    <div
      data-open={open}
      className={`group rounded-xl border border-divider bg-bg-surface transition-colors data-[open=true]:border-brand/30 data-[open=true]:shadow-sm ${className ?? ""}`}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((o) => !o);
          setToggled(true);
        }}
        className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-xl px-5 py-4 text-left text-[14.5px] font-bold text-text-heading transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
      >
        {title}
        <svg
          className={`h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 ease-out motion-reduce:transition-none ${
            open ? "rotate-180" : ""
          }`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div id={panelId} className={toggled ? "tab-panel-in" : undefined}>
          <div className="px-5 pb-4">{children}</div>
        </div>
      )}
    </div>
  );
}
