import * as React from "react";

import { cn } from "@/lib/utils";

type SelectProps = React.ComponentProps<"select"> & {
  containerClassName?: string;
};

function Select({ className, containerClassName, children, ...props }: SelectProps) {
  return (
    <span
      data-slot="select-container"
      className={cn("relative inline-flex w-full min-w-0", containerClassName)}
    >
      <select
        data-slot="select"
        className={cn(
          "surface-inset text-foreground h-10 w-full min-w-0 appearance-none pr-9 pl-3 text-sm outline-none transition-[border-color,box-shadow,background-color]",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20",
          "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
          "disabled:pointer-events-none disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m4 6 4 4 4-4" />
      </svg>
    </span>
  );
}

export { Select, type SelectProps };
