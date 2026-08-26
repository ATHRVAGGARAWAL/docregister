"use client";

import * as React from "react";

interface SkipLinkProps {
  /**
   * Element focus should land on. If nothing carries this id the link falls back
   * to the first `<main>` on the page, so it works before anyone gets round to
   * labelling the landmark.
   */
  targetId?: string;
  children?: React.ReactNode;
}

/**
 * The first focusable thing on the page: one Tab from a cold load, and the
 * doctor is past the header and the workspace switcher.
 *
 * Rendered off-screen rather than hidden — `display: none` would take it out of
 * the tab order, which is the only order it exists for. `.skip-link` in
 * globals.css brings it back on `:focus`.
 */
export function SkipLink({
  targetId = "main-content",
  children = "Skip to main content",
}: SkipLinkProps) {
  const handleClick = React.useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      const target = document.getElementById(targetId) ?? document.querySelector("main");
      // No landmark to jump to: leave the browser to do whatever the href means
      // rather than swallowing the click.
      if (!target) return;

      event.preventDefault();

      // A landmark is not focusable, so the href alone would scroll the page and
      // leave focus on the link — the next Tab would go back into the header.
      if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      target.setAttribute("data-skip-target", "");

      target.focus({ preventScroll: true });
      target.scrollIntoView({
        block: "start",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    },
    [targetId],
  );

  return (
    <a className="skip-link" href={`#${targetId}`} onClick={handleClick}>
      {children}
    </a>
  );
}
