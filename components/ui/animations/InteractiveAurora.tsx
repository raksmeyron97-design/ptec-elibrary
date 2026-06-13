"use client";

import { useRef, useEffect } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";

// Centered radial-gradient blob driven by motion values
function GlowOrb({
  x,
  y,
  size,
  color,
  blurPx,
}: {
  x: MotionValue<number>;
  y: MotionValue<number>;
  size: number;
  color: string;
  blurPx: number;
}) {
  const half = size / 2;
  const tx = useTransform(x, (v) => v - half);
  const ty = useTransform(y, (v) => v - half);

  return (
    <motion.div
      aria-hidden
      style={{
        x: tx,
        y: ty,
        width: size,
        height: size,
        background: `radial-gradient(circle, ${color} 0%, transparent 68%)`,
        filter: `blur(${blurPx}px)`,
      }}
      className="absolute left-0 top-0 rounded-full will-change-transform"
    />
  );
}

/**
 * Drop this inside any `position: relative` hero section.
 * It attaches a mousemove listener to its *parent* element so the
 * page stays a pure Server Component — no "use client" needed there.
 *
 * Suggested placement (hero section):
 *   <InteractiveAurora className="absolute inset-0 -z-10" />
 */
export default function InteractiveAurora({
  className,
}: {
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);

  // Gold orb — tighter spring, follows the cursor closely
  const rawX1 = useMotionValue(0);
  const rawY1 = useMotionValue(0);
  const x1 = useSpring(rawX1, { stiffness: 58, damping: 22, mass: 1 });
  const y1 = useSpring(rawY1, { stiffness: 58, damping: 22, mass: 1 });

  // Cyan orb — looser spring + spatial offset → layered depth illusion
  const rawX2 = useMotionValue(0);
  const rawY2 = useMotionValue(0);
  const x2 = useSpring(rawX2, { stiffness: 36, damping: 19, mass: 1.3 });
  const y2 = useSpring(rawY2, { stiffness: 36, damping: 19, mass: 1.3 });

  useEffect(() => {
    const parent = wrapRef.current?.parentElement as HTMLElement | null;
    if (!parent) return;

    // Seed both orbs at the section center so they don't jump in from (0,0)
    const { width, height } = parent.getBoundingClientRect();
    rawX1.set(width / 2);
    rawY1.set(height / 2);
    rawX2.set(width / 2 + 110);
    rawY2.set(height / 2 - 70);

    function onMove(e: MouseEvent) {
      const rect = parent!.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      rawX1.set(mx);
      rawY1.set(my);
      // Cyan trails with a consistent spatial offset for dual-colour richness
      rawX2.set(mx + 130);
      rawY2.set(my - 90);
    }

    parent.addEventListener("mousemove", onMove);
    return () => parent.removeEventListener("mousemove", onMove);
  }, [rawX1, rawY1, rawX2, rawY2]);

  return (
    <div
      ref={wrapRef}
      aria-hidden
      className={`pointer-events-none overflow-hidden ${className ?? ""}`}
    >
      {/* Gold — PTEC brand warm glow */}
      <GlowOrb x={x1} y={y1} size={640} color="rgba(251,191,36,0.18)" blurPx={115} />
      {/* Cyan — cool counterpoint, lazier for depth */}
      <GlowOrb x={x2} y={y2} size={520} color="rgba(34,211,238,0.14)" blurPx={135} />
    </div>
  );
}
