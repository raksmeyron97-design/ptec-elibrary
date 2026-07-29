"use client";

// components/about/PrintPageAction.tsx
//
// "Print this page" for the policy pages. A client component because printing
// is a browser action — but a deliberately tiny one, and it renders nothing at
// all until the browser confirms it can print, so a server-rendered page never
// shows a button that would do nothing.
//
// Before printing it force-opens every <details> inside the page. The print
// stylesheet in app/globals.css also unhides collapsed content, but that
// depends on which mechanism the browser uses to hide it
// (`display:none` on children vs `content-visibility` on
// `::details-content`), and a printed policy that silently omits half its
// clauses is worse than no print button. Belt and braces on purpose.
//
// Previously-closed sections are restored afterwards so the reader's screen
// is left exactly as they had it.

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";

export default function PrintPageAction({
  label,
  hint,
  targetSelector = ".about-page",
}: {
  label: string;
  hint?: string;
  targetSelector?: string;
}) {
  const [canPrint, setCanPrint] = useState(false);

  useEffect(() => {
    setCanPrint(typeof window !== "undefined" && typeof window.print === "function");
  }, []);

  if (!canPrint) return null;

  const handlePrint = () => {
    const root = document.querySelector(targetSelector) ?? document.body;
    const collapsed = Array.from(
      root.querySelectorAll<HTMLDetailsElement>("details:not([open])"),
    );
    collapsed.forEach((el) => {
      el.open = true;
    });

    const restore = () => {
      collapsed.forEach((el) => {
        el.open = false;
      });
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);

    window.print();
    // Safari fires `afterprint` unreliably; this fallback makes sure the page
    // never stays permanently expanded if the event is missed.
    window.setTimeout(restore, 1000);
  };

  return (
    <button
      type="button"
      onClick={handlePrint}
      title={hint}
      data-about-print="hide"
      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-divider bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-body shadow-sm transition-colors hover:border-brand/40 hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
    >
      <Printer className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
}
