"use client";

import { AnimatePresence, type HTMLMotionProps, motion } from "motion/react";
import type * as React from "react";

import { useMotion } from "@/components/motion/use-motion";
import type { EnterVariantName } from "@/lib/motion";

/** Props the system supplies. A call site that set these would be back to ad-hoc motion. */
type Controlled = "variants" | "initial" | "animate" | "exit" | "custom" | "transition";

interface EnterOptions {
  /** Which entrance. Defaults to `rise`, the one nearly everything wants. */
  variant?: EnterVariantName;
  /**
   * Position in a staggered group. Leave it out for anything that is not one of
   * several things appearing at once — a lone element with a delay is just a
   * slow element.
   */
  index?: number;
}

type RevealProps = Omit<HTMLMotionProps<"div">, Controlled> & EnterOptions;

/**
 * One thing arriving and leaving. Wrap it in `<AnimatePresence>` if it also has
 * to animate on the way out; on its own it animates in and then gets out of the
 * way.
 *
 * For something that appears in response to an action — a result, a warning, a
 * banner — not for content that is already in the server's HTML. An entrance
 * starts from `hidden`, and `hidden` is what the server renders: this wrapped
 * around a page of the register would serve `opacity: 0` and rely on hydration
 * to reveal it. `<RevealList>` is the shape for content that is already there.
 */
export function Reveal({ variant = "rise", index, ...rest }: RevealProps) {
  const { variants } = useMotion();

  return (
    <motion.div
      {...rest}
      variants={variants[variant]}
      custom={index}
      initial="hidden"
      animate="visible"
      exit="exit"
    />
  );
}

interface RevealListProps extends React.ComponentProps<"ol"> {
  /**
   * Ordered by default: a register, a timeline and a result set all have a
   * meaningful sequence, and that sequence is worth announcing.
   */
  ordered?: boolean;
  /**
   * Whether rows that are already there on first paint animate in.
   *
   * Off by default, and that is the whole point of the entrance: it means "this
   * row is new". Playing it for a page of history says the opposite, and says it
   * to someone who opened the register to read the history.
   *
   * It also puts back the hazard `<RevealList>` exists to avoid. Measured
   * through `react-dom/server`: on with it, a row server-renders as
   * `style="opacity:0;transform:translateY(8px)"` and only hydration reveals it;
   * off, it renders at `opacity:1`. Do not turn it on for server-rendered
   * content — a register that arrives invisible when hydration fails is worse
   * than one that arrives without an animation.
   */
  animateInitial?: boolean;
}

/**
 * The list half of a staggered list. Holds the `<AnimatePresence>` so removed
 * rows can finish leaving, which they cannot do from inside the child.
 *
 * `popLayout` takes an exiting row out of flow, so the rows below it close the
 * gap while it fades rather than after — without it a deleted visit leaves a
 * hole in the register for the length of the exit.
 */
export function RevealList({
  ordered = true,
  animateInitial = false,
  children,
  ...rest
}: RevealListProps) {
  const List = ordered ? "ol" : "ul";

  return (
    // Tailwind's preflight sets `list-style: none` on every `ol` and `ul`, and
    // Safari drops the list role from a list styled that way, taking the item
    // count and the position-in-list with it. The role puts back what the reset
    // took, and that sequence is the whole justification for this being a list.
    // (`dashboard/stat-rail.tsx` also sets `role="list"`, but for a different
    // reason — it is a `<div>`, which never had the role to lose.)
    <List role="list" {...rest}>
      <AnimatePresence initial={animateInitial} mode="popLayout">
        {children}
      </AnimatePresence>
    </List>
  );
}

type RevealItemProps = Omit<HTMLMotionProps<"li">, Controlled | "layout"> &
  EnterOptions & {
    /**
     * Animate this row to its new position when the rows around it change.
     * Ignored under reduced motion, where the row simply appears where it now
     * belongs.
     */
    layout?: boolean;
  };

/** A row of a `<RevealList>`. Needs a stable `key`, like any list child. */
export function RevealItem({
  variant = "rise",
  index,
  layout: animateLayout = true,
  ...rest
}: RevealItemProps) {
  const { variants, layout, transition } = useMotion();

  return (
    <motion.li
      {...rest}
      layout={animateLayout && layout}
      transition={{ layout: transition.layout }}
      variants={variants[variant]}
      custom={index}
      initial="hidden"
      animate="visible"
      exit="exit"
    />
  );
}
