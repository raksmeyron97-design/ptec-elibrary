/**
 * Scrub a value before it becomes part of a log line.
 *
 * A log line is a record someone reads later to reconstruct what happened, and
 * much of what reaches one through an error message is, somewhere upstream, a
 * string a visitor chose: a search query, an upload folder name, a filename.
 * A newline in that string ends the line and starts one the reader has no way
 * to tell apart from a line this process wrote — which is how a forged
 * "[auth] admin sign-in succeeded" lands in the middle of an incident
 * timeline. Terminal escape sequences do the same to whoever is tailing the
 * log, and an unbounded value turns one event into a page of scrollback.
 *
 * This TRANSFORMS rather than validates: the return value is the only thing a
 * caller can log, so there is no shape of the call that accidentally logs the
 * raw value instead. That is also why it is not a `assertLoggable()` boolean —
 * a guard can be written and then ignored on the next line.
 */
const MAX_LOGGED_LENGTH = 500;

/** C0, DEL and C1 — everything a terminal or a log reader treats as control. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

export function scrubLogValue(value: unknown): string {
  let text: string;
  if (value instanceof Error) {
    text = value.message;
  } else if (typeof value === "string") {
    text = value;
  } else {
    try {
      text = String(value);
    } catch {
      text = "[unprintable]";
    }
  }

  const flattened = text
    // Line breaks and tabs become a visible marker rather than vanishing: a
    // reader should be able to tell a scrubbed value from a clean one.
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/\t/g, "\\t")
    .replace(CONTROL_CHARS, "");

  return flattened.length > MAX_LOGGED_LENGTH
    ? `${flattened.slice(0, MAX_LOGGED_LENGTH)}… (${flattened.length} chars)`
    : flattened;
}
