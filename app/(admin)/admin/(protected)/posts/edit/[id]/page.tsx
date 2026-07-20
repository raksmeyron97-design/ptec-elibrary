// app/admin/posts/edit/[id]/page.tsx
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import PostForm, { type PostInitial } from "@/components/admin/posts/PostForm";
import { normalizeCategory, normalizeStatus, normalizeVisibility } from "@/lib/admin/posts-shared";
import { eventColumnsAvailable } from "@/lib/posts-data";

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = createServiceClient();

  // Event columns exist only after migration 0099; probe so the edit form still
  // loads (rather than 404-ing every post) in the pre-migration window. Typed
  // as plain string so supabase-js skips literal-type parsing of the dynamic
  // column list.
  const withEvents = await eventColumnsAvailable();
  const editSelect: string = `
      id, title, slug, category, excerpt, content, cover_url, cover_urls, cover_meta,
      status, scheduled_at, visibility, seo_title, seo_description, og_image, tags, created_at,
      featured${withEvents ? `, event_start_at, event_end_at, event_location, event_format,
      event_registration_url, event_registration_deadline, event_status_override` : ""}
    `;
  const { data } = await supabase
    .from("posts")
    .select(editSelect)
    .eq("id", id)
    .single();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const post = data as any;

  if (!post) notFound();

  // Resolve to array — prefer cover_urls, fall back to cover_url string
  const coverUrls: string[] =
    Array.isArray(post.cover_urls) && (post.cover_urls as string[]).length > 0
      ? (post.cover_urls as string[])
      : post.cover_url
        ? [post.cover_url]
        : [];

  const initial: PostInitial = {
    id: post.id,
    title: post.title,
    slug: post.slug,
    category: normalizeCategory(post.category),
    excerpt: post.excerpt ?? null,
    content: post.content,
    coverUrls,
    coverMeta: (post.cover_meta as PostInitial["coverMeta"]) ?? {},
    tags: Array.isArray(post.tags) ? (post.tags as string[]) : [],
    status: normalizeStatus(post.status),
    scheduledAt: post.scheduled_at ?? null,
    visibility: normalizeVisibility(post.visibility),
    seoTitle: post.seo_title ?? null,
    seoDescription: post.seo_description ?? null,
    ogImage: post.og_image ?? null,
    featured: !!post.featured,
    eventStartAt: post.event_start_at ?? null,
    eventEndAt: post.event_end_at ?? null,
    eventLocation: post.event_location ?? null,
    eventFormat: post.event_format ?? null,
    eventRegistrationUrl: post.event_registration_url ?? null,
    eventRegistrationDeadline: post.event_registration_deadline ?? null,
    eventStatusOverride: post.event_status_override ?? null,
    createdAt: post.created_at ?? null,
  };

  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  let authorName = "You";
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle();
    authorName = profile?.full_name ?? profile?.email ?? "You";
  }

  return (
    <div className="mx-auto max-w-[1280px] space-y-8">
      <PostForm initial={initial} authorName={authorName} />
    </div>
  );
}
