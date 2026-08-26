import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "glass-inset text-foreground placeholder:text-muted-foreground/65 flex field-sizing-content min-h-20 w-full px-3.5 py-3 text-sm outline-none transition-[border-color,box-shadow,background-color]",
        "focus-visible:border-ring/60 focus-visible:bg-card/45 focus-visible:ring-ring/20 focus-visible:ring-[4px]",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/25 aria-invalid:ring-[3px]",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
