"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

// Standard fade-up for an entire section or block
export function ScrollRevealWrapper({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.7, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

// Container for staggered children
export function StaggerRevealContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.15 }}
      variants={{
        visible: {
          transition: {
            staggerChildren: 0.15,
          },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

// Individual item for staggered list
export function StaggerRevealItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 40 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.7, ease: "easeOut" },
        },
      }}
    >
      {children}
    </motion.div>
  );
}
