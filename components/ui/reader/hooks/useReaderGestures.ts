"use client";

import { useEffect, type RefObject } from "react";
import { clampScale, doubleTapTarget, isAtFitWidth, stepZoom } from "@/lib/reader/zoom";
import type { FitMode, ViewMode } from "@/lib/reader/geometry";

export type GestureState = {
  effectiveScale: number;
  fitWidthScale: number;
  fitMode: FitMode;
  viewMode: ViewMode;
  currentPage: number;
  commitZoom: (scale: number, focal?: { x: number; y: number }) => void;
  fitWidth: () => void;
  navigate: (page: number) => void;
};

const dist = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

/**
 * Touch: swipe (single mode), pinch-zoom, double-tap-zoom. Wheel: Ctrl/⌘ +
 * wheel (and trackpad pinch, which browsers report as ctrl+wheel).
 *
 * Pinch uses a two-stage strategy: while fingers move, a cheap CSS transform
 * on the gesture layer previews the zoom (rAF-throttled, no React re-render,
 * no canvas re-raster); on release the final scale is committed to React
 * state around the pinch midpoint, and the preview transform is dropped once
 * the re-rendered width lands (the focal-point effect in the viewer clears
 * it), so the final output is sharp.
 *
 * Every handler reads `latest.current` — the effect binds once.
 */
export function useReaderGestures({
  docAreaRef,
  containerRef,
  gestureLayerRef,
  latest,
}: {
  docAreaRef: RefObject<HTMLDivElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  gestureLayerRef: RefObject<HTMLDivElement | null>;
  latest: RefObject<GestureState>;
}) {
  useEffect(() => {
    const el = docAreaRef.current;
    if (!el) return;
    let touchStart: { x: number; y: number; time: number } | null = null;
    let pinch: {
      startDist: number;
      baseScale: number;
      midX: number;
      midY: number;
      gesture: number;
      raf: number | null;
    } | null = null;
    let lastTap = { time: 0, x: 0, y: 0 };

    const containerPoint = (clientX: number, clientY: number) => {
      const c = containerRef.current;
      const rect = c?.getBoundingClientRect();
      return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
    };
    const clearPreview = () => {
      const layer = gestureLayerRef.current;
      if (layer) {
        layer.style.transform = "";
        layer.style.transformOrigin = "";
      }
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const mid = containerPoint(
          (e.touches[0].clientX + e.touches[1].clientX) / 2,
          (e.touches[0].clientY + e.touches[1].clientY) / 2,
        );
        pinch = {
          startDist: dist(e.touches[0], e.touches[1]),
          baseScale: latest.current.effectiveScale,
          midX: mid.x,
          midY: mid.y,
          gesture: 1,
          raf: null,
        };
        touchStart = null;
      } else if (e.touches.length === 1) {
        const tch = e.touches[0];
        touchStart = { x: tch.clientX, y: tch.clientY, time: Date.now() };
      }
    };
    const onMove = (e: TouchEvent) => {
      if (pinch && e.touches.length === 2) {
        e.preventDefault();
        const d = dist(e.touches[0], e.touches[1]);
        // Clamp the preview so it can never exceed what the commit allows.
        const raw = pinch.baseScale * (d / pinch.startDist);
        pinch.gesture = clampScale(raw) / pinch.baseScale;
        if (pinch.raf === null) {
          pinch.raf = requestAnimationFrame(() => {
            if (!pinch) return;
            pinch.raf = null;
            const layer = gestureLayerRef.current;
            const c = containerRef.current;
            if (!layer || !c) return;
            layer.style.transformOrigin = `${c.scrollLeft + pinch.midX}px ${c.scrollTop + pinch.midY}px`;
            layer.style.transform = `scale(${pinch.gesture})`;
          });
        }
      }
    };
    const onEnd = (e: TouchEvent) => {
      const s = latest.current;
      if (pinch && e.touches.length < 2) {
        const { baseScale, gesture, midX, midY, raf } = pinch;
        if (raf !== null) cancelAnimationFrame(raf);
        pinch = null;
        touchStart = null;
        const next = clampScale(baseScale * gesture);
        if (Math.abs(next - baseScale) > 0.01) {
          s.commitZoom(next, { x: midX, y: midY });
        } else {
          clearPreview(); // no-op pinch (or clamped at the limit)
        }
        return;
      }
      const start = touchStart;
      touchStart = null;
      if (!start) return;
      const tch = e.changedTouches[0];
      const dx = tch.clientX - start.x;
      const dy = tch.clientY - start.y;
      const dt = Date.now() - start.time;

      // Double-tap → toggle zoom around the tapped point.
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && dt < 250) {
        const now = Date.now();
        if (
          now - lastTap.time < 300 &&
          Math.abs(tch.clientX - lastTap.x) < 30 &&
          Math.abs(tch.clientY - lastTap.y) < 30
        ) {
          lastTap = { time: 0, x: 0, y: 0 };
          // Never hijack link taps, annotation taps, HUD taps or active selections.
          const target = e.target as HTMLElement | null;
          const sel = window.getSelection();
          if (
            target?.closest("a, button, input, .annotationLayer, [data-reader-hud], [data-reader-overlay]") ||
            (sel && !sel.isCollapsed)
          ) {
            return;
          }
          const targetScale = doubleTapTarget(s.effectiveScale, s.fitWidthScale);
          if (targetScale === null) s.fitWidth();
          else s.commitZoom(targetScale, containerPoint(tch.clientX, tch.clientY));
          return;
        }
        lastTap = { time: now, x: tch.clientX, y: tch.clientY };
      }

      // Horizontal swipe → page turn (single mode, not zoomed in).
      if (
        s.viewMode === "single" &&
        isAtFitWidth(s.effectiveScale, s.fitWidthScale, s.fitMode) &&
        dt < 500 &&
        Math.abs(dx) > 50 &&
        Math.abs(dy) < Math.abs(dx) * 0.7
      ) {
        const target = e.target as HTMLElement | null;
        if (target?.closest("[data-reader-hud], [data-reader-overlay]")) return;
        s.navigate(s.currentPage + (dx < 0 ? 1 : -1));
      }
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      if (pinch?.raf) cancelAnimationFrame(pinch.raf);
    };
  }, [docAreaRef, containerRef, gestureLayerRef, latest]);

  // Ctrl/⌘ + wheel zoom — steps presets around the pointer. Unmodified wheel
  // events pass through untouched.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let raf: number | null = null;
    let pendingDelta = 0;
    let focal = { x: 0, y: 0 };
    let lastStep = 0;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      pendingDelta += e.deltaY;
      const rect = el.getBoundingClientRect();
      focal = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (raf !== null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const now = performance.now();
        if (Math.abs(pendingDelta) < 4 || now - lastStep < 80) {
          pendingDelta = 0;
          return;
        }
        const dir: 1 | -1 = pendingDelta < 0 ? 1 : -1;
        pendingDelta = 0;
        lastStep = now;
        latest.current.commitZoom(stepZoom(latest.current.effectiveScale, dir), focal);
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [containerRef, latest]);
}
