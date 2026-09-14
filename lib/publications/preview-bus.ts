/**
 * Tiny DOM event bus so the Hero/Sidebar action buttons (siblings of
 * PDFPreviewSection, not ancestors) can reveal + scroll to the inline PDF
 * preview without lifting state into a page-wide client context. Mirrors
 * lib/theses/tab-bus.ts's pattern for the analogous theses tab-switch case.
 */
const EVENT_NAME = "publication-preview-open";

export function activatePublicationPreview() {
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
  const target = document.getElementById("fulltext");
  if (!target) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  // Move keyboard focus with the view, so the next Tab continues inside the
  // reader rather than back at the button that was pressed. The section is a
  // tabindex="-1" landmark target, never a tab stop of its own.
  if (target.hasAttribute("tabindex")) target.focus({ preventScroll: true });
}

export function onPublicationPreviewOpen(handler: () => void): () => void {
  const listener = () => handler();
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
