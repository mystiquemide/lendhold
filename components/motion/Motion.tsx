"use client";

import { useRef, type ReactNode } from "react";
import { MotionConfig, motion, useMotionValue, useReducedMotion, useSpring, useTransform, type Variants } from "motion/react";

const EASE = [0.22, 1, 0.36, 1] as const;
/** Reduced motion: same starting markup as the server, shown at once. */
const INSTANT = { duration: 0 } as const;

/** Honours the visitor's reduced-motion setting for every animation below it. */
export function MotionRoot({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

/** Fades a block up out of a soft blur the first time it scrolls into view. Use `as="li"` inside lists. */
export function Reveal({
  children,
  delay = 0,
  className,
  as = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "li";
}) {
  const reduce = useReducedMotion();
  const Tag = as === "li" ? motion.li : motion.div;
  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y: 28, filter: "blur(8px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, amount: 0.15 }}
      transition={reduce ? INSTANT : { duration: 0.9, ease: EASE, delay }}
    >
      {children}
    </Tag>
  );
}

const group: Variants = { hidden: {}, shown: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } } };
const groupInstant: Variants = { hidden: {}, shown: {} };
const item: Variants = {
  hidden: { opacity: 0, y: 22, filter: "blur(10px)" },
  shown: { opacity: 1, y: 0, filter: "blur(0px)" },
};

/** Plays its Stagger.Item children in sequence on first paint. */
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} variants={reduce ? groupInstant : group} initial="hidden" animate="shown">
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} variants={item} transition={reduce ? INSTANT : { duration: 0.85, ease: EASE }}>
      {children}
    </motion.div>
  );
}

/** Rises into place after the hero copy, then tilts gently toward the pointer on desktop. */
export function HeroStage({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [3, -3]), { stiffness: 120, damping: 20 });
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-4, 4]), { stiffness: 120, damping: 20 });

  return (
    <div style={{ perspective: 1600 }} className={className}>
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 60, scale: 0.96, filter: "blur(12px)" }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
        transition={reduce ? INSTANT : { duration: 1.2, ease: EASE, delay: 0.45 }}
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        onPointerMove={(e) => {
          if (reduce || e.pointerType !== "mouse" || !ref.current) return;
          const r = ref.current.getBoundingClientRect();
          px.set((e.clientX - r.left) / r.width - 0.5);
          py.set((e.clientY - r.top) / r.height - 0.5);
        }}
        onPointerLeave={() => {
          px.set(0);
          py.set(0);
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}
