// Which language should a sign-in page speak to a reader who never chose one?
//
// /auth/* sits outside the [locale] tree, so it renders in whatever the
// `ptec_locale` cookie says — and only the language switcher writes that
// cookie. A Khmer reader who arrived on /km directly and never touched the
// switcher was therefore sent to an ENGLISH sign-in page from every "Sign in"
// on the Khmer site. The request already says where they came from: the
// callbackUrl we put on the redirect, or, for a plain "Login" link, the
// Referer. This reads those, and nothing else.
//
// Pure (no Next imports) so middleware and the unit test share it.

export const LOCALE_COOKIE = "ptec_locale";

/** A path is Khmer when its first segment is exactly `km`. */
function isKhmerPath(path: string): boolean {
  return path === "/km" || path.startsWith("/km/") || path.startsWith("/km?") || path.startsWith("/km#");
}

/**
 * @returns "km" when the request came from — or is going back to — the Khmer
 *   site; null when there is nothing to infer (English is already the
 *   default) or when the reader has already chosen (the cookie wins).
 */
export function inferAuthLocale(input: {
  cookie?: string | null;
  callbackUrl?: string | null;
  referer?: string | null;
  host?: string | null;
}): "km" | null {
  // An explicit choice is never overridden.
  if (input.cookie === "km" || input.cookie === "en") return null;

  // Where the reader is going back to is the strongest signal. Only a
  // same-site relative path counts — the login flow rejects anything else.
  const callback = input.callbackUrl?.trim();
  if (callback && callback.startsWith("/") && !callback.startsWith("//")) {
    return isKhmerPath(callback) ? "km" : null;
  }

  // Otherwise, where they came from — but only from this site.
  if (input.referer && input.host) {
    try {
      const ref = new URL(input.referer);
      if (ref.host.toLowerCase() === input.host.toLowerCase() && isKhmerPath(ref.pathname)) {
        return "km";
      }
    } catch {
      // A malformed Referer says nothing.
    }
  }
  return null;
}
