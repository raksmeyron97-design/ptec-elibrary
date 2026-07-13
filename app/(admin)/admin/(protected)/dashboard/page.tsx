import { redirect } from "next/navigation";

/**
 * Alias: the intelligence dashboard is the admin root (/admin). This route
 * exists so /admin/dashboard links and bookmarks land in the right place,
 * with every filter param preserved.
 */
export default async function DashboardAliasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    const v = typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
    if (v !== undefined) qs.set(key, v);
  }
  const s = qs.toString();
  redirect(s ? `/admin?${s}` : "/admin");
}
