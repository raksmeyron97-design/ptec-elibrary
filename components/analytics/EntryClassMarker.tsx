"use client";

import { useEffect } from "react";
import { landingEntryClass } from "@/lib/analytics/entry-class";

/**
 * Records how this tab's session began (search / social / referral / direct /
 * internal) on the page it LANDED on, so a book opened three clicks later
 * still knows. Mounted once in RootShell; renders nothing, reads no headers,
 * so prerendering is untouched. Only the class is stored — never the referrer.
 */
export default function EntryClassMarker() {
  useEffect(() => {
    landingEntryClass();
  }, []);
  return null;
}
