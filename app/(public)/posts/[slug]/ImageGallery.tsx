"use client";

// app/posts/[slug]/ImageGallery.tsx
// Improved: slide-up action bar, share popover, featured first image,
// smooth lightbox animation, swipe gestures, dot counter, skeleton loaders.
// Fix: outer Tile is <div> not <button> — avoids illegal button-in-button nesting.

import { useState, useCallback, useEffect, useRef } from "react";

interface ImageGalleryProps {
  urls: string[];
  alt: string;
  pageUrl?: string;
  postTitle?: string;
}

/* ─── Skeleton tile ─── */
function Skeleton() {
  return (
    <span className="absolute inset-0 bg-gradient-to-br from-[#1a2540] to-[#0f1a2e] animate-pulse" />
  );
}

/* ─── Share Popover ─── */
interface SharePopoverProps {
  imageUrl: string;
  pageUrl: string;
  postTitle: string;
  onClose: () => void;
}
function SharePopover({ imageUrl, pageUrl, postTitle, onClose }: SharePopoverProps) {
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`;
  const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(postTitle)}`;

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(imageUrl); } catch { /* noop */ }
    setCopied(true);
    setTimeout(() => { setCopied(false); onClose(); }, 1400);
  };

  // close on outside click
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    setTimeout(() => document.addEventListener("mousedown", handle), 0);
    return () => document.removeEventListener("mousedown", handle);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="gallery-popover absolute bottom-[52px] left-1/2 -translate-x-1/2 z-30
                 bg-[#0B1530]/95 backdrop-blur-md border border-white/10
                 rounded-xl px-3 py-2 flex gap-2 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      {/* arrow */}
      <span className="absolute -bottom-[6px] left-1/2 -translate-x-1/2 w-3 h-3
                       bg-[#0B1530]/95 border-r border-b border-white/10 rotate-45" />

      {/* FB */}
      <a
        href={fbUrl} target="_blank" rel="noopener noreferrer"
        title="Share on Facebook"
        className="w-8 h-8 rounded-lg bg-[#1877F2] flex items-center justify-center
                   transition hover:scale-110 hover:brightness-110"
        onClick={(e) => e.stopPropagation()}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff">
          <path d="M22 12a10 10 0 10-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.7-3.9 1.1 0 2.2.2 2.2.2v2.4h-1.2c-1.2 0-1.6.8-1.6 1.6V12h2.7l-.4 2.9h-2.3v7A10 10 0 0022 12z"/>
        </svg>
      </a>

      {/* Telegram */}
      <a
        href={tgUrl} target="_blank" rel="noopener noreferrer"
        title="Share on Telegram"
        className="w-8 h-8 rounded-lg bg-[#29A9EB] flex items-center justify-center
                   transition hover:scale-110 hover:brightness-110"
        onClick={(e) => e.stopPropagation()}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff">
          <path d="M21.9 4.3l-3.3 15.6c-.2 1.1-.9 1.4-1.9.9l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6 14.2l-4.9-1.5c-1.1-.3-1.1-1 .2-1.5L20.6 2.9c.9-.3 1.6.2 1.3 1.4z"/>
        </svg>
      </a>

      {/* Copy image link */}
      <button
        type="button"
        title="Copy image link"
        onClick={(e) => { e.stopPropagation(); copyLink(); }}
        className={`w-8 h-8 rounded-lg flex items-center justify-center
                    transition hover:scale-110
                    ${copied ? "bg-[#0f9d6b]" : "bg-white/15 hover:bg-white/25"}`}
      >
        {copied ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.5 1.5"/>
            <path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.5-1.5"/>
          </svg>
        )}
      </button>
    </div>
  );
}

/* ─── Single grid tile ─────────────────────────────────────────────────────
   IMPORTANT: outer element MUST be <div>, not <button>.
   The action bar inside contains real <button> elements — nesting
   <button> inside <button> is invalid HTML and causes hydration errors.
   Keyboard / a11y handled via role="button" + tabIndex + onKeyDown.
──────────────────────────────────────────────────────────────────────────── */
interface TileProps {
  url: string;
  index: number;
  alt: string;
  featured?: boolean;
  pageUrl: string;
  postTitle: string;
  onOpen: () => void;
}

function Tile({ url, index, alt, featured, pageUrl, postTitle, onOpen }: TileProps) {
  const [loaded, setLoaded] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const a = document.createElement("a");
    a.href = url;
    a.download = `photo-${index + 1}.jpg`;
    a.target = "_blank";
    a.click();
  };

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShareOpen((v) => !v);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen();
    }
  };

  return (
    // ↓ <div> not <button> — prevents button-in-button hydration error
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      className={`gallery-tile group relative overflow-hidden rounded-xl bg-[#0f1a2e] cursor-pointer
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-[#DDB022]
                  ${featured ? "col-span-2 row-span-2" : ""}`}
      style={{ aspectRatio: featured ? "16/9" : "4/3" }}
    >
      {/* skeleton */}
      {!loaded && <Skeleton />}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={`${alt} – photo ${index + 1}`}
        onLoad={() => setLoaded(true)}
        className={`h-full w-full object-cover transition-all duration-500
                    group-hover:scale-105 group-hover:brightness-75
                    ${loaded ? "opacity-100" : "opacity-0"}`}
        loading={index < 4 ? "eager" : "lazy"}
      />

      {/* gold accent ring on featured */}
      {featured && (
        <span className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-[#DDB022]/30" />
      )}

      {/* hover overlay: photo index badge */}
      <span className="absolute inset-0 flex items-start justify-end p-2
                       opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
        <span className="rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-semibold
                         text-[#DDB022] backdrop-blur-sm tabular-nums">
          {index + 1}
        </span>
      </span>

      {/* ── slide-up action bar ── */}
      {/* stopPropagation so clicks here don't fire the outer onOpen */}
      <div
        className="gallery-action-bar absolute bottom-0 left-0 right-0
                   flex items-center justify-center gap-2 px-3 py-2.5
                   bg-gradient-to-t from-black/85 via-black/50 to-transparent
                   translate-y-full group-hover:translate-y-0
                   transition-transform duration-300 ease-out"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Download */}
        <button
          type="button"
          title="Download"
          onClick={handleDownload}
          className="w-8 h-8 rounded-lg bg-white/10 hover:bg-[#DDB022]
                     flex items-center justify-center backdrop-blur-sm
                     transition-all duration-200 hover:scale-110"
        >
          <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v10M7 15l5 5 5-5"/>
            <rect x="3" y="19" width="18" height="2" rx="1"/>
          </svg>
        </button>

        {/* Share */}
        <div className="relative">
          <button
            type="button"
            title="Share"
            onClick={handleShare}
            className={`w-8 h-8 rounded-lg flex items-center justify-center backdrop-blur-sm
                        transition-all duration-200 hover:scale-110
                        ${shareOpen ? "bg-[#DDB022]" : "bg-white/10 hover:bg-[#DDB022]"}`}
          >
            <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
          </button>

          {shareOpen && (
            <SharePopover
              imageUrl={url}
              pageUrl={pageUrl}
              postTitle={postTitle}
              onClose={() => setShareOpen(false)}
            />
          )}
        </div>

        {/* Fullscreen */}
        <button
          type="button"
          title="View fullscreen"
          onClick={(e) => { e.stopPropagation(); onOpen(); }}
          className="w-8 h-8 rounded-lg bg-white/10 hover:bg-[#DDB022]
                     flex items-center justify-center backdrop-blur-sm
                     transition-all duration-200 hover:scale-110"
        >
          <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ─── Dot counter strip ─── */
function DotStrip({ count, active }: { count: number; active: number }) {
  if (count <= 1) return null;
  // show max 10 dots to avoid overflow
  const visible = Math.min(count, 10);
  return (
    <div className="absolute bottom-14 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
      {Array.from({ length: visible }).map((_, i) => (
        <span
          key={i}
          className={`rounded-full transition-all duration-300
            ${i === active
              ? "w-5 h-2 bg-[#DDB022]"
              : "w-2 h-2 bg-white/30"
            }`}
        />
      ))}
    </div>
  );
}

/* ─── Main component ─── */
export default function ImageGallery({
  urls,
  alt,
  pageUrl: pageProp,
  postTitle = "",
}: ImageGalleryProps) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const [pageUrl, setPageUrl] = useState(pageProp ?? "");

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    if (!pageProp) setPageUrl(window.location.href);
  }, [pageProp]);

  const openLightbox = useCallback((i: number) => {
    setLightboxIdx(i);
    requestAnimationFrame(() => setLightboxVisible(true));
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxVisible(false);
    setTimeout(() => setLightboxIdx(null), 300);
  }, []);

  const prev = useCallback(() =>
    setLightboxIdx((c) => (c === null ? null : (c - 1 + urls.length) % urls.length)),
    [urls.length]);

  const next = useCallback(() =>
    setLightboxIdx((c) => (c === null ? null : (c + 1) % urls.length)),
    [urls.length]);

  // Keyboard nav
  useEffect(() => {
    if (lightboxIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft")  prev();
      if (e.key === "ArrowRight") next();
      if (e.key === "Escape")     closeLightbox();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIdx, prev, next, closeLightbox]);

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = lightboxIdx !== null ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [lightboxIdx]);

  // Touch swipe
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
      dx < 0 ? next() : prev();
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

  if (urls.length === 0) return null;

  const hasFeatured = urls.length >= 3;

  return (
    <>
      {/* ── Section header ── */}
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex items-center justify-center w-7 h-7 rounded-lg
                         bg-gradient-to-br from-[#DDB022] to-[#d97706]">
          <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
        </span>
        <span className="text-base font-semibold text-text-body">រូបភាព</span>
        <span className="ml-1 rounded-full bg-[#DDB022]/15 border border-[#DDB022]/30
                         px-2.5 py-0.5 text-xs font-semibold text-[#806211]">
          {urls.length}
        </span>
      </div>

      {/* ── Photo grid ── */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        {urls.map((url, i) => (
          <Tile
            key={url + i}
            url={url}
            index={i}
            alt={alt}
            featured={hasFeatured && i === 0}
            pageUrl={pageUrl}
            postTitle={postTitle}
            onOpen={() => openLightbox(i)}
          />
        ))}
      </div>

      {/* ── Lightbox ── */}
      {lightboxIdx !== null && (
        <div
          className={`fixed inset-0 z-[200] flex items-center justify-center
                      bg-black/95 backdrop-blur-md
                      transition-opacity duration-300
                      ${lightboxVisible ? "opacity-100" : "opacity-0"}`}
          onClick={closeLightbox}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {/* Image */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={urls[lightboxIdx]}
            alt={`${alt} – photo ${lightboxIdx + 1}`}
            onClick={(e) => e.stopPropagation()}
            className={`max-h-[88vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl
                        transition-all duration-300
                        ${lightboxVisible ? "scale-100 opacity-100" : "scale-95 opacity-0"}`}
          />

          {/* Top bar: download + counter */}
          <div
            className="absolute top-4 left-1/2 -translate-x-1/2
                       flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-3 py-2"
            onClick={(e) => e.stopPropagation()}
          >
            <a
              href={urls[lightboxIdx]}
              download={`photo-${lightboxIdx + 1}.jpg`}
              target="_blank"
              rel="noreferrer"
              title="Download"
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-[#DDB022]
                         flex items-center justify-center text-white
                         transition-all duration-200 hover:scale-110"
              onClick={(e) => e.stopPropagation()}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v10M7 15l5 5 5-5"/>
                <rect x="3" y="19" width="18" height="2" rx="1"/>
              </svg>
            </a>
            <span className="w-px h-4 bg-white/20" />
            <span className="text-xs text-white/60 tabular-nums px-1 select-none">
              {lightboxIdx + 1} / {urls.length}
            </span>
          </div>

          {/* Close */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); closeLightbox(); }}
            aria-label="Close"
            className="absolute top-4 right-4 w-10 h-10 rounded-full
                       bg-white/10 hover:bg-[#DDB022] backdrop-blur-sm
                       flex items-center justify-center text-white
                       transition-all duration-200 hover:scale-110 hover:rotate-90"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>

          {/* Prev */}
          {urls.length > 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); prev(); }}
              aria-label="Previous"
              className="absolute left-4 top-1/2 -translate-y-1/2
                         w-11 h-11 rounded-full bg-white/10 hover:bg-[#DDB022]
                         flex items-center justify-center text-white backdrop-blur-sm
                         transition-all duration-200 hover:scale-110"
            >
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6"/>
              </svg>
            </button>
          )}

          {/* Next */}
          {urls.length > 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); next(); }}
              aria-label="Next"
              className="absolute right-4 top-1/2 -translate-y-1/2
                         w-11 h-11 rounded-full bg-white/10 hover:bg-[#DDB022]
                         flex items-center justify-center text-white backdrop-blur-sm
                         transition-all duration-200 hover:scale-110"
            >
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </button>
          )}

          {/* Dot strip */}
          <DotStrip count={urls.length} active={lightboxIdx} />

          {/* Bottom counter */}
          {urls.length > 1 && (
            <span className="absolute bottom-4 left-1/2 -translate-x-1/2
                             rounded-full bg-white/10 backdrop-blur-sm
                             px-4 py-1.5 text-sm font-semibold text-white tabular-nums select-none">
              {lightboxIdx + 1} / {urls.length}
            </span>
          )}
        </div>
      )}

      {/* Scoped styles */}
      <style>{`
        .gallery-tile { transition: box-shadow 0.2s ease; }
        .gallery-tile:hover { box-shadow: 0 0 0 2px #DDB022; }

        .gallery-action-bar { will-change: transform; }

        .gallery-popover {
          animation: galleryPopoverIn 0.18s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        @keyframes galleryPopoverIn {
          from { opacity: 0; transform: translate(-50%, 6px) scale(0.92); }
          to   { opacity: 1; transform: translate(-50%, 0)   scale(1);    }
        }

        @media (prefers-reduced-motion: reduce) {
          .gallery-tile img,
          .gallery-action-bar,
          .gallery-popover { transition: none !important; animation: none !important; }
        }
      `}</style>
    </>
  );
}