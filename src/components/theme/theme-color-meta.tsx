"use client";

import * as React from "react";

import { useTheme } from "@/components/theme/use-theme";

/**
 * Makes the browser chrome follow an explicit theme choice.
 *
 * The root layout ships two `theme-color` metas, one per `prefers-color-scheme`
 * — which is right while the preference is `system` and wrong the moment it is
 * not. A doctor on a light phone who picks Dark gets a dark register under a
 * white status bar, and installed to the home screen that band is the only
 * chrome there is. The layout's own comment names this gap; this closes it
 * without the layout having to know about it.
 *
 * Both metas are rewritten rather than a third being appended, because the
 * browser uses the first one whose `media` matches and a new media-less tag
 * appended at the end would lose to the light one already ahead of it.
 *
 * Renders nothing. Mount once, anywhere in the tree.
 */
export function ThemeColorMeta() {
  const { preference, resolved, ready } = useTheme();
  // The authored `content` of each tag, captured before anything is written, so
  // returning to `system` restores exactly what the layout declared instead of
  // a colour this component invented.
  const authored = React.useRef<Map<HTMLMetaElement, string> | null>(null);

  React.useEffect(() => {
    if (!ready) return;

    const metas = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
    if (metas.length === 0) return;

    if (!authored.current) {
      authored.current = new Map(metas.map((meta) => [meta, meta.content]));
    }

    if (preference === "system") {
      for (const meta of metas) {
        const original = authored.current.get(meta);
        if (original !== undefined) meta.content = original;
      }
      return;
    }

    // Read the painted background rather than naming a colour: the page's own
    // `--background` is the only thing the chrome should ever be flush with,
    // and it is defined in `globals.css`, not here.
    const painted = getComputedStyle(document.documentElement).backgroundColor;
    if (!painted || painted === "rgba(0, 0, 0, 0)") return;
    for (const meta of metas) meta.content = painted;
  }, [preference, resolved, ready]);

  return null;
}
