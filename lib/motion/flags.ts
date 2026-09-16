// lib/motion/flags.ts
// Motion switches. Each is ONE line to flip.
//
// PAGE_TRANSITIONS — fade the page content in on client-side navigation with
// React's <ViewTransition> (the browser's View Transitions API; see
// components/layout/PageTransition.tsx, mounted by
// app/[locale]/(public)/template.tsx). It is the one optional item of the
// mobile motion pass: an earlier page-transition wrapper (framer-motion,
// removed in #105) blanked pages on mobile and desktop, so this one ships
// behind a switch. `false` and the template renders its children exactly as
// before — no boundary, and the view-transition CSS never runs.
export const PAGE_TRANSITIONS = true;

/** The transition type a Link sets to keep its navigation out of the page
 *  fade: the phone tab bar's. Its indicator slides live, and a running view
 *  transition would freeze it mid-slide. */
export const SHELL_TAB_TRANSITION = "shell-tab";
