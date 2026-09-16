// components/ui/animations/ReadingProgress.tsx
// The thin reading-progress line along the top of every public page. Pure CSS
// now (`.reading-progress` in app/globals.css): a scroll-driven animation —
// `animation-timeline: scroll(root)` — scales it from 0 to 1 as the page
// scrolls. No JavaScript at all: it used to be a framer-motion spring
// recomputed on every scroll event, on every public page, which also kept the
// animation library on every page's critical path.
//
// Where the browser has no scroll-driven animations (older Android Chrome,
// Firefox), the line is not shown — deliberately: a JS polyfill would put
// back the per-frame main-thread work this exists to remove. Readers who
// prefer reduced motion do not get it either.
//
// A server component: it renders one empty element.
export default function ReadingProgress() {
  return <div aria-hidden="true" className="reading-progress" />;
}
