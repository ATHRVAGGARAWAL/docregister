import { Fragment } from "react";

import {
  formatChord,
  parseShortcut,
  type ShortcutKeyLabel,
} from "@/hooks/use-keyboard-shortcuts";
import { cn } from "@/lib/utils";

/**
 * One key cap.
 *
 * A glyph is drawn but not always spoken: a screen reader reading the Command
 * sign aloud announces "place of interest sign", and an arrow announces
 * nothing at all. Where the drawn symbol is not the name of the key, the name
 * goes beside it for assistive tech and the glyph is hidden from it.
 */
export function ShortcutKeyCap({
  symbol,
  spoken,
  className,
}: ShortcutKeyLabel & { className?: string }) {
  return (
    <kbd
      className={cn(
        "border-border bg-secondary text-foreground shadow-flat inline-grid h-6 min-w-6 place-items-center rounded-md border px-1.5 font-mono text-[0.6875rem] leading-none font-semibold",
        className,
      )}
    >
      {symbol === spoken ? (
        <span>{symbol}</span>
      ) : (
        <>
          <span aria-hidden>{symbol}</span>
          <span className="sr-only">{spoken}</span>
        </>
      )}
    </kbd>
  );
}

/**
 * A whole shortcut, drawn from the same string the registry matches against —
 * so the caps and the behaviour cannot drift apart.
 *
 * "then" is rendered as a word rather than a separator glyph because it is the
 * difference between two keys pressed together and two pressed in turn, and a
 * comma does not say that to anybody.
 */
export function ShortcutKeys({
  keys,
  applePlatform,
  className,
}: {
  keys: string;
  applePlatform: boolean;
  className?: string;
}) {
  const chords = parseShortcut(keys);

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {chords.map((chord, chordIndex) => (
        <Fragment key={`${chord.key}-${chordIndex}`}>
          {chordIndex > 0 && (
            <span className="text-muted-foreground px-0.5 text-[0.6875rem]">then</span>
          )}
          {formatChord(chord, applePlatform).map((cap, capIndex) => (
            <ShortcutKeyCap key={`${cap.symbol}-${capIndex}`} {...cap} />
          ))}
        </Fragment>
      ))}
    </span>
  );
}
