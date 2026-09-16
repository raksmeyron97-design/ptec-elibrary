import { ANNOUNCEMENT_DISMISS_SCRIPT } from "@/lib/announcements/dismiss";

/**
 * Hides already-dismissed announcements before the banner below it is painted.
 *
 * Deliberately a server component and a plain inline `<script>`, not
 * `next/script`: it has to run at THIS point in the document, while the parser
 * is still above the banner's markup, so that a row this browser dismissed is
 * never painted rather than painted and then removed. `next/script` would
 * defer it, and a deferred script is exactly the behaviour being fixed.
 *
 * `dangerouslySetInnerHTML` carries a compile-time constant and nothing else:
 * ANNOUNCEMENT_DISMISS_SCRIPT is a literal in lib/announcements/dismiss.ts,
 * no value from a request, a database row or a reader reaches it, and the one
 * runtime value the script itself touches — the dismissal list in
 * localStorage — is charset-checked there before it becomes part of a
 * selector. Same shape as RootShell's THEME_INIT_SCRIPT.
 *
 * Public routes get the nonce-free `unsafe-inline` CSP (middleware.ts), which
 * is why no hash is needed here and none is added to lib/csp.ts — unlike
 * THEME_INIT_SCRIPT, which also runs on the nonce-policy admin and auth routes.
 * This renders only inside the public layout; if it is ever needed above
 * `[locale]`, it needs a hash first.
 */
export default function AnnouncementDismissScript() {
  return (
    <script
      id="announcement-dismiss-init"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: ANNOUNCEMENT_DISMISS_SCRIPT }}
    />
  );
}
