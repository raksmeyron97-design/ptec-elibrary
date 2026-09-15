/**
 * Opens the article's "Cite this article" dialog from any trigger on the page.
 *
 * The header's Cite button and the phone action dock are siblings of the one
 * dialog, not ancestors, so a window event keeps them decoupled without a
 * page-wide client context — the pattern lib/publications/preview-bus.ts uses
 * for the inline PDF reader.
 */
const EVENT_NAME = "publication-cite-open";

export function openCiteDialog(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function onCiteDialogOpen(handler: () => void): () => void {
  const listener = () => handler();
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
