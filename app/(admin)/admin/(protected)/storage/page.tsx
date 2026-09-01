
import type { Metadata } from "next";

import { getStorageSummaryAction } from "@/app/actions/storage";
import StorageClient from "./_components/StorageClient";
import { requireRouteAccess } from "@/lib/admin/route-guard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Storage - PTEC Library",
  robots: { index: false, follow: false },
};

export default async function AdminStoragePage() {
  /* READ opens the browser: folders, files, previews, the trash listing.
     Uploading, moving, renaming and trashing are `storage: write`; emptying the
     trash for good is `storage_manage`, a separate and higher-trust row.

     `can` comes from the guard's own resolution, so these two questions cost no
     extra round-trip — and, unlike the hand-rolled `perms.storage === "write"`
     this replaces, they short-circuit for super admins exactly as the server
     guards do, so the page cannot hide a control the action would allow. */
  const { can } = await requireRouteAccess("storage.browse");
  const canWrite = can("storage.upload");
  const canPurge = can("storage.purge");

  const summaryResult = await getStorageSummaryAction();

  return (
    <StorageClient
      initialSummary={summaryResult.ok ? summaryResult.data : null}
      summaryUnavailable={!summaryResult.ok}
      canWrite={canWrite}
      canPurge={canPurge}
    />
  );
}
