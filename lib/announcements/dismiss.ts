// Hiding already-dismissed announcements BEFORE first paint.
//
// The banner used to be a client component that returned `null` until it had
// hydrated and read its dismissal list, then rendered. That removed the flash
// of a banner the reader had already dismissed, and paid for it with a layout
// shift on every public page: the document grew by the banner's height about a
// second after load (measured on the journal article page — the masthead moved
// from 174 px to 218 px between 600 ms and 1200 ms).
//
// The cost was not only visual. A control pressed inside that window takes its
// `pointerdown` and its `mouseup` on two different elements, so the browser
// produces NO click at all — a reader aiming at a link in the side rail gets
// nothing, and the pointer was over the right element the whole time.
//
// So the banner is server-rendered in full, and this script — running before
// the markup below it is parsed — writes one stylesheet that hides the rows
// this browser has already dismissed. Same trade as THEME_INIT_SCRIPT in
// lib/csp.ts: read the stored preference before paint rather than render twice.

/** Shared with the banner's own writer; changing it forgets every dismissal. */
export const DISMISS_STORAGE_KEY = "ptec.dismissedAnnouncements";

/** Marks a dismissible row. The script's selector is built from this. */
export const ANNOUNCEMENT_ID_ATTR = "data-announcement-id";

/**
 * The pre-paint script, as source.
 *
 * Written as one string rather than as a TypeScript function compiled twice:
 * a second implementation is a second thing to drift, and the test evaluates
 * THIS string in a DOM rather than a re-typed copy of it.
 *
 * Every id is checked against a strict charset before it reaches a selector.
 * The list is the reader's own localStorage, so it is not a remote attacker's
 * input — but it is the one value here that becomes CSS source text, and a
 * value that becomes syntax gets validated whoever wrote it. Anything with a
 * quote, a brace or a newline in it is dropped rather than escaped.
 */
export const ANNOUNCEMENT_DISMISS_SCRIPT = `
(() => {
  try {
    var raw = localStorage.getItem(${JSON.stringify(DISMISS_STORAGE_KEY)});
    if (!raw) return;
    var ids = JSON.parse(raw);
    if (!Array.isArray(ids)) return;
    var sel = [];
    for (var i = 0; i < ids.length && sel.length < 50; i++) {
      var id = ids[i];
      if (typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id)) {
        sel.push('[${ANNOUNCEMENT_ID_ATTR}="' + id + '"]');
      }
    }
    if (!sel.length) return;
    var style = document.createElement("style");
    style.id = "announcement-dismiss";
    style.textContent = sel.join(",") + "{display:none!important}";
    document.head.appendChild(style);
  } catch (e) {}
})();
`.trim();
