import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { requireRouteAccess } from "@/lib/admin/route-guard";
import { isSuperAdminViewer } from "@/lib/admin/access-policy";
import { getUserProfile } from "@/lib/admin/user-profile";
import { isProfileTab, type ProfileTab } from "@/lib/admin/user-profile-shared";
import { userLabel } from "@/lib/admin/users-shared";
import UserProfileClient from "./_components/UserProfileClient";

// A person's record: session-dependent, personal, and never a cache candidate.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "User profile - PTEC Library",
  robots: { index: false, follow: false },
};

/**
 * One reader, in full.
 *
 * The directory answers "who is in the library?". This answers "who is THIS
 * person?" — the identity, the Download Access Profile that gates their thesis
 * downloads, what they have actually done here, and every administrative action
 * taken against the account. All four were already in the database and none of
 * them were reachable from `/admin/users`.
 *
 * READ opens it; every mutation is re-checked in `../actions.ts`.
 */
export default async function AdminUserProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { userId, viewer, can } = await requireRouteAccess("users.profile");

  const { id } = await params;
  const sp = await searchParams;
  const rawTab = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: ProfileTab = isProfileTab(rawTab) ? rawTab : "overview";

  const [t, profile] = await Promise.all([
    getTranslations("adminUsers"),
    getUserProfile(id),
  ]);

  // Only a genuinely absent account 404s — a section that failed to load is
  // rendered as unavailable inside the page (see lib/admin/user-profile.ts).
  if (!profile) notFound();

  const callerIsSuperAdmin = isSuperAdminViewer(viewer);
  const targetIsSuperAdmin = profile.identity.isSuperAdmin || profile.identity.role === "super_admin";

  /* The same three reasons the directory uses, evaluated once here so the page
     and its row menu cannot disagree: the viewer needs `users: write`, nobody
     acts on their own account, and only a super admin acts on another one. */
  const canManage =
    can("users.update") &&
    profile.identity.id !== userId &&
    (!targetIsSuperAdmin || callerIsSuperAdmin);

  return (
    <UserProfileClient
      profile={profile}
      tab={tab}
      isSelf={profile.identity.id === userId}
      canManage={canManage}
      callerCanAssignAdmin={callerIsSuperAdmin}
      heading={t("profile.pageTitle", { name: userLabel(profile.identity) })}
    />
  );
}
