// app/[locale]/(public)/template.tsx
// Page transitions for the public site (components/layout/PageTransition.tsx).
//
// A TEMPLATE, not the layout, on purpose. Next re-mounts a template when the
// segment directly beneath it changes (/books → /theses), so a navigation is
// the old page EXITING and the new one ENTERING — and PageTransition animates
// exactly those. Anything else that runs as a transition inside a page — a
// server action finishing, a filter's router.replace, a Suspense boundary
// revealing — is an UPDATE, which it maps to "none". Wrapped around
// {children} in the layout instead, every one of those faded the whole page.
//
// Off with one line: PAGE_TRANSITIONS in lib/motion/flags.ts.
import PageTransition from "@/components/layout/PageTransition";

export default function PublicTemplate({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
