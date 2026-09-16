/// <reference types="react/canary" />
// components/layout/PageTransition.tsx
// A short fade-in of the PAGE CONTENT on client-side navigation, using React's
// <ViewTransition> over the browser's View Transitions API — no animation
// library. Mounted by app/[locale]/(public)/template.tsx, which re-mounts per
// top-level page, so a navigation arrives here as an EXIT (the old page) and
// an ENTER (the new one).
//
// Behind a one-line switch (lib/motion/flags.ts, PAGE_TRANSITIONS): an earlier
// page-transition wrapper (framer-motion, removed in #105) blanked pages, so
// this one must be removable without a trace. Off, it renders its children
// and nothing else.
//
// What moves, and what does not (app/globals.css, "Page transitions"):
//   - The new page fades in over 200 ms ABOVE the old one, which stays fully
//     opaque underneath until it is done — opacity only, so there is no frame
//     in which neither page is fully there. The root (header, tab bar,
//     footer, the assistant) is told not to animate, so the chrome never
//     blinks.
//   - update="none": anything else that runs as a transition inside a page —
//     a server action finishing, a filter's router.replace, a Suspense
//     boundary revealing — does not fade the page.
//   - A navigation from the phone tab bar is tagged SHELL_TAB_TRANSITION and
//     resolves to "none" here, so no view transition starts at all: while one
//     runs the page is shown as frozen snapshots, which would swallow the tab
//     bar's own sliding indicator.
//   - Browsers without the View Transitions API, and readers who prefer
//     reduced motion, get the instant swap they always had.

import { ViewTransition, type ReactNode } from "react";
import { PAGE_TRANSITIONS, SHELL_TAB_TRANSITION } from "@/lib/motion/flags";

export default function PageTransition({ children }: { children: ReactNode }) {
  if (!PAGE_TRANSITIONS) return <>{children}</>;
  return (
    <ViewTransition
      default="none"
      update="none"
      enter={{ [SHELL_TAB_TRANSITION]: "none", default: "page-enter" }}
      exit={{ [SHELL_TAB_TRANSITION]: "none", default: "page-exit" }}
    >
      {children}
    </ViewTransition>
  );
}
