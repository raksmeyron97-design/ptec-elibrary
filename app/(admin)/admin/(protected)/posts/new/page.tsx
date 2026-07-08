// app/admin/posts/new/page.tsx
import { createClient } from "@/lib/supabase/server";
import PostForm from "@/components/admin/posts/PostForm";

export default async function NewPostPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let authorName = "You";
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle();
    authorName = profile?.full_name ?? profile?.email ?? "You";
  }

  return (
    <div className="mx-auto max-w-[1280px] space-y-8">
      <PostForm authorName={authorName} />
    </div>
  );
}
