/**
 * Tiny DOM event bus so the record page's "Preview PDF" button can open the
 * full-text reader further down the page.
 *
 * It exists because the two are siblings, not ancestor and descendant: the
 * action row is in the header, the reader is inside the Full text section, and
 * neither can hold the other's state without lifting a page-wide client
 * context above both — which would make the whole record page a client
 * component. One custom event is cheaper and keeps the page a server render.
 *
 * This replaces the use of lib/theses/tab-bus.ts on this page. That bus
 * switched a TAB and scrolled to `#thesis-tabs`; the record page no longer has
 * tabs or that element, so the old call scrolled nowhere and opened nothing.
 * The tab bus is still used by the publications preview pattern, so it stays.
 */
const EVENT_NAME = "thesis-reader-open";

/** Scroll the Full text section into view and ask it to mount the reader. */
export function openThesisReader() {
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
  // `block: "start"` plus the section's own `scroll-mt` puts the heading below
  // the docked navbar rather than under it. Smoothness is the browser's call:
  // `scroll-behavior: smooth` in the stylesheet already honours
  // prefers-reduced-motion, which this API would override if it passed one.
  document.getElementById("full-text")?.scrollIntoView({ block: "start" });
}

export function onThesisReaderOpen(handler: () => void): () => void {
  const listener = () => handler();
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
