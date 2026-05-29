// app/admin/users/page.tsx
import { createClient, createServiceClient } from "@/lib/supabase/server";
import UsersClient from "./UsersClient";

export default async function AdminUsersPage() {
  const supabase = createServiceClient();

  const { data: users } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, created_at, avatar_url")
    .order("created_at", { ascending: false });

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
      <UsersClient users={rows} currentUserId={user?.id ?? ""} />
    </div>
  );
}