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
  "pressable inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap outline-none transition-colors select-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-flat hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-flat hover:bg-destructive/90",
        // Reads as a slip you can press rather than a filled control — the
        // right weight for a secondary action sitting next to a filled one.
        outline:
          "border border-border bg-card text-foreground shadow-flat hover:bg-secondary",
        secondary:
          "bg-secondary text-secondary-foreground shadow-flat hover:bg-secondary/80",
        // No material at all until it is touched. For dense clusters — icon
        // rails, dismiss buttons — where a slab per control would be noise.
        ghost: "text-muted-foreground hover:bg-secondary hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 gap-1.5 rounded-sm px-3 has-[>svg]:px-2.5",
        lg: "h-11 rounded-lg px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8 rounded-sm",
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
