"use client";

import * as React from "react";
import * as SeparatorPrimitive from "@radix-ui/react-separator";

import { cn } from "@/lib/utils";

function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px",
        // A decorative rule is texture and can stay quiet. A non-decorative one
        // is announced as a separator, which means it is the only thing marking
        // the boundary it claims — so it takes the 3:1 line instead of the
        // 1.51:1 one. Pass `decorative={false}` and an `aria-label` together.
        decorative ? "bg-border" : "bg-field-border",
        // Forced-colours mode repaints every background as the system Canvas,
        // which erases a rule drawn as a 1px background.
        "forced-colors:bg-[CanvasText]",
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
