/**
 * One definition of "safe to put in a log line", for the whole app.
 *
 * A log line is a record someone reads later to reconstruct what happened, and
 * much of what reaches one through an error message is, somewhere upstream, a
 * string a visitor chose: a search query, an upload folder name, a filename, a
 * record id from a route parameter. A line break in that string ends the log
 * line and starts one the reader has no way to tell apart from a line this
 * process wrote — which is how a forged "[auth] admin sign-in succeeded" lands
 * in the middle of an incident timeline. Terminal escape sequences do the same
 * to whoever is tailing the log, and an unbounded value turns one event into a
 * page of scrollback.
 *
 * These TRANSFORM rather than validate: the return value is the only thing a
 * caller can log, so there is no shape of the call that accidentally logs the
 * raw value instead. That is also why neither is an `assertLoggable()`
 * predicate — a guard can be written and then ignored on the next line.
 */

/**
 * Line breaks, spelled out as their own pass and removed rather than replaced.
 *
 * BOTH of those are load-bearing, and both were learned from a scan rather than
 * from reasoning:
 *
 * - **Spelled out**, not folded into {@link CONTROL_CHARS} below, because a
 *   static analyser cannot see a `\n` inside a `\u0000-\u001f` range and
 *   will report every call site as unsanitised.
 * - **Removed**, not replaced with a visible marker, because a non-empty
 *   replacement is not recognised as removing the character either. The marker
 *   was worth having and it cost three CodeQL js/log-injection alerts; the
 *   suffix in `scrubLogValue` buys the same information back.
 *
 * The second pass would cover line breaks anyway. The output is identical
 * either way; only the legibility to the analysis differs.
 */
const LINE_BREAKS = /[\r\n]/g;

/** Every other C0/C1 control character: NUL, and the ESC that starts a colour sequence. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

const MAX_LOGGED_LENGTH = 500;

/**
 * Strip anything that could forge a fake log line or terminal escape sequence
 * out of an id before it is interpolated into a log message. Capped at 200 —
 * an id longer than that is not an id.
 */
export function sanitizeLogId(value: string): string {
  return value.replace(LINE_BREAKS, "").replace(CONTROL_CHARS, "").slice(0, 200);
}

/**
 * The same, for an arbitrary value on its way into a log call: reads `.message`
 * off an Error, survives a value that refuses to stringify, and caps length.
 *
 * A value that contained line breaks comes back with a ` [flattened]` suffix,
 * so a reader can tell a scrubbed line from a clean one without the newline
 * itself having to survive to say so.
 */
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

  const hadLineBreaks = /[\r\n]/.test(text);
  const flattened = text.replace(LINE_BREAKS, "").replace(/\t/g, " ").replace(CONTROL_CHARS, "");
  const capped =
    flattened.length > MAX_LOGGED_LENGTH
      ? `${flattened.slice(0, MAX_LOGGED_LENGTH)}… (${flattened.length} chars)`
      : flattened;

  return hadLineBreaks ? `${capped} [flattened]` : capped;
}
