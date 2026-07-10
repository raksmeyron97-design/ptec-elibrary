"use client";

import { useEffect, useRef } from "react";

// Decorative constellation layer for the homepage hero (from the
// "Hero — Search Constellation" design). A drifting star field where a few
// nodes carry trending search terms; when the hero search field gains focus
// the network brightens, links lengthen, and the term labels fade in.
//
// Perf notes: pure canvas + rAF (no framer-motion), rAF pauses when the hero
// scrolls off-screen or the tab is hidden, DPR capped at 2, and
// prefers-reduced-motion gets a single static mid-glow frame.

type Props = {
  /** Trending search terms rendered as labelled nodes (max ~4 used). */
  terms?: string[];
  className?: string;
};

type Node = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  isTerm: boolean;
  label: string | null;
  tw: number; // twinkle phase
};

const ACCENT = [34, 211, 238] as const; // cyan-400 — matches the hero's glow bed

export default function HeroConstellation({ terms = [], className = "" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Scalar dep so the effect doesn't re-run on every parent render just
  // because the array identity changed.
  const termsKey = terms.slice(0, 4).join("\u0000");

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0;
    let H = 0;

    const reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const still = reduceMq.matches;

    const labels = termsKey ? termsKey.split("\u0000") : [];
    let nodes: Node[] = [];

    const buildNodes = () => {
      // Scale density with viewport so phones do less work.
      const N = W < 640 ? 20 : W < 1024 ? 32 : 46;
      nodes = [];
      for (let i = 0; i < N; i++) {
        const isTerm = i < labels.length;
        nodes.push({
          // Term nodes live in a left-of-centre band, behind the search bar.
          x: isTerm ? 0.1 + Math.random() * 0.42 : Math.random(),
          y: isTerm ? 0.32 + Math.random() * 0.44 : Math.random(),
          vx: (Math.random() - 0.5) * 0.00035,
          vy: (Math.random() - 0.5) * 0.00035,
          r: isTerm ? 3.4 : 1.1 + Math.random() * 1.4,
          isTerm,
          label: isTerm ? labels[i] : null,
          tw: Math.random() * Math.PI * 2,
        });
      }
    };

    let focus = still ? 0.45 : 0;
    let focusTarget = still ? 0.45 : 0;

    const draw = () => {
      const [ar, ag, ab] = ACCENT;
      focus += (focusTarget - focus) * 0.08;
      const f = focus;
      const e = 0.32 + 0.68 * f; // ambient floor so the field is always visible
      const linkDist = (0.13 + 0.09 * f) * Math.min(W, H);

      if (!still) {
        for (const n of nodes) {
          n.x += n.vx;
          n.y += n.vy;
          n.tw += 0.02;
          if (n.isTerm) {
            // Bounce within a padded band so labels stay inset.
            if (n.x < 0.06) { n.x = 0.06; n.vx = Math.abs(n.vx); }
            if (n.x > 0.58) { n.x = 0.58; n.vx = -Math.abs(n.vx); }
            if (n.y < 0.16) { n.y = 0.16; n.vy = Math.abs(n.vy); }
            if (n.y > 0.84) { n.y = 0.84; n.vy = -Math.abs(n.vy); }
          } else {
            if (n.x < -0.02) n.x = 1.02;
            if (n.x > 1.02) n.x = -0.02;
            if (n.y < -0.02) n.y = 1.02;
            if (n.y > 1.02) n.y = -0.02;
          }
        }
      }

      ctx.clearRect(0, 0, W, H);

      // Links
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = (a.x - b.x) * W;
          const dy = (a.y - b.y) * H;
          const d = Math.hypot(dx, dy);
          if (d < linkDist) {
            const bond = a.isTerm || b.isTerm ? 1.4 : 1;
            const alpha = (1 - d / linkDist) * (0.06 + 0.42 * f) * bond;
            ctx.strokeStyle = `rgba(${ar},${ag},${ab},${alpha})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x * W, a.y * H);
            ctx.lineTo(b.x * W, b.y * H);
            ctx.stroke();
          }
        }
      }

      // Nodes
      for (const n of nodes) {
        const px = n.x * W;
        const py = n.y * H;
        const twk = 0.72 + 0.28 * Math.sin(n.tw);
        if (n.isTerm) {
          const glowR = 22 + 30 * f;
          const g = ctx.createRadialGradient(px, py, 0, px, py, glowR);
          g.addColorStop(0, `rgba(${ar},${ag},${ab},${0.5 * e})`);
          g.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(px, py, glowR, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `rgba(255,255,255,${0.8 * e})`;
          ctx.beginPath();
          ctx.arc(px, py, n.r, 0, Math.PI * 2);
          ctx.fill();
          if (n.label && f > 0.04) {
            // Khmer fallbacks so KM trending terms render on the canvas.
            ctx.font = '600 12px Inter, Hanuman, "Khmer OS", system-ui, sans-serif';
            const tw = ctx.measureText(n.label).width;
            let lx = px + n.r + 8;
            if (lx + tw > W - 16) lx = px - n.r - 8 - tw;
            if (lx < 16) lx = 16;
            ctx.fillStyle = `rgba(${ar},${ag},${ab},${Math.min(1, f * 1.1)})`;
            ctx.shadowColor = "rgba(0,0,0,0.6)";
            ctx.shadowBlur = 6;
            ctx.fillText(n.label, lx, py + 4);
            ctx.shadowBlur = 0;
          }
        } else {
          ctx.fillStyle = `rgba(200,225,255,${(0.12 + 0.38 * f) * twk})`;
          ctx.beginPath();
          ctx.arc(px, py, n.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    // ── Animation loop, paused off-screen / on hidden tab ────────────────────
    let raf = 0;
    let running = false;
    let visible = false;

    const tick = () => {
      draw();
      raf = requestAnimationFrame(tick);
    };
    const syncLoop = () => {
      const shouldRun = !still && visible && document.visibilityState === "visible";
      if (shouldRun && !running) {
        running = true;
        raf = requestAnimationFrame(tick);
      } else if (!shouldRun && running) {
        running = false;
        cancelAnimationFrame(raf);
      }
    };

    const resize = () => {
      W = cvs.clientWidth;
      H = cvs.clientHeight;
      cvs.width = Math.max(1, Math.round(W * dpr));
      cvs.height = Math.max(1, Math.round(H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (nodes.length === 0) buildNodes();
      if (still) draw();
    };
    resize();
    cvs.style.opacity = "1"; // fade in over the transition set in className

    const ro = new ResizeObserver(resize);
    ro.observe(cvs);

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      syncLoop();
    });
    io.observe(cvs);

    const onVisibility = () => syncLoop();
    document.addEventListener("visibilitychange", onVisibility);

    // ── Focus wiring: brighten while the hero's search input is focused. ─────
    // focusin/focusout bubble, so delegating on the hero section needs no
    // coupling to AskLibraryHero.
    const hero = cvs.closest("section");
    const isSearchInput = (t: EventTarget | null) =>
      t instanceof HTMLInputElement && t.type === "search";
    const onFocusIn = (ev: Event) => {
      if (!isSearchInput(ev.target)) return;
      focusTarget = 1;
      if (still) { focus = 1; draw(); }
    };
    const onFocusOut = (ev: Event) => {
      if (!isSearchInput(ev.target)) return;
      focusTarget = 0;
      if (still) { focus = 0.45; draw(); }
    };
    hero?.addEventListener("focusin", onFocusIn);
    hero?.addEventListener("focusout", onFocusOut);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      hero?.removeEventListener("focusin", onFocusIn);
      hero?.removeEventListener("focusout", onFocusOut);
    };
  }, [termsKey]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      // h-full/w-full are required: a canvas is a replaced element with an
      // intrinsic 300x150 size, so inset-0 alone won't stretch it.
      className={`pointer-events-none h-full w-full opacity-0 transition-opacity duration-1000 ${className}`}
    />
  );
}
