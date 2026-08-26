import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "surface-inset text-foreground placeholder:text-muted-foreground flex h-10 w-full min-w-0 px-3 py-2 text-sm outline-none transition-[border-color,box-shadow,background-color]",
        "file:text-foreground file:inline-flex file:border-0 file:bg-transparent file:text-sm file:font-medium",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20",
        "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
