"use client";

import { useEffect, useRef } from "react";

// Decorative motion layer for the site footer (from the "Footer — hi-fi
// redesign" design). Renders the drifting constellation canvas + a cursor
// spotlight, and progressively enhances the server-rendered footer with a
// magnetic "Get directions" CTA, a smooth back-to-top button, and a staggered
// scroll-reveal of the columns.
//
// Everything here is progressive enhancement: the footer is fully usable and
// visible without JS, and prefers-reduced-motion disables all animation
// (columns stay visible, the canvas paints one static frame).
//
// Perf notes mirror the hero constellation: pure canvas + rAF (no
// framer-motion), the loop pauses when the footer scrolls off-screen or the
// tab is hidden, DPR is capped at 2, and node count scales with area — so on a
// page bottom this costs nothing until the user actually reaches it.

const LINK_DIST = 118;

type Star = { x: number; y: number; vx: number; vy: number; r: number; tw: number };

export default function FooterEffects() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const root = canvas.closest("footer") as HTMLElement | null;
    if (!root) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cleanups: Array<() => void> = [];

    // ── Staggered scroll-reveal ────────────────────────────────────────────
    if (!reduce && "IntersectionObserver" in window) {
      root.setAttribute("data-footer-reveal-ready", "");
      const items = Array.from(root.querySelectorAll<HTMLElement>("[data-fx-reveal]"));
      items.forEach((el, i) => {
        el.style.transitionDelay = `${i * 100}ms`;
      });
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add("is-revealed");
              io.unobserve(e.target);
            }
          });
        },
        { threshold: 0.12 },
      );
      items.forEach((el) => io.observe(el));
      // Safety net: if the observer never fires, reveal anyway so content is
      // never stuck hidden.
      const fallback = window.setTimeout(
        () => items.forEach((el) => el.classList.add("is-revealed")),
        1200,
      );
      cleanups.push(() => {
        io.disconnect();
        window.clearTimeout(fallback);
        root.removeAttribute("data-footer-reveal-ready");
      });
    }

    // ── Cursor spotlight ───────────────────────────────────────────────────
    const spot = root.querySelector<HTMLElement>("[data-fx-spotlight]");
    if (spot && !reduce) {
      const onMove = (e: MouseEvent) => {
        const r = root.getBoundingClientRect();
        spot.style.left = `${e.clientX - r.left}px`;
        spot.style.top = `${e.clientY - r.top}px`;
        spot.style.opacity = "1";
      };
      const onLeave = () => {
        spot.style.opacity = "0";
      };
      root.addEventListener("mousemove", onMove);
      root.addEventListener("mouseleave", onLeave);
      cleanups.push(() => {
        root.removeEventListener("mousemove", onMove);
        root.removeEventListener("mouseleave", onLeave);
      });
    }

    // ── Magnetic CTA ───────────────────────────────────────────────────────
    if (!reduce) {
      root.querySelectorAll<HTMLElement>("[data-fx-magnetic]").forEach((btn) => {
        const strength = 0.3;
        const onMove = (e: MouseEvent) => {
          const r = btn.getBoundingClientRect();
          const x = e.clientX - (r.left + r.width / 2);
          const y = e.clientY - (r.top + r.height / 2);
          btn.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
          btn.style.boxShadow = "0 18px 34px -10px rgba(237,203,85,.75)";
        };
        const onEnter = () => {
          btn.style.transition = "transform .08s linear, box-shadow .3s";
        };
        const onLeave = () => {
          btn.style.transition = "transform .35s cubic-bezier(.2,.7,.2,1), box-shadow .3s";
          btn.style.transform = "translate(0, 0)";
          btn.style.boxShadow = "";
        };
        btn.addEventListener("mousemove", onMove);
        btn.addEventListener("mouseenter", onEnter);
        btn.addEventListener("mouseleave", onLeave);
        cleanups.push(() => {
          btn.removeEventListener("mousemove", onMove);
          btn.removeEventListener("mouseenter", onEnter);
          btn.removeEventListener("mouseleave", onLeave);
        });
      });
    }

    // ── Back to top ────────────────────────────────────────────────────────
    const top = root.querySelector<HTMLElement>("[data-fx-top]");
    if (top) {
      const onClick = (e: Event) => {
        e.preventDefault();
        try {
          window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
        } catch {
          window.scrollTo(0, 0);
        }
      };
      top.addEventListener("click", onClick);
      cleanups.push(() => top.removeEventListener("click", onClick));
    }

    // ── Constellation canvas ───────────────────────────────────────────────
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      let W = 0;
      let H = 0;
      let stars: Star[] = [];

      const seed = () => {
        const count = Math.min(70, Math.max(8, Math.round((W * H) / 22000)));
        stars = [];
        for (let i = 0; i < count; i++) {
          stars.push({
            x: Math.random() * W,
            y: Math.random() * H,
            vx: (Math.random() - 0.5) * 0.16,
            vy: (Math.random() - 0.5) * 0.16,
            r: Math.random() * 1.4 + 0.5,
            tw: Math.random() * Math.PI * 2,
          });
        }
      };

      const draw = () => {
        ctx.clearRect(0, 0, W, H);
        const s = stars;
        for (let i = 0; i < s.length; i++) {
          const p = s[i];
          if (!reduce) {
            p.x += p.vx;
            p.y += p.vy;
            p.tw += 0.02;
            if (p.x < 0) p.x = W;
            if (p.x > W) p.x = 0;
            if (p.y < 0) p.y = H;
            if (p.y > H) p.y = 0;
          }
          for (let j = i + 1; j < s.length; j++) {
            const q = s[j];
            const dx = p.x - q.x;
            const dy = p.y - q.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < LINK_DIST) {
              const a = (1 - d / LINK_DIST) * 0.22;
              ctx.strokeStyle = `rgba(237,203,85,${a})`;
              ctx.lineWidth = 0.6;
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(q.x, q.y);
              ctx.stroke();
            }
          }
        }
        for (let i = 0; i < s.length; i++) {
          const p = s[i];
          const alpha = reduce ? 0.4 : 0.35 + Math.sin(p.tw) * 0.3;
          ctx.fillStyle = `rgba(244,222,138,${Math.max(0.1, alpha)})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
      };

      let raf = 0;
      let running = false;
      let visible = false;
      const tick = () => {
        draw();
        raf = requestAnimationFrame(tick);
      };
      const syncLoop = () => {
        const shouldRun = !reduce && visible && document.visibilityState === "visible";
        if (shouldRun && !running) {
          running = true;
          raf = requestAnimationFrame(tick);
        } else if (!shouldRun && running) {
          running = false;
          cancelAnimationFrame(raf);
        }
      };

      const resize = () => {
        // h-full/w-full stretch the canvas box, but a canvas is a replaced
        // element — its drawing buffer must be sized explicitly from the box.
        W = canvas.clientWidth;
        H = canvas.clientHeight;
        canvas.width = Math.max(1, Math.round(W * dpr));
        canvas.height = Math.max(1, Math.round(H * dpr));
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        seed();
        if (reduce) draw();
      };
      resize();

      const ro = new ResizeObserver(resize);
      ro.observe(canvas);
      const io2 = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        syncLoop();
      });
      io2.observe(canvas);
      const onVis = () => syncLoop();
      document.addEventListener("visibilitychange", onVis);

      cleanups.push(() => {
        running = false;
        cancelAnimationFrame(raf);
        ro.disconnect();
        io2.disconnect();
        document.removeEventListener("visibilitychange", onVis);
      });
    }

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden
        // h-full/w-full are required: a canvas is a replaced element with an
        // intrinsic 300x150 size, so inset-0 alone won't stretch it.
        className="pointer-events-none absolute inset-0 z-[1] h-full w-full opacity-55"
      />
      <div
        data-fx-spotlight
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 z-[1] h-[460px] w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 transition-opacity duration-300"
        style={{ background: "radial-gradient(circle, rgba(244,222,138,.14), transparent 62%)" }}
      />
    </>
  );
}
