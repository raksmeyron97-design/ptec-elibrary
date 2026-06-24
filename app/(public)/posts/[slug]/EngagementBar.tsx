"use client";
import { useState, useCallback } from "react";

interface EngagementBarProps {
  viewCount: number;
}

export default function EngagementBar({ viewCount }: EngagementBarProps) {
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [saved, setSaved] = useState(false);

  const onLike = useCallback(() => {
    setLiked((prev) => {
      setLikeCount((c) => (prev ? c - 1 : c + 1));
      return !prev;
    });
  }, []);

  return (
    <div className="flex items-center gap-3 mt-6 flex-wrap">
      <button
        onClick={onLike}
        className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full border text-sm font-semibold transition-all cursor-pointer select-none ${
          liked
            ? "bg-blue-50 border-blue-300 text-blue-700"
            : "bg-white border-border-strong text-slate-600 hover:bg-blue-50 hover:border-blue-200"
        }`}
      >
        <span className="text-base">{liked ? "♥" : "♡"}</span>
        ចូលចិត្ត · {likeCount}
      </button>

      <button
        onClick={() => setSaved((p) => !p)}
        className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full border text-sm font-semibold transition-all cursor-pointer select-none ${
          saved
            ? "bg-gold-50 border-gold-400 text-gold-700"
            : "bg-white border-border-strong text-slate-600 hover:bg-gold-50 hover:border-gold-200"
        }`}
      >
        <span className="text-sm">{saved ? "★" : "☆"}</span>
        {saved ? "បានរក្សាទុក" : "រក្សាទុក"}
      </button>

      <span className="ml-auto text-text-muted text-sm">
        👁 {viewCount.toLocaleString()} ដង
      </span>
    </div>
  );
}
