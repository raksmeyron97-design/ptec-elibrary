// lib/ask/open.ts
// Opens the library assistant (<AskWidget>) from anywhere on the page.
//
// The assistant is one widget mounted by the public layout; the entry points
// that want it — a search that found nothing, a book page's "Ask about this
// book" — live in unrelated trees. A window event keeps them decoupled
// without lifting the widget's state into a provider every public page would
// then re-render through.
//
// A prompt is PRE-FILLED, never sent. Asking spends the reader's daily quota
// (lib/ai/limits.ts), and a tap on "Ask about this book" is a request to open
// the conversation, not consent to spend a question on words the reader has
// not seen.

export const ASK_OPEN_EVENT = "ptec:ask-open";

export type AskOpenDetail = {
  /** Text to place in the input, editable before sending. */
  prompt?: string;
};

export function openLibraryAssistant(detail: AskOpenDetail = {}): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AskOpenDetail>(ASK_OPEN_EVENT, { detail }));
}
