"use client";

import { Button } from "@/components/ui/button";
import { useShortcutRegistry } from "@/hooks/use-keyboard-shortcuts";
import { cn } from "@/lib/utils";

/**
 * A way into the help sheet that does not require knowing the key that opens
 * it — which is everybody, the first time.
 *
 * Renders nothing without a provider above it, because a control that opens a
 * sheet nobody mounted is worse than no control.
 */
export function ShortcutHelpButton({ className }: { className?: string }) {
  const registry = useShortcutRegistry();
  if (!registry) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-haspopup="dialog"
      aria-label="Keyboard shortcuts"
      title="Keyboard shortcuts"
      onClick={registry.openHelp}
      className={cn("font-mono text-sm font-semibold", className)}
    >
      <span aria-hidden>?</span>
    </Button>
  );
}
