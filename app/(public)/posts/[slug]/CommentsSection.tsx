"use client";

import { useState, useCallback, useTransition, useRef, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { createComment, deleteComment, updateComment } from "@/app/actions/post-comments";

/* ─── Types ─── */
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
  is_edited?: boolean;
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

/* ─── Helpers ─── */
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

/* ─── Avatar with gold ring ─── */
function Avatar({ name, size = "md", isAdmin }: { name: string; size?: "sm" | "md"; isAdmin?: boolean }) {
  const colors = [
    "from-[#DDB022] to-[#d97706]",
    "from-[#4f46e5] to-[#7c3aed]",
    "from-[#0e7490] to-[#0f9d6b]",
    "from-[#db2777] to-[#9333ea]",
  ];
  const idx = name.charCodeAt(0) % colors.length;
  const dim = size === "sm" ? "w-7 h-7 text-xs" : "w-9 h-9 text-sm";
  return (
    <div className={`relative flex-none shrink-0`}>
      <div className={`${dim} rounded-full bg-gradient-to-br ${colors[idx]}
                       flex items-center justify-center text-white font-bold
                       ring-2 ring-white/80 shadow-sm`}>
        {getInitial(name)}
      </div>
      {isAdmin && (
        <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full
                         bg-[#DDB022] border-2 border-white flex items-center justify-center">
          <svg width="7" height="7" viewBox="0 0 24 24" fill="white">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
        </span>
      )}
    </div>
  );
}

/* ─── Heart reaction button ─── */
function HeartButton({ count, liked, onToggle, disabled }: {
  count: number; liked: boolean; onToggle: () => void; disabled?: boolean;
}) {
  const [burst, setBurst] = useState(false);
  const handle = () => {
    // Always fire onToggle — when not logged in it redirects to /login
    if (!liked && !disabled) { setBurst(true); setTimeout(() => setBurst(false), 600); }
    onToggle();
  };
  return (
    <button
      type="button"
      onClick={handle}
      className={`cmnt-heart-btn group relative inline-flex items-center gap-1
                  text-xs font-semibold transition-all duration-200
                  ${disabled ? "opacity-40 cursor-not-allowed" : ""}
                  ${liked ? "text-rose-500" : "text-text-muted hover:text-rose-400"}`}
    >
      <span className={`relative transition-transform duration-200 ${burst ? "scale-125" : "scale-100"}`}>
        {/* burst particles */}
        {burst && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {[0,60,120,180,240,300].map((deg) => (
              <span key={deg}
                className="absolute w-1 h-1 rounded-full bg-rose-400 cmnt-particle"
                style={{ "--deg": `${deg}deg` } as React.CSSProperties}
              />
            ))}
          </span>
        )}
        <svg width="13" height="13" viewBox="0 0 24 24"
          fill={liked ? "currentColor" : "none"}
          stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
        </svg>
      </span>
      {count > 0 && <span className="tabular-nums">{count}</span>}
    </button>
  );
}

/* ─── Comment likes — real Supabase calls ─── */
function useCommentLikes(commentId: string, currentUserId: string | null) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [likes, setLikes] = useState(0);
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    supabase
      .rpc("get_comment_likes", { p_comment_id: commentId })
      .then(({ data }) => {
        const row = (data as { like_count: number; liked_by_me: boolean }[] | null)?.[0];
        if (row) {
          setLikes(Number(row.like_count));
          setLiked(row.liked_by_me ?? false);
        }
      });
  }, [commentId, supabase]);

  const toggle = useCallback(async () => {
    if (!currentUserId) {
      router.push("/login");
      return;
    }
    const wasLiked = liked;
    const wasCount = likes;
    // optimistic
    setLiked(!wasLiked);
    setLikes(wasLiked ? wasCount - 1 : wasCount + 1);
    const { data, error } = await supabase.rpc("toggle_comment_like", { p_comment_id: commentId });
    if (error) {
      setLiked(wasLiked);
      setLikes(wasCount);
    } else {
      // reconcile with server truth
      const serverLiked = data as boolean;
      setLiked(serverLiked);
      setLikes(serverLiked ? wasCount + 1 : wasCount - 1);
    }
  }, [commentId, currentUserId, liked, likes, router, supabase]);

  return { likes, liked, toggle };
}

/* ─── Typing indicator dots ─── */
function TypingDots() {
  return (
    <span className="inline-flex items-center gap-0.5 px-1">
      {[0,1,2].map(i => (
        <span key={i} className="w-1.5 h-1.5 rounded-full bg-[#DDB022] cmnt-typing-dot"
          style={{ animationDelay: `${i * 0.18}s` }} />
      ))}
    </span>
  );
}

/* ─── Realtime typing presence hook ─── */
function useTypingPresence(postId: string, currentUserId: string | null) {
  const supabase = useMemo(() => createClient(), []);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!currentUserId) return;
    const channel = supabase.channel(`comments:${postId}`, {
      config: { presence: { key: currentUserId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const typing: string[] = [];
        for (const [uid, entries] of Object.entries(state)) {
          if (uid !== currentUserId && Array.isArray(entries)) {
            const isTyping = entries.some(
              (e: Record<string, unknown>) => e.typing === true
            );
            if (isTyping) typing.push(uid);
          }
        }
        setTypingUsers(typing);
      })
      .subscribe();

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [postId, currentUserId, supabase]);

  const startTyping = useCallback(() => {
    channelRef.current?.track({ typing: true });
  }, []);

  const stopTyping = useCallback(() => {
    channelRef.current?.track({ typing: false });
  }, []);

  return { typingUsers, startTyping, stopTyping };
}

/* ─── Auto-grow textarea ─── */
function AutoTextarea({ value, onChange, onFocus, onBlur, placeholder, disabled, maxLength, className }: {
  value: string; onChange: (v: string) => void; onFocus?: () => void; onBlur?: () => void;
  placeholder?: string; disabled?: boolean; maxLength?: number; className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={e => onChange(e.target.value)}
      onFocus={onFocus}
      onBlur={onBlur}
      placeholder={placeholder}
      disabled={disabled}
      maxLength={maxLength}
      rows={2}
      className={`w-full resize-none overflow-hidden leading-relaxed ${className}`}
    />
  );
}

/* ─── Comment Form ─── */
function CommentForm({
  postId, postSlug, parentId, initialBody, onSuccess, onCancel, placeholder, isEdit,
  onTypingStart, onTypingStop,
}: {
  postId: string; postSlug: string; parentId?: string | null;
  initialBody?: string; onSuccess: (body?: string) => void;
  onCancel?: () => void; placeholder?: string; isEdit?: boolean;
  onTypingStart?: () => void; onTypingStop?: () => void;
}) {
  const [body, setBody] = useState(initialBody ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isFocused, setIsFocused] = useState(false);
  const charLeft = 2000 - body.length;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setError(null);
    startTransition(async () => {
      onTypingStop?.();
      if (isEdit) {
        // edit mode — just call onSuccess with new body, parent handles update
        onSuccess(body.trim());
        return;
      }
      const result = await createComment(postId, postSlug, body, parentId);
      if (result.error) { setError(result.error); }
      else { setBody(""); onSuccess(); }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className={`relative rounded-xl border bg-paper transition-all duration-200
                       ${isFocused ? "border-[#DDB022] ring-2 ring-[#DDB022]/15 shadow-sm" : "border-divider"}`}>
        <AutoTextarea
          value={body}
          onChange={setBody}
          onFocus={onTypingStart}
          onBlur={onTypingStop}
          placeholder={placeholder ?? "Share your thoughts…"}
          disabled={isPending}
          maxLength={2000}
          className="px-4 pt-3 pb-10 text-sm text-text-heading font-sans
                     outline-none bg-transparent placeholder:text-text-muted
                     disabled:opacity-60 min-h-[80px]"
        />
        {/* char counter inside box */}
        <span className={`absolute bottom-3 left-4 text-[10px] tabular-nums transition-colors
                          ${charLeft < 100 ? "text-amber-500" : "text-text-muted/50"}`}>
          {body.length > 0 && `${charLeft} left`}
        </span>
        {/* submit inside box */}
        <div className="absolute bottom-2 right-2">
          <button
            type="submit"
            disabled={isPending || !body.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold
                       bg-gradient-to-r from-[#DDB022] to-[#d97706] text-white
                       shadow-sm transition-all duration-200
                       hover:shadow-[0_2px_12px_rgba(221,176,34,0.4)] hover:brightness-105
                       disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {isPending
              ? <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
              : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
            }
            {isEdit ? "Save" : parentId ? "Reply" : "Post"}
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-red-500 font-sans px-1">{error}</p>}

      {onCancel && (
        <button type="button" onClick={onCancel} disabled={isPending}
          className="self-start text-xs text-text-muted hover:text-text-heading
                     transition-colors font-sans disabled:opacity-60">
          Cancel
        </button>
      )}
    </form>
  );
}

/* ─── Single reply row ─── */
function ReplyItem({ reply, currentUserId, isAdmin, postSlug, onDelete }: {
  reply: Comment; currentUserId: string | null; isAdmin: boolean;
  postSlug: string; onDelete: () => void;
}) {
  const { likes, liked, toggle } = useCommentLikes(reply.id, currentUserId);
  const [isDeleting, startDeleting] = useTransition();
  const [deleted, setDeleted] = useState(false);
  const authorName = getAuthorName(reply.author);
  const canDelete = isAdmin || reply.user_id === currentUserId;

  if (deleted) return null;

  return (
    <div className="flex gap-2.5 group/reply cmnt-fade-in">
      <Avatar name={authorName} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="cmnt-bubble-reply rounded-2xl rounded-tl-sm px-3.5 py-2.5
                        bg-bg-surface border border-divider/60">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-semibold text-text-heading text-xs font-sans">{authorName}</span>
            <span className="text-text-muted text-[10px] font-sans">{timeAgo(reply.created_at)}</span>
          </div>
          <p className="text-text-body text-sm font-sans leading-relaxed whitespace-pre-wrap">{reply.body}</p>
        </div>
        <div className="flex items-center gap-3 mt-1.5 pl-1">
          <HeartButton count={likes} liked={liked} onToggle={toggle} disabled={!currentUserId} />
          {canDelete && (
            <button type="button" onClick={() => {
              if (!confirm("Delete this reply?")) return;
              startDeleting(async () => {
                const res = await deleteComment(reply.id, postSlug);
                if (!res.error) { setDeleted(true); onDelete(); }
              });
            }} disabled={isDeleting}
              className="text-[11px] text-text-muted hover:text-red-500 transition-colors font-sans">
              {isDeleting ? "…" : "Delete"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Comment item ─── */
function CommentItem({
  comment, replies, currentUserId, isAdmin, postId, postSlug, onReplySuccess,
}: {
  comment: Comment; replies: Comment[]; currentUserId: string | null;
  isAdmin: boolean; postId: string; postSlug: string; onReplySuccess: () => void;
}) {
  const [showReply, setShowReply] = useState(false);
  const [showReplies, setShowReplies] = useState(true);
  const [deleted, setDeleted] = useState(false);
  const [isDeleting, startDeleting] = useTransition();
  const [isEditing, setIsEditing] = useState(false);
  const [editedBody, setEditedBody] = useState(comment.body);
  const [editError, setEditError] = useState<string | null>(null);
  const { likes, liked, toggle: toggleLike } = useCommentLikes(comment.id, currentUserId);
  const router = useRouter();
  const supabase = createClient();

  const authorName = getAuthorName(comment.author);
  const canDelete = isAdmin || comment.user_id === currentUserId;
  const canEdit   = comment.user_id === currentUserId;
  const isOwner   = comment.user_id === currentUserId;

  function handleDelete() {
    if (!confirm("Delete this comment?")) return;
    startDeleting(async () => {
      const res = await deleteComment(comment.id, postSlug);
      if (!res.error) { setDeleted(true); onReplySuccess(); }
    });
  }

  async function handleReplyClick() {
    if (!currentUserId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
    }
    setShowReply(v => !v);
  }

  if (deleted) return null;

  return (
    <div className="cmnt-fade-in flex gap-3">
      {/* Avatar col */}
      <div className="flex flex-col items-center gap-0">
        <Avatar name={authorName} size="md" isAdmin={isAdmin && comment.user_id !== currentUserId} />
        {/* thread line */}
        {(replies.length > 0 || showReply) && showReplies && (
          <div className="w-px flex-1 mt-2 bg-gradient-to-b from-[#DDB022]/30 to-transparent min-h-[20px]" />
        )}
      </div>

      <div className="flex-1 min-w-0 pb-2">
        {/* Bubble */}
        {isEditing ? (
          <div className="mb-2">
            <CommentForm
              postId={postId} postSlug={postSlug}
              initialBody={editedBody} isEdit
              onSuccess={async (newBody) => {
                if (!newBody) { setIsEditing(false); return; }
                setEditError(null);
                const res = await updateComment(comment.id, newBody, postSlug);
                if (res.error) {
                  setEditError(res.error);
                } else {
                  setEditedBody(newBody);
                  setIsEditing(false);
                }
              }}
              onCancel={() => { setIsEditing(false); setEditError(null); }}
            />
            {editError && <p className="text-xs text-red-500 font-sans px-1 mt-1">{editError}</p>}
          </div>
        ) : (
          <div className={`cmnt-bubble rounded-2xl rounded-tl-sm px-4 py-3
                           border transition-all duration-200
                           ${isOwner
                             ? "bg-[#DDB022]/5 border-[#DDB022]/20"
                             : "bg-bg-surface border-divider/70"}`}>
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-text-heading text-sm font-sans">{authorName}</span>
                {isAdmin && comment.user_id !== currentUserId && (
                  <span className="text-[9px] font-bold text-white bg-gradient-to-r
                                   from-[#DDB022] to-[#d97706] px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                    Admin
                  </span>
                )}
                {isOwner && (
                  <span className="text-[9px] font-bold text-[#806211] bg-[#DDB022]/15
                                   px-1.5 py-0.5 rounded-full border border-[#DDB022]/30 uppercase tracking-wide">
                    You
                  </span>
                )}
                <span className="text-text-muted text-xs font-sans">{timeAgo(comment.created_at)}</span>
              </div>
              {/* edit indicator — from DB is_edited flag or local edit */}
              {(comment.is_edited || editedBody !== comment.body) && (
                <span className="text-[9px] text-text-muted italic font-sans">(edited)</span>
              )}
            </div>
            <p className="text-text-body text-sm font-sans leading-relaxed whitespace-pre-wrap">
              {editedBody}
            </p>
          </div>
        )}

        {/* Action row */}
        {!isEditing && (
          <div className="flex items-center gap-3 mt-2 pl-1">
            <HeartButton count={likes} liked={liked} onToggle={toggleLike} disabled={!currentUserId} />

            <button type="button" onClick={handleReplyClick}
              className={`text-xs font-semibold font-sans transition-colors
                          ${showReply ? "text-[#DDB022]" : "text-text-muted hover:text-[#DDB022]"}`}>
              Reply
            </button>

            {canEdit && (
              <button type="button" onClick={() => setIsEditing(true)}
                className="text-xs text-text-muted hover:text-[#4f46e5] transition-colors font-sans">
                Edit
              </button>
            )}

            {canDelete && (
              <button type="button" onClick={handleDelete} disabled={isDeleting}
                className="text-xs text-text-muted hover:text-red-500 transition-colors font-sans disabled:opacity-60">
                {isDeleting ? "…" : "Delete"}
              </button>
            )}

            {replies.length > 0 && (
              <button type="button" onClick={() => setShowReplies(v => !v)}
                className="ml-auto text-xs font-semibold font-sans text-text-muted
                           hover:text-[#DDB022] transition-colors flex items-center gap-1">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                     className={`transition-transform duration-200 ${showReplies ? "rotate-180" : ""}`}>
                  <path d="M6 9l6 6 6-6"/>
                </svg>
                {showReplies ? "Hide" : `${replies.length} ${replies.length === 1 ? "reply" : "replies"}`}
              </button>
            )}
          </div>
        )}

        {/* Reply form */}
        {showReply && !isEditing && (
          <div className="mt-3 cmnt-fade-in">
            <CommentForm
              postId={postId} postSlug={postSlug} parentId={comment.id}
              placeholder={`Reply to ${authorName}…`}
              onSuccess={() => { setShowReply(false); onReplySuccess(); }}
              onCancel={() => setShowReply(false)}
            />
          </div>
        )}

        {/* Replies */}
        {replies.length > 0 && showReplies && (
          <div className="mt-3 flex flex-col gap-3 pl-2">
            {replies.map(reply => (
              <ReplyItem key={reply.id} reply={reply}
                currentUserId={currentUserId} isAdmin={isAdmin}
                postSlug={postSlug} onDelete={onReplySuccess} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main export ─── */
export default function CommentsSection({
  postId, postSlug, initialComments, currentUserId, isAdmin,
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sort, setSort] = useState<"oldest" | "newest">("oldest");
  const { typingUsers, startTyping, stopTyping } = useTypingPresence(postId, currentUserId);

  const topLevel = comments
    .filter(c => !c.parent_id)
    .sort((a, b) => {
      const d = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sort === "newest" ? -d : d;
    });
  const repliesFor = (parentId: string) =>
    comments.filter(c => c.parent_id === parentId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from("post_comments")
      .select("id, body, created_at, user_id, parent_id, is_edited, author:profiles!user_id(full_name, email)")
      .eq("post_id", postId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true });
    if (data) setComments(data as unknown as Comment[]);
    setRefreshKey(k => k + 1);
  }, [supabase, postId]);

  // ── Realtime: auto-insert new comments from other users ──
  useEffect(() => {
    const channel = supabase
      .channel(`post_comments:${postId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "post_comments", filter: `post_id=eq.${postId}` },
        () => { refresh(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, postId, refresh]);

  async function handleAddClick() {
    if (!currentUserId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
    }
  }

  const totalCount = topLevel.length;

  return (
    <section className="mt-12 pt-8 border-t border-divider">

      {/* ── Section header ── */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2.5">
          <span className="flex items-center justify-center w-7 h-7 rounded-lg
                           bg-gradient-to-br from-[#DDB022] to-[#d97706] shadow-sm">
            <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
          </span>
          <h2 className="font-khmer-serif font-bold text-text-heading text-xl m-0 leading-none">
            មតិយោបល់
          </h2>
          {totalCount > 0 && (
            <span className="rounded-full bg-[#DDB022]/15 border border-[#DDB022]/30
                             px-2.5 py-0.5 text-xs font-bold text-[#806211] tabular-nums">
              {totalCount}
            </span>
          )}
        </div>

        {/* Sort toggle */}
        {totalCount > 1 && (
          <div className="flex items-center gap-1 p-0.5 bg-bg-surface border border-divider rounded-lg">
            {(["oldest", "newest"] as const).map(s => (
              <button key={s} type="button" onClick={() => setSort(s)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold font-sans transition-all
                            ${sort === s
                              ? "bg-[#DDB022] text-white shadow-sm"
                              : "text-text-muted hover:text-text-heading"}`}>
                {s === "oldest" ? "Oldest" : "Newest"}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Comment form / login prompt ── */}
      {currentUserId ? (
        <div className="mb-8 rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm
                        relative overflow-hidden">
          {/* gold top accent line */}
          <div className="absolute top-0 left-0 right-0 h-0.5
                          bg-gradient-to-r from-[#DDB022] via-[#d97706] to-transparent" />
          <p className="text-xs font-bold text-[#806211] uppercase tracking-wider mb-3 font-sans">
            សរសេរមតិយោបល់
          </p>
          <CommentForm
            postId={postId} postSlug={postSlug} onSuccess={() => { stopTyping(); refresh(); }}
            placeholder="Share your thoughts…"
            onTypingStart={startTyping}
            onTypingStop={stopTyping}
          />
        </div>
      ) : (
        <button type="button" onClick={handleAddClick}
          className="mb-8 w-full flex items-center gap-3
                     bg-bg-surface border border-dashed border-divider rounded-2xl p-4
                     hover:border-[#DDB022] hover:bg-[#DDB022]/5 transition-all group text-left">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#DDB022]/20 to-[#d97706]/20
                          border border-[#DDB022]/30 flex items-center justify-center shrink-0
                          group-hover:from-[#DDB022] group-hover:to-[#d97706]
                          group-hover:border-transparent transition-all">
            <svg className="h-4 w-4 text-[#806211] group-hover:text-white transition-colors"
                 viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                 strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-text-heading font-sans
                          group-hover:text-[#806211] transition-colors">Login to comment</p>
            <p className="text-xs text-text-muted font-sans">Join the conversation — sign in to share your thoughts</p>
          </div>
          <svg className="ml-auto h-4 w-4 text-text-muted group-hover:text-[#DDB022]
                          transition-all group-hover:translate-x-0.5 shrink-0"
               viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
               strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>
          </svg>
        </button>
      )}

      {/* ── Comments list ── */}
      {topLevel.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#DDB022]/10 to-[#d97706]/10
                          border border-[#DDB022]/20 flex items-center justify-center mb-4">
            <svg className="h-6 w-6 text-[#DDB022]/60" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
          </div>
          <p className="font-khmer-serif font-bold text-text-heading text-base">មិនទាន់មានមតិ</p>
          <p className="text-xs text-text-muted font-sans mt-1">Be the first to share your thoughts!</p>
        </div>
      ) : (
        <div key={refreshKey} className="flex flex-col gap-5">
          {topLevel.map(comment => (
            <CommentItem
              key={comment.id}
              comment={comment}
              replies={repliesFor(comment.id)}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              postId={postId}
              postSlug={postSlug}
              onReplySuccess={refresh}
            />
          ))}
        </div>
      )}

      {/* ── Typing indicator from other users ── */}
      {typingUsers.length > 0 && (
        <div className="flex items-center gap-2 mt-4 cmnt-fade-in">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#DDB022]/30 to-[#d97706]/30
                          flex items-center justify-center text-[10px] text-[#806211] font-bold">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <div className="cmnt-bubble-reply rounded-2xl rounded-tl-sm px-3.5 py-2
                          bg-bg-surface border border-divider/60">
            <TypingDots />
          </div>
          <span className="text-[10px] text-text-muted font-sans">
            Someone is typing…
          </span>
        </div>
      )}

      {/* ── Scoped styles ── */}
      <style>{`
        .cmnt-fade-in {
          animation: cmntFadeIn 0.25s ease forwards;
        }
        @keyframes cmntFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .cmnt-typing-dot {
          animation: cmntTypingBounce 1.2s ease-in-out infinite;
        }
        @keyframes cmntTypingBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40%            { transform: translateY(-4px); opacity: 1; }
        }

        .cmnt-particle {
          animation: cmntParticleBurst 0.6s ease-out forwards;
          transform-origin: center;
        }
        @keyframes cmntParticleBurst {
          0%   { transform: rotate(var(--deg)) translateY(0) scale(1); opacity: 1; }
          100% { transform: rotate(var(--deg)) translateY(10px) scale(0); opacity: 0; }
        }

        .cmnt-heart-btn:not(:disabled):hover svg {
          filter: drop-shadow(0 0 4px rgba(244,63,94,0.5));
        }

        @media (prefers-reduced-motion: reduce) {
          .cmnt-fade-in,
          .cmnt-typing-dot,
          .cmnt-particle { animation: none !important; }
        }
      `}</style>
    </section>
  );
}