// Async Server Components (not client hooks) — both current call sites
// (book/thesis detail pages) are async Server Components, matching the
// getTranslations pattern used elsewhere (e.g. components/ui/home/FaqSection.tsx).

import { ShieldCheck, Scale } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/core/Badge";

export type LicenseValue =
  | "public_domain"
  | "cc_by"
  | "cc_by_nc"
  | "cc_by_nc_nd"
  | "moeys_open"
  | "all_rights_reserved"
  | "unknown";

/** "Verified by librarian" badge — only rendered when the resource has actually been verified. */
export async function VerifiedBadge({ verifiedAt }: { verifiedAt?: string | null }) {
  if (!verifiedAt) return null;
  const t = await getTranslations("trust");

  return (
    <Badge variant="success" title={t("verifiedTooltip")}>
      <ShieldCheck className="mr-1 h-3 w-3" />
      {t("verifiedBadge")}
    </Badge>
  );
}

const HIDDEN_LICENSES = new Set(["unknown"]);

/** License badge. Hidden for "unknown" so incomplete metadata isn't presented as a claim. */
export async function LicenseBadge({ license }: { license?: string | null }) {
  const value = (license ?? "unknown") as LicenseValue;
  if (HIDDEN_LICENSES.has(value)) return null;
  const t = await getTranslations("trust");

  return (
    <Badge variant="info" title={t(`license.${value}`)}>
      <Scale className="mr-1 h-3 w-3" />
      {t(`license.${value}`)}
    </Badge>
  );
}
