"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { uploadToZima } from "@/app/actions/upload";
import { createPost, updatePost } from "@/app/(admin)/admin/(protected)/posts/actions";
import { autosavePostDraft, getPostDraft, discardPostDraft, type PostDraftKey, type PostDraftPayload } from "@/app/actions/post-drafts";
import TagInput from "@/components/ui/core/TagInput";
import MarkdownEditor from "@/components/admin/posts/MarkdownEditor";
import PostSlugField from "@/components/admin/posts/PostSlugField";
import PostPublishPanel from "@/components/admin/posts/PostPublishPanel";
import PostCoverUploader, { type CoverItem } from "@/components/admin/posts/PostCoverUploader";
import SeoSettings from "@/components/admin/posts/SeoSettings";
import PostFormStickyActions from "@/components/admin/posts/PostFormStickyActions";
import PostPreviewModal from "@/components/admin/posts/PostPreviewModal";
import { SITE_URL } from "@/lib/seo/site";
import { slugify } from "@/lib/admin/posts-shared";
import { validatePost, firstValidationError, type PostValidationErrors } from "@/lib/admin/post-validation";
import type { PostCategory, PostStatus, PostVisibility } from "@/lib/admin/posts-shared";

type Phase = "idle" | "uploading" | "saving";
type AutosaveStatus = "idle" | "unsaved" | "saving" | "saved" | "error";

export type PostInitial = {
  id: string;
  title: string;
  slug: string;
  category: string;
  excerpt: string | null;
  content: string;
  coverUrls: string[];
  coverMeta: Record<string, { alt?: string; isHero?: boolean }>;
  tags: string[];
  status: PostStatus;
  scheduledAt: string | null;
  visibility: PostVisibility;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImage: string | null;
  createdAt: string | null;
};

const NEW_POST_DRAFT_KEY_STORAGE = "post-draft-key:new";

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function PostForm({ initial, authorName }: { initial?: PostInitial; authorName: string }) {
  const isEdit = !!initial;
  const editorSectionRef = useRef<HTMLDivElement>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [uploadProgress, setUploadProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editorTab, setEditorTab] = useState<"write" | "preview">("write");
  const [previewOpen, setPreviewOpen] = useState(false);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [category, setCategory] = useState<PostCategory>((initial?.category as PostCategory) ?? "Research");
  const [status, setStatus] = useState<PostStatus>(initial?.status ?? "draft");
  const [scheduledAt, setScheduledAt] = useState(toDatetimeLocal(initial?.scheduledAt ?? null));
  const [visibility, setVisibility] = useState<PostVisibility>(initial?.visibility ?? "public");
  const [seoTitle, setSeoTitle] = useState(initial?.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(initial?.seoDescription ?? "");
  const [ogImage, setOgImage] = useState(initial?.ogImage ?? "");
  const [scheduledAtError, setScheduledAtError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<PostValidationErrors>({});
  const [restoreVersion, setRestoreVersion] = useState(0);

  const [coverItems, setCoverItems] = useState<CoverItem[]>(() =>
    (initial?.coverUrls ?? []).map((url, idx) => ({
      kind: "existing",
      url,
      markedForRemoval: false,
      alt: initial?.coverMeta?.[url]?.alt ?? "",
      isHero: initial?.coverMeta?.[url]?.isHero ?? idx === 0,
    })),
  );
  const [coverError, setCoverError] = useState<string | null>(null);

  const busy = phase !== "idle";
  const wasPublished = initial?.status === "published";
  const excerptCount = excerpt.length;

  const heroUrl = useMemo(() => {
    const hero = coverItems.find((it) => it.isHero && !(it.kind === "existing" && it.markedForRemoval));
    if (!hero) return null;
    return hero.kind === "existing" ? hero.url : hero.objectUrl;
  }, [coverItems]);

  const uploadedImages = useMemo(
    () =>
      coverItems
        .filter((it): it is Extract<CoverItem, { kind: "existing" }> => it.kind === "existing" && !it.markedForRemoval)
        .map((it) => ({ url: it.url, alt: it.alt })),
    [coverItems],
  );

  // ── Autosave ────────────────────────────────────────────────────
  // Drafts are stored separately from the live `posts` row (see migration
  // 0074) — autosave must never push in-progress edits onto a published
  // post's public content.
  const [draftKey, setDraftKey] = useState<string>("");
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("idle");
  const [availableDraft, setAvailableDraft] = useState<{ payload: PostDraftPayload; updatedAt: string } | null>(null);
  const didMountAutosaveRef = useRef(false);
  const dirtyRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const payloadRef = useRef<PostDraftPayload>({});

  // New posts get a client-generated key (persisted per-tab) so autosave has
  // somewhere to write before the post exists.
  useEffect(() => {
    if (isEdit) return;
    const existing = sessionStorage.getItem(NEW_POST_DRAFT_KEY_STORAGE);
    if (existing) { setDraftKey(existing); return; }
    const key = crypto.randomUUID();
    sessionStorage.setItem(NEW_POST_DRAFT_KEY_STORAGE, key);
    setDraftKey(key);
  }, [isEdit]);

  const draftTarget: PostDraftKey | null = isEdit ? { postId: initial!.id } : draftKey ? { draftKey } : null;
  const draftTargetKey = draftTarget ? ("postId" in draftTarget ? `post:${draftTarget.postId}` : `key:${draftTarget.draftKey}`) : null;

  // Check for an existing autosaved draft once we know where to look.
  useEffect(() => {
    if (!draftTarget) return;
    getPostDraft(draftTarget).then((draft) => { if (draft) setAvailableDraft(draft); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftTargetKey]);

  // Keep a ref of the latest form state so the debounce/interval timers
  // (which don't want to re-subscribe on every keystroke) always read fresh
  // values without needing every field in their own dependency arrays.
  useEffect(() => {
    payloadRef.current = {
      title, slug, excerpt, content, category, tags, status, scheduledAt, visibility,
      seoTitle, seoDescription, ogImage,
      coverUrls: uploadedImages.map((i) => i.url),
    };
  });

  const performSave = useCallback(async () => {
    if (!draftTarget) return;
    setAutosaveStatus("saving");
    const res = await autosavePostDraft(draftTarget, payloadRef.current);
    dirtyRef.current = false;
    setAutosaveStatus(res.success ? "saved" : "error");
    if (res.success) {
      setTimeout(() => setAutosaveStatus((s) => (s === "saved" ? "idle" : s)), 2500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftTargetKey]);

  // Debounce: save 2s after the user stops changing tracked fields.
  useEffect(() => {
    if (!draftTarget) return;
    if (!didMountAutosaveRef.current) { didMountAutosaveRef.current = true; return; }
    dirtyRef.current = true;
    setAutosaveStatus("unsaved");
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(performSave, 2000);
    return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, slug, excerpt, content, category, tags, status, scheduledAt, visibility, seoTitle, seoDescription, ogImage, uploadedImages, draftTargetKey]);

  // Safety net: force a save every 25s if there's unsaved typing that keeps
  // resetting the debounce above (continuous typing for >2s at a time).
  useEffect(() => {
    const interval = setInterval(() => { if (dirtyRef.current) performSave(); }, 25_000);
    return () => clearInterval(interval);
  }, [performSave]);

  // Warn on tab close/navigation while a save is pending or in flight.
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (autosaveStatus === "unsaved" || autosaveStatus === "saving") {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [autosaveStatus]);

  function restoreDraft() {
    if (!availableDraft) return;
    const p = availableDraft.payload;
    if (typeof p.title === "string") setTitle(p.title);
    if (typeof p.slug === "string") setSlug(p.slug);
    if (typeof p.excerpt === "string") setExcerpt(p.excerpt);
    if (typeof p.content === "string") setContent(p.content);
    if (typeof p.category === "string") setCategory(p.category as PostCategory);
    if (Array.isArray(p.tags)) setTags(p.tags as string[]);
    if (typeof p.status === "string") setStatus(p.status as PostStatus);
    if (typeof p.scheduledAt === "string") setScheduledAt(p.scheduledAt);
    if (typeof p.visibility === "string") setVisibility(p.visibility as PostVisibility);
    if (typeof p.seoTitle === "string") setSeoTitle(p.seoTitle);
    if (typeof p.seoDescription === "string") setSeoDescription(p.seoDescription);
    if (typeof p.ogImage === "string") setOgImage(p.ogImage);
    setRestoreVersion((v) => v + 1);
    setAvailableDraft(null);
  }

  function discardDraft() {
    if (draftTarget) discardPostDraft(draftTarget).catch(() => {});
    setAvailableDraft(null);
  }

  function handlePreview() {
    setPreviewOpen(true);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setScheduledAtError(null);
    setFieldErrors({});

    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const intent = submitter?.value === "draft" ? "draft" : "submit";
    const effectiveStatus: PostStatus = intent === "draft" ? "draft" : status;

    const finalSlug = slugify(slug || title);
    const errors = validatePost({
      title,
      slug: finalSlug,
      category,
      content,
      excerpt,
      tags,
      status: effectiveStatus,
      scheduledAt: effectiveStatus === "scheduled" ? scheduledAt : null,
    });
    setFieldErrors(errors);
    if (errors.scheduledAt) setScheduledAtError(errors.scheduledAt);
    const firstError = firstValidationError(errors);
    if (firstError) { setError(firstError); return; }

    try {
      const newItems = coverItems.filter((it): it is Extract<CoverItem, { kind: "new" }> => it.kind === "new");

      const uploadedUrls: string[] = [];
      if (newItems.length > 0) {
        setPhase("uploading");
        const uid = Date.now().toString(36).slice(-6);
        const folder = `posts/${finalSlug}-${uid}`;
        for (let i = 0; i < newItems.length; i++) {
          setUploadProgress(`Uploading image ${i + 1} of ${newItems.length}…`);
          const { file } = newItems[i];
          const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
          const imageFile = new File([file], `image-${String(i + 1).padStart(2, "0")}.${ext}`, { type: file.type });
          const fd = new FormData();
          fd.append("file", imageFile);
          const res = await uploadToZima(fd, folder);
          if ("error" in res) throw new Error(`Image upload failed: ${res.error}`);
          uploadedUrls.push(res.publicUrl);
        }
      }

      let newIdx = 0;
      const finalUrls: string[] = [];
      const coverMeta: Record<string, { alt?: string; isHero?: boolean }> = {};
      for (const item of coverItems) {
        if (item.kind === "existing") {
          if (item.markedForRemoval) continue;
          finalUrls.push(item.url);
          coverMeta[item.url] = { alt: item.alt, isHero: item.isHero };
        } else {
          const uploadedUrl = uploadedUrls[newIdx];
          newIdx++;
          if (uploadedUrl === undefined) continue;
          finalUrls.push(uploadedUrl);
          coverMeta[uploadedUrl] = { alt: item.alt, isHero: item.isHero };
        }
      }

      setPhase("saving");
      setUploadProgress("Saving post…");

      const payload = new FormData();
      payload.set("title", title.trim());
      payload.set("slug", finalSlug);
      payload.set("category", category);
      payload.set("excerpt", excerpt);
      payload.set("content", content);
      payload.set("coverUrls", JSON.stringify(finalUrls));
      payload.set("coverMeta", JSON.stringify(coverMeta));
      payload.set("tags", JSON.stringify(tags));
      payload.set("status", effectiveStatus);
      payload.set("scheduledAt", effectiveStatus === "scheduled" && scheduledAt ? new Date(scheduledAt).toISOString() : "");
      payload.set("visibility", visibility);
      payload.set("seoTitle", seoTitle.trim());
      payload.set("seoDescription", seoDescription.trim());
      payload.set("ogImage", ogImage.trim());

      // Best-effort cleanup — fire and forget. If the save below throws a
      // real validation error the draft is already gone, but nothing in the
      // UI is lost (the user just retries the same in-memory form).
      if (draftTarget) discardPostDraft(draftTarget).catch(() => {});

      if (isEdit && initial) {
        await updatePost(initial.id, payload);
      } else {
        await createPost(payload);
      }
    } catch (err) {
      setPhase("idle");
      setUploadProgress("");
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  const dateLabel = status === "scheduled" && scheduledAt
    ? `Scheduled for ${new Date(scheduledAt).toLocaleString()}`
    : initial?.createdAt
      ? new Date(initial.createdAt).toLocaleDateString()
      : "Just now";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <h1 className="text-2xl font-bold text-text-heading">{isEdit ? "Edit post" : "New post"}</h1>

      {availableDraft && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>
            You have unsaved changes from {new Date(availableDraft.updatedAt).toLocaleString()}.
          </span>
          <span className="flex gap-2">
            <button type="button" onClick={restoreDraft} className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700">
              Restore
            </button>
            <button type="button" onClick={discardDraft} className="rounded-md border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100">
              Discard
            </button>
          </span>
        </div>
      )}

      <PostFormStickyActions
        isEdit={isEdit}
        status={status}
        scheduledAtSet={!!scheduledAt}
        wasPublished={wasPublished}
        submitting={busy}
        onPreview={handlePreview}
        autosaveStatus={autosaveStatus}
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {busy && (
        <div className="flex items-center gap-3 rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-800">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-600 border-t-transparent" />
          {uploadProgress}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        {/* ── Main column ───────────────────────────────────────── */}
        <div className="space-y-5 rounded-xl border border-divider bg-bg-surface p-5 shadow-sm sm:p-6">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-text-body">
              Title <span className="text-red-500">*</span>
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
              required
              disabled={busy}
              placeholder="Post title"
              aria-invalid={!!fieldErrors.title}
              aria-describedby={fieldErrors.title ? "title-error" : undefined}
              className="h-11 w-full rounded-lg border border-divider px-4 text-lg leading-relaxed outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15 disabled:bg-paper disabled:opacity-60 aria-[invalid=true]:border-red-400"
            />
            {fieldErrors.title && (
              <p id="title-error" className="mt-1 text-xs text-red-600">{fieldErrors.title}</p>
            )}
          </label>

          <PostSlugField
            title={title}
            slug={slug}
            onSlugChange={setSlug}
            postId={initial?.id}
            disabled={busy}
            siteUrl={SITE_URL}
          />

          <label className="block">
            <span className="mb-1 flex items-center justify-between text-sm font-semibold text-text-body">
              Excerpt
              <span className={`font-normal ${excerptCount > 160 ? "text-amber-600" : "text-text-muted"}`}>
                {excerptCount}/160
              </span>
            </span>
            <textarea
              rows={2}
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              disabled={busy}
              placeholder="Short summary shown on cards and search results…"
              className="w-full resize-none rounded-lg border border-divider p-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15 disabled:bg-paper disabled:opacity-60"
            />
            <p className="mt-1 text-xs text-text-muted">
              {excerpt.trim() ? "Recommended length: 120–160 characters." : "Excerpt will be auto-generated from content if left empty."}
            </p>
          </label>

          <div ref={editorSectionRef}>
            <MarkdownEditor
              name="content"
              value={content}
              onChange={setContent}
              disabled={busy}
              required
              tab={editorTab}
              onTabChange={setEditorTab}
              images={uploadedImages}
            />
          </div>
        </div>

        {/* ── Sidebar ───────────────────────────────────────────── */}
        <div className="space-y-5">
          <PostPublishPanel
            status={status}
            onStatusChange={setStatus}
            scheduledAt={scheduledAt}
            onScheduledAtChange={setScheduledAt}
            scheduledAtError={scheduledAtError}
            visibility={visibility}
            onVisibilityChange={setVisibility}
            category={category}
            onCategoryChange={setCategory}
            disabled={busy}
          />

          <div className="rounded-xl border border-divider bg-bg-surface p-5 shadow-sm">
            <TagInput
              key={restoreVersion}
              name="tags"
              defaultTags={tags}
              onChange={setTags}
              disabled={busy}
              max={10}
              label="Tags"
              placeholder="e.g. education, ការអប់រំ…"
            />
          </div>

          <div className="rounded-xl border border-divider bg-bg-surface p-5 shadow-sm">
            <PostCoverUploader
              items={coverItems}
              onItemsChange={setCoverItems}
              disabled={busy}
              error={coverError}
              onError={setCoverError}
            />
          </div>

          <SeoSettings
            seoTitle={seoTitle}
            seoDescription={seoDescription}
            ogImage={ogImage}
            onSeoTitleChange={setSeoTitle}
            onSeoDescriptionChange={setSeoDescription}
            onOgImageChange={setOgImage}
            fallbackTitle={title}
            fallbackDescription={excerpt}
            fallbackImage={heroUrl}
            siteUrl={SITE_URL}
            slug={slug}
            disabled={busy}
          />
        </div>
      </div>

      {previewOpen && (
        <PostPreviewModal
          title={title}
          category={category}
          tags={tags}
          excerpt={excerpt}
          content={content}
          coverUrl={heroUrl}
          authorName={authorName}
          dateLabel={dateLabel}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </form>
  );
}
