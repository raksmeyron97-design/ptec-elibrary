"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";

const container: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

type ContainerTag = "div" | "ul";
type ItemTag = "div" | "li";

export function StaggerGrid({
  children,
  className,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: ContainerTag;
}) {
  const reduceMotion = useReducedMotion();
  const Component = as === "ul" ? motion.ul : motion.div;

  return (
    <Component
      variants={reduceMotion ? undefined : container}
      initial={reduceMotion ? undefined : "hidden"}
      whileInView={reduceMotion ? undefined : "show"}
      viewport={{ once: true, margin: "-50px" }}
      className={className}
    >
      {children}
    </Component>
  );
}

export function StaggerItem({
  children,
  className,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: ItemTag;
}) {
  const reduceMotion = useReducedMotion();
  const Component = as === "li" ? motion.li : motion.div;

  return (
    <Component variants={reduceMotion ? undefined : item} className={className}>
      {children}
    </Component>
  );
}
