// app/admin/posts/new/page.tsx
import PostForm from "../PostForm";

export default async function NewPostPage() {
  return (
    <div className="mx-auto max-w-[1100px] space-y-8">
      {/* Create form */}
      <PostForm />
    </div>
  );
}