"use client";

import { useState, useCallback, useTransition, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { createComment, deleteComment } from "@/app/actions/post-comments";

interface CommentAuthor {
  full_name: string | null;
  email: string | null;
}

interface Comment {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
  parent_id: string | null;
  author: CommentAuthor | null;
}

interface Props {
  postId: string;
  postSlug: string;
  initialComments: Comment[];
  commentCount: number;
  currentUserId: string | null;
  isAdmin: boolean;
}

function getInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}

function getAuthorName(author: CommentAuthor | null): string {
  return author?.full_name ?? author?.email ?? "Anonymous";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function CommentForm({
  postId,
  postSlug,
  parentId,
  onSuccess,
  onCancel,
  placeholder,
}: {
  postId: string;
  postSlug: string;
  parentId?: string | null;
  onSuccess: () => void;
  onCancel?: () => void;
  placeholder?: string;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createComment(postId, postSlug, body, parentId);
      if (result.error) {
        setError(result.error);
      } else {
        setBody("");
        onSuccess();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder ?? "Write a comment…"}
        rows={3}
        disabled={isPending}
        maxLength={2000}
        className="w-full resize-none rounded-xl border border-divider bg-paper px-4 py-3 text-sm text-text-heading font-sans leading-relaxed outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10 disabled:opacity-60 placeholder:text-text-muted"
      />
      {error && (
        <p className="text-xs text-red-600 font-sans">{error}</p>
      )}
      <div className="flex items-center gap-2 justify-end">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="px-3 py-1.5 rounded-lg text-sm text-text-muted hover:text-text-heading transition-colors cursor-pointer disabled:opacity-60"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isPending || !body.trim()}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-brand text-white rounded-lg text-sm font-semibold transition-all hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {isPending ? (
            <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          )}
          {parentId ? "Reply" : "Post"}
        </button>
      </div>
    </form>
  );
}

function CommentItem({
  comment,
  replies,
  currentUserId,
  isAdmin,
  postId,
  postSlug,
  onReplySuccess,
}: {
  comment: Comment;
  replies: Comment[];
  currentUserId: string | null;
  isAdmin: boolean;
  postId: string;
  postSlug: string;
  onReplySuccess: () => void;
}) {
  const [showReply, setShowReply] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [isDeleting, startDeleting] = useTransition();
  const router = useRouter();
  const supabase = createClient();

  const authorName = getAuthorName(comment.author);
  const canDelete = isAdmin || comment.user_id === currentUserId;

  function handleDelete() {
    if (!confirm("Delete this comment?")) return;
    startDeleting(async () => {
      const res = await deleteComment(comment.id, postSlug);
      if (!res.error) setDeleted(true);
    });
  }

  async function handleReplyClick() {
    if (!currentUserId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
    }
    setShowReply((v) => !v);
  }

  if (deleted) return null;

  return (
    <div className="flex gap-3">
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full bg-brand flex items-center justify-center text-white text-sm font-bold flex-none shrink-0 mt-0.5">
        {getInitial(authorName)}
      </div>

      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="font-semibold text-text-heading text-sm font-sans">{authorName}</span>
          {isAdmin && comment.user_id !== currentUserId && (
            <span className="text-[10px] font-bold text-white bg-brand px-1.5 py-0.5 rounded-full">Admin</span>
          )}
          <span className="text-text-muted text-xs font-sans">{timeAgo(comment.created_at)}</span>
        </div>

        {/* Body */}
        <p className="text-text-body text-sm font-sans leading-relaxed whitespace-pre-wrap mb-2">{comment.body}</p>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleReplyClick}
            className="text-xs text-text-muted hover:text-brand transition-colors cursor-pointer font-semibold font-sans"
          >
            Reply
          </button>
          {canDelete && (
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="text-xs text-red-500 hover:text-red-700 transition-colors cursor-pointer font-semibold font-sans disabled:opacity-60"
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </button>
          )}
        </div>

        {/* Reply form */}
        {showReply && (
          <div className="mt-3">
            <CommentForm
              postId={postId}
              postSlug={postSlug}
              parentId={comment.id}
              placeholder={`Reply to ${authorName}…`}
              onSuccess={() => { setShowReply(false); onReplySuccess(); }}
              onCancel={() => setShowReply(false)}
            />
          </div>
        )}

        {/* Replies */}
        {replies.length > 0 && (
          <div className="mt-4 flex flex-col gap-4 pl-3 border-l-2 border-divider">
            {replies.map((reply) => (
              <div key={reply.id} className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-brand text-xs font-bold flex-none shrink-0 mt-0.5">
                  {getInitial(getAuthorName(reply.author))}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-semibold text-text-heading text-sm font-sans">{getAuthorName(reply.author)}</span>
                    <span className="text-text-muted text-xs font-sans">{timeAgo(reply.created_at)}</span>
                  </div>
                  <p className="text-text-body text-sm font-sans leading-relaxed whitespace-pre-wrap">{reply.body}</p>
                  {(isAdmin || reply.user_id === currentUserId) && (
                    <button
                      onClick={() => {
                        if (!confirm("Delete this reply?")) return;
                        deleteComment(reply.id, postSlug);
                      }}
                      className="mt-1 text-xs text-red-500 hover:text-red-700 transition-colors cursor-pointer font-semibold font-sans"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CommentsSection({
  postId,
  postSlug,
  initialComments,
  commentCount,
  currentUserId,
  isAdmin,
}: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [refreshKey, setRefreshKey] = useState(0);

  const topLevel = comments.filter((c) => !c.parent_id);
  const replies  = (parentId: string) => comments.filter((c) => c.parent_id === parentId);

  // Re-fetch comments after mutation
  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from("post_comments")
      .select("id, body, created_at, user_id, parent_id, author:profiles!user_id(full_name, email)")
      .eq("post_id", postId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true });
    if (data) setComments(data as unknown as Comment[]);
    setRefreshKey((k) => k + 1);
  }, [supabase, postId]);

  async function handleAddClick() {
    if (!currentUserId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
    }
  }

  return (
    <section className="mt-12 pt-8 border-t border-divider">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-brand">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
        </svg>
        <h2 className="font-khmer-serif font-bold text-text-heading text-xl m-0">
          មតិយោបល់
          {comments.filter(c => !c.parent_id).length > 0 && (
            <span className="ml-2 text-sm font-sans font-normal text-text-muted">
              ({comments.filter(c => !c.parent_id).length})
            </span>
          )}
        </h2>
      </div>

      {/* Comment form */}
      {currentUserId ? (
        <div className="mb-8 bg-bg-surface border border-divider rounded-2xl p-5 shadow-sm">
          <p className="text-sm font-semibold text-text-body mb-3 font-sans">សរសេរមតិយោបល់</p>
          <CommentForm
            postId={postId}
            postSlug={postSlug}
            onSuccess={refresh}
            placeholder="Share your thoughts…"
          />
        </div>
      ) : (
        <div
          onClick={handleAddClick}
          className="mb-8 flex items-center gap-3 bg-bg-surface border border-dashed border-divider rounded-2xl p-5 cursor-pointer hover:border-brand hover:bg-blue-50/40 transition-all group"
        >
          <div className="w-9 h-9 rounded-full bg-paper border border-divider flex items-center justify-center shrink-0 group-hover:border-brand group-hover:bg-brand group-hover:text-white transition-all">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-text-heading font-sans group-hover:text-brand transition-colors">
              Login to comment
            </p>
            <p className="text-xs text-text-muted font-sans">Join the conversation — sign in to share your thoughts</p>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="ml-auto text-text-muted group-hover:text-brand transition-colors shrink-0">
            <path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>
          </svg>
        </div>
      )}

      {/* Comments list */}
      {topLevel.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 rounded-full bg-paper border border-divider flex items-center justify-center mb-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="text-text-muted">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
          </div>
          <p className="font-khmer-serif font-semibold text-text-muted">មិនទាន់មានមតិ</p>
          <p className="text-xs text-text-muted font-sans mt-1">Be the first to share your thoughts!</p>
        </div>
      ) : (
        <div key={refreshKey} className="flex flex-col gap-6">
          {topLevel.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              replies={replies(comment.id)}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              postId={postId}
              postSlug={postSlug}
              onReplySuccess={refresh}
            />
          ))}
        </div>
      )}
    </section>
  );
}
