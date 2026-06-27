// app/admin/(protected)/logs/page.tsx
import { createServiceClient } from "@/lib/supabase/server";

export default async function AdminLogsPage() {
  const supabase = createServiceClient();

  // Fetch recent download logs joined with profiles and books
  const { data: downloadLogs } = await supabase
    .from("download_logs")
    .select(`
      id,
      downloaded_at,
      user:profiles ( email, full_name ),
      book:books ( title )
    `)
    .order("downloaded_at", { ascending: false })
    .limit(50);

  // Fetch recent view logs joined with profiles and books
  // Note: content_id might not always be a book, but we'll try to join with books.
  const { data: rawViewLogs } = await supabase
    .from("view_logs")
    .select(`
      id,
      viewed_at,
      content_id,
      content_type,
      user:profiles ( email, full_name )
    `)
    .eq("content_type", "book") // only show book views for now
    .order("viewed_at", { ascending: false })
    .limit(50);

  // Fetch book titles for the view logs
  const bookIds = Array.from(new Set(rawViewLogs?.map((log: any) => log.content_id) || []));
  const { data: viewBooks } = await supabase
    .from("books")
    .select("id, title")
    .in("id", bookIds);

  const bookTitleMap = new Map(viewBooks?.map((b: any) => [b.id, b.title]));

  const viewLogs = rawViewLogs?.map((log: any) => ({
    ...log,
    book: { title: bookTitleMap.get(log.content_id) || "Unknown Book" }
  }));

  return (
    <div className="mx-auto max-w-[1100px] space-y-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-text-heading">Security Logs</h1>
        <p className="text-sm text-text-secondary">
          Monitor recent book views and downloads.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Download Logs */}
        <div className="bg-bg-surface border border-divider rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-divider bg-bg-surface/50">
            <h2 className="font-semibold text-text-heading">Recent Downloads</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-bg-surface text-text-secondary">
                <tr>
                  <th className="px-5 py-3 font-medium">Time</th>
                  <th className="px-5 py-3 font-medium">User</th>
                  <th className="px-5 py-3 font-medium">Book</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider">
                {downloadLogs?.map((log: any) => (
                  <tr key={log.id} className="hover:bg-bg-app/50 transition-colors">
                    <td className="px-5 py-3 text-text-secondary whitespace-nowrap">
                      {new Date(log.downloaded_at).toLocaleString()}
                    </td>
                    <td className="px-5 py-3">
                      <div className="font-medium text-text-heading">
                        {log.user?.full_name || "Unknown"}
                      </div>
                      <div className="text-xs text-text-secondary">{log.user?.email}</div>
                    </td>
                    <td className="px-5 py-3 text-text-heading max-w-[200px] truncate" title={log.book?.title}>
                      {log.book?.title || "Unknown Book"}
                    </td>
                  </tr>
                ))}
                {!downloadLogs?.length && (
                  <tr>
                    <td colSpan={3} className="px-5 py-8 text-center text-text-secondary">
                      No recent downloads.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* View Logs */}
        <div className="bg-bg-surface border border-divider rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-divider bg-bg-surface/50">
            <h2 className="font-semibold text-text-heading">Recent Views</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-bg-surface text-text-secondary">
                <tr>
                  <th className="px-5 py-3 font-medium">Time</th>
                  <th className="px-5 py-3 font-medium">User</th>
                  <th className="px-5 py-3 font-medium">Book</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider">
                {viewLogs?.map((log: any) => (
                  <tr key={log.id} className="hover:bg-bg-app/50 transition-colors">
                    <td className="px-5 py-3 text-text-secondary whitespace-nowrap">
                      {new Date(log.viewed_at).toLocaleString()}
                    </td>
                    <td className="px-5 py-3">
                      {log.user ? (
                        <>
                          <div className="font-medium text-text-heading">
                            {log.user.full_name || "Unknown"}
                          </div>
                          <div className="text-xs text-text-secondary">{log.user.email}</div>
                        </>
                      ) : (
                        <span className="text-text-secondary italic">Anonymous / System</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-text-heading max-w-[200px] truncate" title={log.book?.title}>
                      {log.book?.title || "Unknown Book"}
                    </td>
                  </tr>
                ))}
                {!viewLogs?.length && (
                  <tr>
                    <td colSpan={3} className="px-5 py-8 text-center text-text-secondary">
                      No recent views.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
