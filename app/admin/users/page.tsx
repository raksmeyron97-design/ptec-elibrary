// app/admin/users/page.tsx
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import UsersClient from "./UsersClient";

export default async function AdminUsersPage() {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) redirect("/auth/login?callbackUrl=/admin/users");

  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") redirect("/books");

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

  return (
    <section className="min-h-screen bg-slate-50 px-4 py-8 md:px-10">
      <div className="mx-auto max-w-[1100px] space-y-6">

        {/* Header */}
        <div className="flex flex-col gap-4 rounded-xl bg-[#0a1629] p-6 text-white md:flex-row md:items-center md:justify-between md:p-8">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-cyan-400">
              Admin · Users
            </p>
            <h1 className="text-2xl font-bold md:text-3xl">User Management</h1>
            <p className="mt-1 text-sm text-slate-400">
              {rows.length} user{rows.length !== 1 ? "s" : ""} registered
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/admin"
              className="inline-flex h-10 items-center rounded-lg border border-white/20 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              ← Admin
            </Link>
            <Link
              href="/admin/manage"
              className="inline-flex h-10 items-center rounded-lg bg-white px-4 text-sm font-semibold text-slate-900 transition hover:bg-cyan-50"
            >
              Manage Books
            </Link>
          </div>
        </div>

        <UsersClient users={rows} currentUserId={user.id} />
      </div>
    </section>
  );
}