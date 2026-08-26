import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap [&>svg]:size-3 [&>svg]:pointer-events-none",
  {
    variants: {
      variant: {
        // Measured against the tokens as they stand: `--primary` on
        // `--primary-soft` is 7.23:1 light and 4.81:1 dark, so the plain token
        // already clears AA in both. Mixing 85% toward `--foreground` takes them
        // to 8.24:1 and 5.72:1 — no threshold is crossed by it, and the light
        // theme gains nothing it needed.
        //
        // Kept for the dark theme alone, where 4.81:1 is the narrowest margin in
        // the palette and a badge is often the only thing naming a visit's
        // status. One expression covers both themes because it darkens against a
        // pale chip and lightens against a deep one, so no second blue is added.
        // The border keeps the pure token: a non-text boundary owes only 3:1.
        default:
          "border-primary bg-primary-soft text-[color-mix(in_srgb,var(--primary)_85%,var(--foreground))]",
        secondary: "border-border bg-secondary text-secondary-foreground",
        destructive: "border-destructive bg-destructive-soft text-destructive",
        money: "border-money bg-money-soft text-money",
        warning: "border-warning bg-warning-soft text-warning",
        outline: "border-border bg-background text-muted-foreground",
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
