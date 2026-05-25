// app/admin/posts/new/page.tsx
import Link from "next/link";
import Icon from "@/components/ui/Icon";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PostForm from "../PostForm";

export default async function NewPostPage() {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) redirect("/auth/login?callbackUrl=/admin/posts/new");

  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, email")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") redirect("/books");

  return (
    <section className="min-h-screen bg-slate-50 px-6 py-10 md:px-12">
      <div className="mx-auto max-w-[1100px] space-y-8">

        {/* Header */}
        <div className="flex flex-col gap-4 rounded-xl bg-[#0a1629] p-6 text-white md:flex-row md:items-center md:justify-between md:p-8">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm text-cyan-100">
              <Icon name="pdf" className="text-base" />
              Posts administration
            </div>
            <h1 className="font-[family-name:var(--font-angkor)] text-3xl">New Post</h1>
            <p className="mt-2 text-sm text-slate-300">
              Logged in as{" "}
              <span className="font-semibold text-cyan-300">{profile.email}</span>
            </p>
          </div>
          <Link
            href="/admin/posts"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-white/20 px-5 font-semibold text-white transition hover:bg-white/10"
          >
            ← All posts
          </Link>
        </div>

        {/* Create form */}
        <PostForm />

      </div>
    </section>
  );
}