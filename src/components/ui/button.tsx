import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Button — shadcn / 21st.dev registry shape, with this app's physical press.
 *
 * The one departure from the stock registry component is the depth: filled
 * buttons carry `shadow-flat` (a solid slab with a light-catch along its top
 * edge) and every variant travels 1px on `:active` via `.pressable`. That 1px
 * is the entire difference between a control that feels tapped and one that
 * feels merely clicked, and it costs a transform.
 */
const buttonVariants = cva(
  "pressable inline-flex shrink-0 touch-manipulation items-center justify-center gap-2 rounded-xl border border-transparent text-sm font-semibold tracking-[-0.01em] whitespace-nowrap outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/35 disabled:pointer-events-none disabled:opacity-45 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-primary/35 bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.32),0_10px_28px_-14px_color-mix(in_oklch,var(--primary)_82%,transparent)] hover:bg-primary/90",
        destructive:
          "border-destructive/40 bg-destructive text-destructive-foreground shadow-[0_10px_26px_-15px_var(--destructive)] hover:bg-destructive/90",
        // Reads as a slip you can press rather than a filled control — the
        // right weight for a secondary action sitting next to a filled one.
        outline:
          "border-border/70 bg-card/35 text-foreground shadow-flat backdrop-blur-xl hover:border-primary/30 hover:bg-card/55",
        secondary:
          "border-border/60 bg-secondary/70 text-secondary-foreground shadow-flat backdrop-blur-lg hover:bg-secondary",
        // No material at all until it is touched. For dense clusters — icon
        // rails, dismiss buttons — where a slab per control would be noise.
        ghost: "text-muted-foreground hover:border-border/60 hover:bg-card/35 hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2 has-[>svg]:px-3.5",
        sm: "h-8 gap-1.5 rounded-lg px-3 has-[>svg]:px-2.5",
        lg: "h-12 rounded-xl px-6 has-[>svg]:px-4.5",
        icon: "size-10",
        "icon-sm": "size-9 rounded-xl",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
