/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
// app/admin/catalogs/add/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import AddBookWizard from "./AddBookWizard";
export default async function AddCatalogBookPage() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect("/auth/login?callbackUrl=/admin/catalogs/add");

  const supabase = createServiceClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const librarianRoles = ["librarian", "admin", "super_admin"];
  if (!librarianRoles.includes(profile?.role ?? "")) redirect("/catalogs");

  const { data: catRows } = await supabase
    .from("catalog_books")
    .select("category")
    .not("category", "is", null)
    .limit(200);
  const categories = [...new Set((catRows ?? []).map((r: any) => r.category).filter(Boolean))].sort();

  return (
    <section className="min-h-screen bg-paper px-4 py-8 md:px-12">
      <div className="mx-auto max-w-[760px]">
        <AddBookWizard categories={categories} />
      </div>
    </section>
  );
}