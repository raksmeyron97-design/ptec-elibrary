import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requirePermission, isAdminAuthError } from "@/lib/auth/requireAdmin";
import { getAdminIdentity } from "@/lib/auth/admin-identity";
import { getStorageSummaryAction } from "@/app/actions/storage";
import StorageClient from "./StorageClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Storage - PTEC Library",
  robots: { index: false, follow: false },
};

export default async function AdminStoragePage() {
  try {
    await requirePermission("storage", "read");
  } catch (err) {
    if (isAdminAuthError(err) && err.status === 403) redirect("/admin");
    throw err;
  }

  const identity = await getAdminIdentity();
  const canWrite = identity.perms.storage === "write";
  const canPurge = identity.perms.storage_manage === "write";

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
