// app/admin/posts/new/page.tsx
import { createClient } from "@/lib/supabase/server";
import PostForm from "@/components/admin/posts/PostForm";
import { requireRouteAccess } from "@/lib/admin/route-guard";

export default async function NewPostPage() {
  await requireRouteAccess("posts.create");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let authorName = "You";
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle();
    authorName = profile?.full_name ?? profile?.email ?? "You";
  }

  /* FormShell lives inside PostForm — its context sidebar previews the form's
     own live state. The route stays a data loader. */
  return (
    <PostForm
      authorName={authorName}
      pageTitle="New post"
      pageDescription="Write an article, announcement or event for the public site."
    />
  );
}
