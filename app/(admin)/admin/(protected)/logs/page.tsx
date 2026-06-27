import { createServiceClient } from "@/lib/supabase/server";
import SecurityLogsClient, { type LogRow, type LogStats } from "./SecurityLogsClient";

export default async function AdminLogsPage() {
  const supabase = createServiceClient();

  const [{ data: downloadLogs }, { data: rawViewLogs }] = await Promise.all([
    supabase
      .from("download_logs")
      .select(`id, downloaded_at, user:profiles(email, full_name, avatar_url)`)
      .order("downloaded_at", { ascending: false })
      .limit(200),

    supabase
      .from("view_logs")
      .select(`id, viewed_at, content_id, content_type, user:profiles(email, full_name, avatar_url)`)
      .eq("content_type", "book")
      .order("viewed_at", { ascending: false })
      .limit(200),
  ]);

  // Fetch book titles for view logs
  const bookIds = [...new Set((rawViewLogs ?? []).map((l: any) => l.content_id))];
  const { data: viewBooks } = bookIds.length
    ? await supabase.from("books").select("id, title").in("id", bookIds)
    : { data: [] };

  const bookTitleMap = new Map((viewBooks ?? []).map((b: any) => [b.id, b.title as string]));

  // Also fetch book titles for download_logs via a separate join
  const dlBookIds = [...new Set((downloadLogs ?? []).map((l: any) => l.book_id).filter(Boolean))];
  const { data: dlBooks } = dlBookIds.length
    ? await supabase.from("books").select("id, title").in("id", dlBookIds)
    : { data: [] };

  const dlBookTitleMap = new Map((dlBooks ?? []).map((b: any) => [b.id, b.title as string]));

  // Normalize download logs
  const dlRows: LogRow[] = (downloadLogs ?? []).map((l: any) => ({
    id: l.id,
    type: "download",
    name: l.user?.full_name || "Unknown",
    email: l.user?.email || "",
    book: dlBookTitleMap.get(l.book_id) || "Unknown Book",
    time: l.downloaded_at,
    isAnon: !l.user,
    avatarUrl: l.user?.avatar_url,
  }));

  // Normalize view logs
  const vwRows: LogRow[] = (rawViewLogs ?? []).map((l: any) => ({
    id: l.id,
    type: "view",
    name: l.user?.full_name || "Anonymous",
    email: l.user?.email || "unauthenticated session",
    book: bookTitleMap.get(l.content_id) || "Unknown Book",
    time: l.viewed_at,
    isAnon: !l.user,
    avatarUrl: l.user?.avatar_url,
  }));

  // Merge and sort by recency
  const allLogs = [...dlRows, ...vwRows].sort(
    (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
  );

  // Compute 24h stats
  const downloads24h = dlRows.filter(
    (r) => new Date(r.time).getTime() > Date.now() - 86_400_000
  ).length;

  const views24h = vwRows.filter(
    (r) => new Date(r.time).getTime() > Date.now() - 86_400_000
  ).length;

  const recentDlUserIds = new Set(
    (downloadLogs ?? [])
      .filter((l: any) => l.user && new Date(l.downloaded_at).getTime() > Date.now() - 86_400_000)
      .map((l: any) => l.user?.email)
      .filter(Boolean)
  );
  const recentVwUserIds = new Set(
    (rawViewLogs ?? [])
      .filter((l: any) => l.user && new Date(l.viewed_at).getTime() > Date.now() - 86_400_000)
      .map((l: any) => l.user?.email)
      .filter(Boolean)
  );
  const activeUsers = new Set([...recentDlUserIds, ...recentVwUserIds]).size;

  const stats: LogStats = { downloads24h, views24h, activeUsers };

  return <SecurityLogsClient logs={allLogs} stats={stats} />;
}
