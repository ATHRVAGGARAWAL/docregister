import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Badge — a rubber-stamp mark, not a pill of colour.
 *
 * Solid tinted fill plus a matching border at full strength. Because no
 * variant relies on hue alone to carry meaning, each one is always paired with
 * a word ("Needs review", "First visit") at the call site.
 */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-[0.035em] whitespace-nowrap backdrop-blur-md [&>svg]:size-3 [&>svg]:pointer-events-none",
  {
    variants: {
      variant: {
        default: "border-primary/25 bg-primary/10 text-primary shadow-[0_0_18px_-10px_var(--primary)]",
        secondary: "border-border/70 bg-secondary/55 text-secondary-foreground",
        destructive: "border-destructive/25 bg-destructive/10 text-destructive",
        money: "border-money/25 bg-money/10 text-money",
        warning: "border-warning/25 bg-warning/10 text-warning",
        outline: "border-border/70 bg-card/20 text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
