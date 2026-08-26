import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Focus is marked twice on a Button, and that is now deliberate. The base
// `:focus-visible` rule in globals.css paints an outline with `!important`, so a
// `focus-visible:outline-none` here cannot suppress it — importance outranks
// layer order — and a component that has to be overruled to stay accessible is
// one grep away from being copied. The ring sits inside that outline rather than
// replacing it.
//
// `--ring` (#0046b8) measures 8.18:1 on `--background`, well past the 3:1 a
// focus indicator owes. The earlier 25%-opacity ring measured ~1.4:1, which is
// what the full token replaced.
const buttonVariants = cva(
  "pressable inline-flex shrink-0 touch-manipulation items-center justify-center gap-2 rounded-lg border border-transparent text-sm font-medium tracking-[-0.01em] whitespace-nowrap select-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-primary bg-primary text-primary-foreground shadow-flat hover:bg-[#0064c8] dark:hover:bg-[#409cff]",
        destructive:
          "border-destructive bg-destructive text-destructive-foreground shadow-flat hover:bg-[#b80012] dark:hover:bg-[#ff6961]",
        outline:
          "border-border bg-background text-foreground shadow-flat hover:border-primary hover:bg-primary-soft hover:text-primary",
        secondary:
          "border-border bg-secondary text-secondary-foreground shadow-flat hover:border-muted-foreground/60 hover:bg-card",
        ghost: "text-muted-foreground hover:bg-secondary hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2 has-[>svg]:px-3.5",
        sm: "h-8 gap-1.5 rounded-md px-3 text-xs has-[>svg]:px-2.5",
        lg: "h-11 rounded-lg px-5 has-[>svg]:px-4",
        icon: "size-10",
        "icon-sm": "size-9 rounded-md",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants, type ButtonProps };
