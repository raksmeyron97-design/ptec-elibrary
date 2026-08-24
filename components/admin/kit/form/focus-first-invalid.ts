/**
 * Send the user to the problem.
 *
 * Reporting "3 fields need attention" and leaving the user to find them is the
 * single most common validation failure in this panel — no admin form focused
 * an invalid control before this helper existed. Call it after a failed submit,
 * once the step holding the error has painted.
 *
 * `preventScroll` is load-bearing: `focus()` scrolls by default, which fights
 * the smooth `scrollIntoView` and lands the field at the top edge under a
 * sticky header instead of centred.
 */
export function focusFirstInvalid(root: HTMLElement | null | undefined): boolean {
  if (!root) return false;
  // Stepped forms keep every panel mounted and hide the inactive ones, so the
  // first match in document order is frequently inside a `hidden` panel — which
  // cannot be scrolled to and cannot take focus. Skip those.
  const target = Array.from(
    root.querySelectorAll<HTMLElement>("[aria-invalid='true'], [data-invalid='true']"),
  ).find((el) => !el.closest("[hidden]"));
  if (!target) return false;

  target.scrollIntoView({ block: "center", behavior: "smooth" });
  // A wrapper marked `data-invalid` is not itself focusable; focus the first
  // control inside it.
  const focusable = target.matches("input, select, textarea, button, [tabindex]")
    ? target
    : target.querySelector<HTMLElement>("input, select, textarea, button, [tabindex]");
  focusable?.focus({ preventScroll: true });
  return true;
}

/**
 * The same, deferred to after the next paint — use this when the failed submit
 * also switches step, because the invalid control is not in the DOM until the
 * new step has rendered.
 */
export function focusFirstInvalidAfterPaint(getRoot: () => HTMLElement | null | undefined): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => focusFirstInvalid(getRoot()));
  });
}
