"use client";

import { AnimatePresence, type HTMLMotionProps, motion } from "motion/react";

import { useMotion } from "@/components/motion/use-motion";
import { cn } from "@/lib/utils";

type CollapseProps = Omit<
  HTMLMotionProps<"div">,
  "variants" | "initial" | "animate" | "exit" | "custom" | "transition"
> & {
  /** Whether the content is disclosed. */
  open: boolean;
};

/**
 * Disclosure: content that is genuinely absent when closed rather than present
 * and hidden. A screen reader never meets it, and neither does the Tab key —
 * which matters more than the animation does, because a collapsed section full
 * of reachable-but-invisible fields is a keyboard trap with no exit.
 *
 * The control that toggles it is the caller's, and it should carry
 * `aria-expanded` plus an `aria-controls` pointing at an `id` passed through
 * here. Nothing about the movement conveys the state on its own.
 *
 * `overflow-hidden` is not optional and is applied here rather than asked for:
 * without it the content spills out of the shrinking box on the way closed.
 */
export function Collapse({ open, className, children, ...rest }: CollapseProps) {
  const { variants } = useMotion();

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          {...rest}
          className={cn("overflow-hidden", className)}
          variants={variants.collapse}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
