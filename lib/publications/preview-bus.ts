/**
 * Tiny DOM event bus so the Hero/Sidebar action buttons (siblings of
 * PDFPreviewSection, not ancestors) can reveal + scroll to the inline PDF
 * preview without lifting state into a page-wide client context. Mirrors
 * lib/theses/tab-bus.ts's pattern for the analogous theses tab-switch case.
 */
const EVENT_NAME = "publication-preview-open";

export function activatePublicationPreview() {
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
  document.getElementById("fulltext")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function onPublicationPreviewOpen(handler: () => void): () => void {
  const listener = () => handler();
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
