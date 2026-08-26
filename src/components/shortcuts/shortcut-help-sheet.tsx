"use client";

import { useId } from "react";

import { ShortcutKeys } from "@/components/shortcuts/shortcut-keys";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  groupShortcutsByArea,
  isTypingTarget,
  normaliseEventKey,
  type RegisteredShortcut,
} from "@/hooks/use-keyboard-shortcuts";
import { cn } from "@/lib/utils";

function areaSlug(area: string): string {
  return area.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

/**
 * The list of what the keyboard can do right now.
 *
 * "Right now" is the point: it is built from the live registry rather than from
 * a maintained list, so a workspace that is not on screen does not advertise
 * keys that would do nothing, and a shortcut cannot be added without appearing
 * here. Radix gives it a focus trap, Escape, and restoration of focus to
 * whatever was focused when it opened.
 */
export function ShortcutHelpSheet({
  open,
  onOpenChange,
  shortcuts,
  applePlatform,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shortcuts: readonly RegisteredShortcut[];
  applePlatform: boolean;
  className?: string;
}) {
  const headingId = useId();
  const groups = groupShortcutsByArea(shortcuts);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className={cn("sm:max-w-xl", className)}
        onKeyDown={(event) => {
          // "?" opened this, so "?" puts it away — the reflex of anyone who has
          // used the key before. Escape stays Radix's.
          if (normaliseEventKey(event.key) === "?" && !isTypingTarget(event.target)) {
            event.preventDefault();
            onOpenChange(false);
          }
        }}
      >
        <SheetHeader className="pr-14">
          <SheetTitle>Keyboard shortcuts</SheetTitle>
          <SheetDescription>
            These work whenever you are not typing. Inside a text box every key is yours.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-4">
          {groups.length === 0 ? (
            <p className="text-muted-foreground text-xs leading-relaxed">
              Nothing on this screen has claimed a key yet.
            </p>
          ) : (
            groups.map((group) => (
              <section key={group.area} aria-labelledby={`${headingId}-${areaSlug(group.area)}`}>
                <h3 id={`${headingId}-${areaSlug(group.area)}`} className="section-kicker">
                  {group.area}
                </h3>

                <ul className="surface-card mt-2 overflow-hidden">
                  {group.shortcuts.map((shortcut) => (
                    <li
                      key={shortcut.id}
                      className="border-border flex items-start justify-between gap-4 border-b px-3 py-2.5 last:border-b-0"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium tracking-[-0.01em]">
                          {shortcut.label}
                        </span>
                        {shortcut.hint && (
                          <span className="text-muted-foreground mt-0.5 block text-xs leading-relaxed">
                            {shortcut.hint}
                          </span>
                        )}
                      </span>
                      <ShortcutKeys
                        keys={shortcut.keys}
                        applePlatform={applePlatform}
                        className="shrink-0 justify-end pt-0.5"
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>

        <SheetFooter className="items-center justify-between">
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            Press <ShortcutKeys keys="?" applePlatform={applePlatform} /> any time.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
