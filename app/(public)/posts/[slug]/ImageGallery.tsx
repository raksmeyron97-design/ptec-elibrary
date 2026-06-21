"use client";

// app/posts/[slug]/ImageGallery.tsx
// Displays images as a masonry-style grid (2 col mobile, 4 col desktop).
// Clicking any image opens a lightbox with prev/next navigation.

import { useState, useCallback, useEffect } from "react";

export default function ImageGallery({ urls, alt }: { urls: string[]; alt: string }) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const openLightbox = (i: number) => setLightboxIdx(i);
  const closeLightbox = () => setLightboxIdx(null);
  const prev = useCallback(() =>
    setLightboxIdx((c) => (c === null ? null : (c - 1 + urls.length) % urls.length)), [urls.length]);
  const next = useCallback(() =>
    setLightboxIdx((c) => (c === null ? null : (c + 1) % urls.length)), [urls.length]);

  // Keyboard navigation
  useEffect(() => {
    if (lightboxIdx === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft")  prev();
      if (e.key === "ArrowRight") next();
      if (e.key === "Escape")     closeLightbox();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIdx, prev, next]);

  if (urls.length === 0) return null;

  return (
    <>
      {/* ── Section header ── */}
      <div className="mb-4 flex items-center gap-2">
        <svg className="h-5 w-5 text-text-muted" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
        <span className="text-base font-semibold text-text-body">Images</span>
        <span className="ml-1 rounded-full bg-paper px-2 py-0.5 text-xs font-medium text-text-muted">
          {urls.length}
        </span>
      </div>

      {/* ── Photo grid ── */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        {urls.map((url, i) => (
          <button
            key={i}
            type="button"
            onClick={() => openLightbox(i)}
            className="group relative overflow-hidden rounded-lg bg-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            style={{ aspectRatio: "4/3" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`${alt} – photo ${i + 1}`}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-105 group-hover:brightness-90"
              loading={i < 4 ? "eager" : "lazy"}
            />
            {/* Zoom hint */}
            <span className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
              <span className="rounded-full bg-black/40 p-2 backdrop-blur-sm">
                <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
                </svg>
              </span>
            </span>
          </button>
        ))}
      </div>

      {/* ── Lightbox ── */}
      {lightboxIdx !== null && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/92 backdrop-blur-sm"
          onClick={closeLightbox}
        >
          {/* Image */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={urls[lightboxIdx]}
            alt={`${alt} – photo ${lightboxIdx + 1}`}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[88vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
          />

          {/* Close */}
          <button type="button">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>

          {/* Prev */}
          {urls.length > 1 && (
            <button type="button" onClick={(e) => { e.stopPropagation(); prev(); }} aria-label="Previous"
              className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-bg-surface/10 p-3 text-white backdrop-blur-sm transition hover:bg-bg-surface/25">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6"/>
              </svg>
            </button>
          )}

          {/* Next */}
          {urls.length > 1 && (
            <button type="button" onClick={(e) => { e.stopPropagation(); next(); }} aria-label="Next"
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-bg-surface/10 p-3 text-white backdrop-blur-sm transition hover:bg-bg-surface/25">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </button>
          )}

          {/* Counter */}
          {urls.length > 1 && (
            <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-bg-surface/10 px-4 py-1.5 text-sm font-medium text-white backdrop-blur-sm">
              {lightboxIdx + 1} / {urls.length}
            </span>
          )}
        </div>
      )}
    </>
  );
}