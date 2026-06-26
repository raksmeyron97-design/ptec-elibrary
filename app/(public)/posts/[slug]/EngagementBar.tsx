"use client";
import { useState, useCallback, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface EngagementBarProps {
  postId: string;
  viewCount: number;
  initialLikeCount: number;
  initialSaveCount: number;
  initialLiked: boolean;
  initialSaved: boolean;
}

export default function EngagementBar({
  postId,
  viewCount,
  initialLikeCount,
  initialSaveCount,
  initialLiked,
  initialSaved,
}: EngagementBarProps) {
  const router = useRouter();
  const supabase = createClient();
  const [isPending, startTransition] = useTransition();

  const [liked, setLiked] = useState(initialLiked);
  const [saved, setSaved] = useState(initialSaved);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [saveCount, setSaveCount] = useState(initialSaveCount);

  async function requireAuth(): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return false;
    }
    return true;
  }

  const onLike = useCallback(() => {
    startTransition(async () => {
      if (!(await requireAuth())) return;
      const { data, error } = await supabase.rpc("toggle_post_like", { p_post_id: postId });
      if (error) return;
      const nowLiked = data as boolean;
      setLiked(nowLiked);
      setLikeCount((c) => nowLiked ? c + 1 : Math.max(0, c - 1));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  const onSave = useCallback(() => {
    startTransition(async () => {
      if (!(await requireAuth())) return;
      const { data, error } = await supabase.rpc("toggle_post_save", { p_post_id: postId });
      if (error) return;
      const nowSaved = data as boolean;
      setSaved(nowSaved);
      setSaveCount((c) => nowSaved ? c + 1 : Math.max(0, c - 1));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  return (
    <div className="flex items-center gap-3 mt-8 pt-5 border-t border-divider flex-wrap">
      {/* Like button */}
      <button
        onClick={onLike}
        disabled={isPending}
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-semibold transition-all cursor-pointer select-none disabled:opacity-60 ${
          liked
            ? "bg-red-50 border-red-300 text-red-600"
            : "bg-white border-divider text-text-body hover:bg-red-50 hover:border-red-200 hover:text-red-600"
        }`}
      >
        <svg
          width="16" height="16" viewBox="0 0 24 24"
          fill={liked ? "currentColor" : "none"}
          stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
        </svg>
        ចូលចិត្ត
        {likeCount > 0 && <span className="text-xs opacity-70">· {likeCount}</span>}
      </button>

      {/* Save button */}
      <button
        onClick={onSave}
        disabled={isPending}
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-semibold transition-all cursor-pointer select-none disabled:opacity-60 ${
          saved
            ? "bg-amber-50 border-amber-400 text-amber-700"
            : "bg-white border-divider text-text-body hover:bg-amber-50 hover:border-amber-200 hover:text-amber-700"
        }`}
      >
        <svg
          width="16" height="16" viewBox="0 0 24 24"
          fill={saved ? "currentColor" : "none"}
          stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>
        </svg>
        {saved ? "បានរក្សាទុក" : "រក្សាទុក"}
        {saveCount > 0 && <span className="text-xs opacity-70">· {saveCount}</span>}
      </button>

      {/* Views */}
      <div className="ml-auto inline-flex items-center gap-1.5 text-text-muted text-sm">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
        {viewCount.toLocaleString()} ដង
      </div>
    </div>
  );
}
