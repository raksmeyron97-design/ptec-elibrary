// app/admin/users/page.tsx
import { createClient, createServiceClient } from "@/lib/supabase/server";
import UsersClient from "./UsersClient";

const PAGE_SIZE = 20;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = createServiceClient();
  const params = await searchParams;

  const page = parseInt(params.page as string || "1", 10);
  const safePage = isNaN(page) || page < 1 ? 1 : page;
  const q = (params.q as string || "").trim();

  let query = supabase
    .from("profiles")
    .select("id, full_name, email, role, created_at, avatar_url", { count: "exact" });

  if (q) {
    query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
  }

  const from = (safePage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: users, count } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  const totalItems = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  const rows = (users ?? []).map((u: any) => ({
    id:        u.id as string,
    fullName:  u.full_name as string | null,
    email:     u.email as string,
    role:      u.role as "reader" | "admin",
    createdAt: u.created_at as string,
    avatarUrl: u.avatar_url as string | null,
  }));

  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();

  return (
    <div className="mx-auto max-w-[1100px] space-y-6">
      <UsersClient 
        users={rows} 
        currentUserId={user?.id ?? ""} 
        totalItems={totalItems}
        totalPages={totalPages}
        currentPage={safePage}
        searchParams={params as Record<string, string | undefined>}
      />
    </div>
  );
}