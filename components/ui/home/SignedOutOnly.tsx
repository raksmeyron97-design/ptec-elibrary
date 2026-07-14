"use client";

import type { ReactNode } from "react";
import { useSession } from "@/components/providers/SessionProvider";

/**
 * Hides public content from signed-in users, without making the page dynamic.
 *
 * The alternative — deciding on the server — costs a cookie read, and one cookie
 * read anywhere in a route's tree makes that route render per request. For
 * content that is public anyway (marketing copy, a signup CTA) the visibility
 * rule is cosmetic, so it belongs on the client.
 *
 * Do NOT use this to hide anything a signed-out user must not see: the markup is
 * in the HTML for everyone. It is a display rule, not an access control.
 */
export default function SignedOutOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useSession();

  // Render during load: for the overwhelmingly common anonymous visitor this
  // means no flash and no layout shift. Signed-in users see it disappear once
  // /api/me answers.
  if (!loading && user) return null;

  return <>{children}</>;
}
