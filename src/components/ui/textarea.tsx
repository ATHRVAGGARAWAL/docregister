import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "surface-inset text-foreground placeholder:text-muted-foreground flex field-sizing-content min-h-24 w-full px-3 py-2.5 text-sm outline-none transition-[border-color,box-shadow,background-color]",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20",
        "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
