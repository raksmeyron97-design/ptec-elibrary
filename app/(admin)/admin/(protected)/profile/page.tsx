import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AdminProfileClient from "@/components/admin/AdminProfileClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Profile — Admin",
};

export default async function AdminProfilePage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/admin/login");

  const supabaseService = createServiceClient();
  const { data: profile } = await supabaseService
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", user.id)
    .single();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-text-heading">My Profile</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage your personal information and password.</p>
      </div>
      <AdminProfileClient
        user={{
          id: user.id,
          email: user.email ?? "",
          full_name: profile?.full_name ?? null,
          avatar_url: profile?.avatar_url ?? null,
        }}
      />
    </div>
  );
}
