"use client";

// components/policy/PolicyAccordion.tsx
//
// A disclosure row for the /policy FAQ.
//
// It exists rather than reusing components/ui/animations/AnimatedAccordion for
// one reason: that component renders `{open && <panel/>}`, so a closed answer
// is not in the DOM. On screen that is correct and cheap. On PAPER it means a
// printed copy of the borrowing policy contains six questions and no answers —
// and a policy page that prints without its answers is worse than one with no
// print styling at all.
//
// So the panel is always mounted and toggled with the `hidden` ATTRIBUTE,
// which keeps it out of the accessibility tree and out of tab order exactly as
// unmounting did, while leaving something for the print stylesheet to reveal
// (see `.policy-print-expand` in globals.css — which has to live in
// `@layer base` to beat Tailwind preflight's own `[hidden]` rule).
//
// Motion is opacity + transform, never height: height is a layout property, so
// tweening it re-lays-out the whole FAQ column on every frame. `.tab-panel-in`
// is the app's existing 200 ms entrance and is already disabled under
// prefers-reduced-motion.

import { useId, useState, type ReactNode, type KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";

export default function PolicyAccordion({
  title,
  children,
  km = false,
}: {
  title: ReactNode;
  children: ReactNode;
  km?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // A row that has never been toggled is simply closed; the entrance
  // animation is for a reader's tap, not for first paint.
  const [toggled, setToggled] = useState(false);
  const panelId = useId();
  const buttonId = useId();

  /**
   * Escape closes the row from anywhere inside it, and returns focus to the
   * header — without the focus move, a reader who closes a panel from a link
   * inside it is left with focus on a node that is now hidden.
   */
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Escape" || !open) return;
    e.stopPropagation();
    setOpen(false);
    document.getElementById(buttonId)?.focus();
  };

  return (
    <div
      data-open={open}
      onKeyDown={onKeyDown}
      className="rounded-xl border border-divider bg-bg-surface transition-colors data-[open=true]:border-brand/30 data-[open=true]:shadow-sm"
    >
      <h3 className="m-0">
        <button
          id={buttonId}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => {
            setOpen((o) => !o);
            setToggled(true);
          }}
          className={`flex w-full cursor-pointer items-center justify-between gap-4 rounded-xl px-5 py-4 text-left text-[14.5px] font-semibold text-text-heading transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-app ${km ? "font-khmer-serif" : ""}`}
        >
          <span className="policy-wrap">{title}</span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 ease-out motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
      </h3>
      {/* Always mounted; `hidden` does the hiding. See the note at the top. */}
      <div
        id={panelId}
        data-policy-panel=""
        hidden={!open}
        className={open && toggled ? "tab-panel-in" : undefined}
      >
        <div className="px-5 pb-4">{children}</div>
      </div>
    </div>
  );
}
