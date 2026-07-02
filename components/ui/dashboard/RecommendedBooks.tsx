"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, Star } from "lucide-react";
import type { Recommendation, RecommendationsResponse } from "@/app/api/recommendations/route";

const PLACEHOLDER_BG = ["#1e3a8a", "#065f46", "#7c2d12", "#4a1d96", "#0f4c75", "#064e3b"];

function CoverPlaceholder({ title, color }: { title: string; color: string | null }) {
  const bg = (color && color.startsWith("#"))
    ? color
    : PLACEHOLDER_BG[Math.abs(title.charCodeAt(0)) % PLACEHOLDER_BG.length];
  const initials = title.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
  return (
    <div className="h-full w-full flex items-center justify-center text-white text-[11px] font-bold" style={{ background: bg }}>
      {initials}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="mt-6">
      <div className="h-4 w-44 rounded bg-divider animate-pulse mb-3" />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="rounded-xl border border-divider bg-bg-surface p-2.5 animate-pulse">
            <div className="h-[90px] rounded-lg bg-divider mb-2" />
            <div className="h-2.5 w-3/4 rounded bg-divider mb-1.5" />
            <div className="h-3 rounded bg-divider mb-1" />
            <div className="h-2.5 w-1/2 rounded bg-divider" />
          </div>
        ))}
      </div>
    </div>
  );
}

function BookCard({ item }: { item: Recommendation }) {
  return (
    <Link
      href={`/books/${item.slug}`}
      className="group rounded-xl border border-divider bg-bg-surface p-2.5 hover:border-brand/30 hover:shadow-sm transition-all overflow-hidden flex flex-col"
    >
      <div className="h-[90px] rounded-lg overflow-hidden mb-2 flex-none">
        {item.coverUrl ? (
          <img
            src={item.coverUrl}
            alt={item.title}
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <CoverPlaceholder title={item.title} color={item.coverColor} />
        )}
      </div>
      <p className="text-[10px] text-brand font-semibold truncate mb-0.5 leading-tight">{item.reason}</p>
      <p className="text-[12px] font-semibold text-text-heading leading-snug line-clamp-2 mb-auto">{item.title}</p>
      <p className="text-[11px] text-text-muted truncate mt-1">{item.author}</p>
      <div className="flex items-center gap-1 mt-0.5">
        <Star className="h-2.5 w-2.5 text-amber-400 fill-amber-400 flex-none" />
        <span className="text-[10px] text-text-muted">{item.rating.toFixed(1)}</span>
      </div>
    </Link>
  );
}

export default function RecommendedBooks() {
  const [data, setData] = useState<RecommendationsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/recommendations")
      .then(r => r.json())
      .then(setData)
      .catch(() => setData({ items: [], basedOn: null }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Skeleton />;
  if (!data || data.items.length === 0) return null;

  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-amber-500 flex-none" />
        <p className="text-[13px] font-bold text-text-heading">Recommended for You</p>
        {data.basedOn && (
          <span className="hidden sm:block text-[11px] text-text-muted">· Based on {data.basedOn}</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {data.items.map(item => <BookCard key={item.id} item={item} />)}
      </div>
    </div>
  );
}
