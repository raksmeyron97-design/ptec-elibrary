/**
 * Tiny DOM event bus so the Hero/Sidebar action buttons (siblings of
 * ThesisTabs, not ancestors) can switch tabs and scroll to them without
 * lifting state into a page-wide client context.
 */
const EVENT_NAME = "thesis-tab-activate";

export function activateThesisTab(tabId: string) {
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: tabId }));
  document.getElementById("thesis-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function onThesisTabActivate(handler: (tabId: string) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<string>).detail);
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
