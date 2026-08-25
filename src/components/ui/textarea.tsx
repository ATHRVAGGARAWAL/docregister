import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "well text-foreground placeholder:text-muted-foreground/70 flex field-sizing-content min-h-16 w-full px-3 py-2 text-sm outline-none transition-shadow",
        "focus-visible:border-ring focus-visible:ring-ring/35 focus-visible:ring-[3px]",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/25 aria-invalid:ring-[3px]",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
