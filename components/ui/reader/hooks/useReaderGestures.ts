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
  /** Whether the HUD is showing — a tap shows it at once, but waits out the
   *  double-tap window before hiding it. */
  controlsVisible: boolean;
  /** A single tap on the page (not a link, not the HUD): show/hide the HUD. */
  onTap: () => void;
};

/** Single-page mode at fit width: a tap on this outer fraction of the page,
 *  either side, turns the page (the Kindle / Play Books tap zones). */
export const EDGE_TAP_ZONE = 0.2;
/** Two taps closer together than this are a double tap (zoom). */
export const DOUBLE_TAP_MS = 300;

const dist = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

/**
 * Touch: swipe (single mode), pinch-zoom, double-tap-zoom, and the single
 * tap — which shows or hides the HUD, or, on the outer fifth of a page in
 * single mode, turns the page. Wheel: Ctrl/⌘ + wheel (and trackpad pinch,
 * which browsers report as ctrl+wheel).
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
    let pendingTap: number | undefined;
    const cancelPendingTap = () => {
      window.clearTimeout(pendingTap);
      pendingTap = undefined;
    };

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

      if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && dt < 250) {
        const now = Date.now();
        // Never hijack link taps, annotation taps, HUD taps or active selections.
        const target = e.target as HTMLElement | null;
        const sel = window.getSelection();
        const onControl =
          !!target?.closest("a, button, input, .annotationLayer, [data-reader-hud], [data-reader-overlay]") ||
          !!(sel && !sel.isCollapsed);

        // Double-tap → toggle zoom around the tapped point.
        if (
          now - lastTap.time < DOUBLE_TAP_MS &&
          Math.abs(tch.clientX - lastTap.x) < 30 &&
          Math.abs(tch.clientY - lastTap.y) < 30
        ) {
          lastTap = { time: 0, x: 0, y: 0 };
          cancelPendingTap(); // it was a double tap: the bars stay as they were
          if (onControl) return;
          const targetScale = doubleTapTarget(s.effectiveScale, s.fitWidthScale);
          if (targetScale === null) s.fitWidth();
          else s.commitZoom(targetScale, containerPoint(tch.clientX, tch.clientY));
          return;
        }
        lastTap = { time: now, x: tch.clientX, y: tch.clientY };
        if (onControl) return;

        // Single page at fit width: the outer fifth of the page turns it — at
        // once, with no double-tap zoom out there, so two quick taps are two
        // pages, not a page and a zoom.
        if (s.viewMode === "single" && isAtFitWidth(s.effectiveScale, s.fitWidthScale, s.fitMode)) {
          const rect = el.getBoundingClientRect();
          const fx = rect.width > 0 ? (tch.clientX - rect.left) / rect.width : 0.5;
          if (fx < EDGE_TAP_ZONE || fx > 1 - EDGE_TAP_ZONE) {
            lastTap = { time: 0, x: 0, y: 0 };
            cancelPendingTap();
            s.navigate(s.currentPage + (fx < EDGE_TAP_ZONE ? -1 : 1));
            return;
          }
        }

        // Anywhere else: show or hide the HUD. Showing is immediate; hiding
        // waits out the double-tap window, so a double-tap zoom never blinks
        // the bars away and back. The deferred hide re-reads the HUD's state
        // when it fires: if the idle timer hid the bars inside the window, a
        // toggle then would bring them back — the opposite of the tap.
        cancelPendingTap();
        if (!s.controlsVisible) {
          s.onTap();
        } else {
          pendingTap = window.setTimeout(() => {
            pendingTap = undefined;
            if (latest.current.controlsVisible) latest.current.onTap();
          }, DOUBLE_TAP_MS);
        }
        return;
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
      cancelPendingTap();
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
