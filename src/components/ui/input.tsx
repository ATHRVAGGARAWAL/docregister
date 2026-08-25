import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Input — a well cut into the surface.
 *
 * The inverse of a card: the shadows move inside and a highlight appears along
 * the lower lip, because that lip is now the edge catching the light. It is
 * the oldest affordance in interface design and it still works — a recess
 * reads as "put something in me" before any label is read.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "well text-foreground placeholder:text-muted-foreground/70 flex h-10 w-full min-w-0 px-3 py-2 text-sm outline-none transition-shadow",
        "file:text-foreground file:inline-flex file:border-0 file:bg-transparent file:text-sm file:font-medium",
        "focus-visible:border-ring focus-visible:ring-ring/35 focus-visible:ring-[3px]",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/25 aria-invalid:ring-[3px]",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
