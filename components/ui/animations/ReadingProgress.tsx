"use client";

import { motion, useScroll, useSpring, useReducedMotion } from "framer-motion";

export default function ReadingProgress() {
  const { scrollYProgress } = useScroll();
  const reduceMotion = useReducedMotion();
  const scaleX = useSpring(
    scrollYProgress,
    reduceMotion
      ? { stiffness: 1000, damping: 1000, restDelta: 0.001 }
      : { stiffness: 100, damping: 30, restDelta: 0.001 },
  );

  return (
    <motion.div
      aria-hidden="true"
      className="fixed left-0 right-0 top-0 z-[100] h-[3px] origin-left bg-gradient-to-r from-brand to-accent"
      style={{ scaleX }}
    />
  );
}
