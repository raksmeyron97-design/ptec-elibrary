import { isZimaUrl } from "@/lib/zima";

/**
 * A team photo URL is valid if it points at library storage: Zima (current
 * uploads) or one of the legacy R2 public buckets — team photos historically
 * went to the covers bucket (NEXT_PUBLIC_R2_COVERS_URL).
 *
 * Server-side only: isZimaUrl reads ZIMA_API_URL.
 */
export function isAllowedTeamPhotoUrl(url: string): boolean {
  if (isZimaUrl(url)) return true;
  const legacyBases = [
    process.env.NEXT_PUBLIC_R2_PUBLIC_URL,
    process.env.NEXT_PUBLIC_R2_COVERS_URL,
  ];
  return legacyBases.some((base) => {
    const trimmed = base?.replace(/\/$/, "");
    return !!trimmed && url.startsWith(`${trimmed}/`);
  });
}
