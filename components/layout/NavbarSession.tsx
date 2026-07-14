"use client";

import { useTranslations } from "next-intl";
import { useSession } from "@/components/providers/SessionProvider";
import NavbarClient from "./NavbarClient";
import NotificationBell from "@/components/ui/notifications/NotificationBell";

/**
 * The only part of the navbar that depends on who is looking. Kept client-side
 * so the surrounding page HTML is identical for every visitor and can be served
 * from the CDN — see components/providers/SessionProvider.tsx.
 *
 * THE PLACEHOLDER MUST MATCH THE LOG-IN BUTTON'S BOX, exactly. PriorityNav
 * measures the actions zone once on mount to decide how many nav items fit
 * before collapsing the rest into "More". A placeholder narrower than the real
 * control makes it over-estimate the space available, so the items never
 * collapse and the navbar overflows — that regressed the km @1024 layout, where
 * the Khmer labels are widest. Reserving the log-in button's footprint (the
 * anonymous case, which is both the common one and the wider of the two) keeps
 * the measurement honest; a signed-in user's avatar is narrower, which only ever
 * frees space.
 *
 * Rendering the placeholder instead of the signed-out state also stops the
 * log-in button flashing at users who are, in fact, signed in.
 */
export default function NavbarSession() {
  const t = useTranslations("nav");
  const { user, loading } = useSession();

  if (loading) {
    return (
      <span
        aria-hidden
        // Same layout classes as NavbarClient's logged-out <NextLink>, so the
        // box is identical: same padding, same font metrics, same lg+ gate.
        // The label is rendered but invisible, which is what makes the width
        // match in both English and Khmer without hardcoding a number.
        className="hidden lg:inline-flex min-h-11 animate-pulse items-center whitespace-nowrap rounded-lg bg-divider/60 px-6 py-2.5 text-[14px] font-semibold"
      >
        <span className="invisible">{t("login")}</span>
      </span>
    );
  }

  return (
    <>
      {user && (
        <div className="hidden lg:block">
          <NotificationBell userId={user.id} userRole={user.role} />
        </div>
      )}
      <NavbarClient user={user} />
    </>
  );
}
