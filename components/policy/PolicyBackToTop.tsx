"use client";

// components/policy/PolicyBackToTop.tsx
//
// A floating "back to top" that appears once the reader is 600px down.
//
// Three deliberate choices:
//
// 1. BOTTOM-LEFT. The assistant FAB (components/ui/ask/AskWidget.tsx) is fixed
//    bottom-right at z-40 on every public page, and on a phone it already sits
//    above the tab bar. A second round button in that corner is either under
//    it or on top of it.
// 2. The visible/hidden state is a DATA ATTRIBUTE toggled on the DOM node, not
//    React state. A scroll position crossing 600px would otherwise re-render
//    the component on the frame it crosses, and again on every crossing as the
//    reader scrubs around that point.
// 3. The listener is `passive` and rAF-throttled, so a flick never blocks the
//    compositor. There is no IntersectionObserver alternative here: the
//    question is "how far down is the viewport", which is scroll position
//    itself, not an element's visibility.

import { useEffect, useRef } from "react";
import { ArrowUp } from "lucide-react";

const SHOW_AFTER_PX = 600;

export default function PolicyBackToTop({ label }: { label: string }) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;

    const apply = () => {
      frame = 0;
      const visible = window.scrollY > SHOW_AFTER_PX;
      if (el.dataset.visible === String(visible)) return;
      el.dataset.visible = String(visible);
      // The a11y tree follows the visual state in the SAME write. A button
      // that is transparent and `pointer-events: none` but still focusable is
      // a tab stop a keyboard reader lands on and cannot see; one that is
      // permanently `aria-hidden` is a control they can never reach at all.
      el.setAttribute("aria-hidden", visible ? "false" : "true");
      el.tabIndex = visible ? 0 : -1;
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(apply);
    };

    apply(); // A reload halfway down the page must not hide the button.
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <button
      ref={ref}
      type="button"
      data-visible="false"
      data-policy-print="hide"
      // Starts unreachable and is opened up by the scroll handler above, in
      // the same write that makes it visible. Server-rendered this way so a
      // reader at the top of the page never tabs into an invisible button
      // before hydration.
      aria-hidden="true"
      tabIndex={-1}
      onClick={() => {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
        // Send focus back where the reader now is. Without this a keyboard
        // reader is returned to the top visually while their focus stays a
        // thousand pixels down the document.
        document.getElementById("main-content")?.focus();
      }}
      className="policy-to-top inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-divider bg-bg-surface text-text-muted shadow-md transition-colors hover:border-brand/40 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-app"
      title={label}
    >
      <ArrowUp className="h-5 w-5" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </button>
  );
}
