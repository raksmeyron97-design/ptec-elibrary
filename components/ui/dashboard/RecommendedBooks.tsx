"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Sparkles, Star } from "lucide-react";
import type { Recommendation, RecommendationsResponse } from "@/app/api/recommendations/route";

const PLACEHOLDER_BG = ["#1e3a8a", "#065f46", "#7c2d12", "#4a1d96", "#0f4c75", "#064e3b"];

function CoverPlaceholder({ title, color }: { title: string; color: string | null }) {
  const bg = (color && color.startsWith("#"))
    ? color
    : PLACEHOLDER_BG[(title.charCodeAt(0) || 0) % PLACEHOLDER_BG.length];
  const initials = title.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
  return (
    <div className="h-full w-full flex items-center justify-center text-white text-[11px] font-bold" style={{ background: bg }} aria-hidden="true">
      {initials}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="mt-6" aria-hidden="true">
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
      className="group rounded-xl border border-divider bg-bg-surface p-2.5 hover:border-brand/30 hover:shadow-sm transition-all overflow-hidden flex flex-col focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <div className="h-[90px] rounded-lg overflow-hidden mb-2 flex-none">
        {item.coverUrl ? (
          <img
            src={item.coverUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <CoverPlaceholder title={item.title} color={item.coverColor} />
        )}
      </div>
      <p className="text-[10px] text-brand font-semibold truncate mb-0.5 leading-tight">{item.reason}</p>
      <p className="text-[12px] font-semibold text-text-heading leading-snug line-clamp-2 mb-auto">{item.title}</p>
      <p className="text-[11px] text-text-muted truncate mt-1">{item.author}</p>
      <div className="flex items-center gap-1 mt-0.5">
        <Star className="h-2.5 w-2.5 text-amber-400 fill-amber-400 flex-none" aria-hidden="true" />
        <span className="text-[10px] text-text-muted tabular-nums">{item.rating.toFixed(1)}</span>
      </div>
    </Link>
  );
}

export default function RecommendedBooks() {
  const t = useTranslations("dashboard");
  const [data, setData] = useState<RecommendationsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/recommendations", { signal: controller.signal })
      .then(r => (r.ok ? r.json() : null))
      .then((d: RecommendationsResponse | null) => {
        setData(d && Array.isArray(d.items) ? d : { items: [], basedOn: null });
        setLoading(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setData({ items: [], basedOn: null });
        setLoading(false);
      });
    return () => controller.abort();
  }, []);

  if (loading) return <Skeleton />;
  if (!data || data.items.length === 0) return null;

  return (
    <section aria-label={t("recommendedForYou")} className="mt-6">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-amber-500 flex-none" aria-hidden="true" />
        <p className="text-[13px] font-bold text-text-heading">{t("recommendedForYou")}</p>
        {data.basedOn && (
          <span className="hidden sm:block text-[11px] text-text-muted">· {t("basedOn", { name: data.basedOn })}</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {data.items.map(item => <BookCard key={item.id} item={item} />)}
      </div>
    </section>
  );
}
