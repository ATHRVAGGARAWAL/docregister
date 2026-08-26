import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative grid w-full grid-cols-[auto_1fr] items-start gap-x-3 rounded-xl border px-4 py-3 text-sm",
  {
    variants: {
      variant: {
        default: "border-border bg-card text-foreground",
        destructive:
          "border-destructive bg-destructive-soft text-foreground [&>svg]:text-destructive",
        success: "border-money bg-money-soft text-foreground [&>svg]:text-money",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

/**
 * `role` is opt-in, not `role="alert"` by default.
 *
 * It used to default to alert — an assertive live region that interrupts a
 * screen reader mid-sentence — and four of six call sites immediately overrode
 * it with `role="note"` or `role="status"`. When most consumers are fighting a
 * default, the default is wrong: a statically-rendered "India data residency"
 * panel should not interrupt anyone. Errors pass `role="alert"` explicitly.
 */
function Alert({
  className,
  variant,
  role,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      {...(role ? { role } : {})}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn("col-start-2 font-medium leading-5", className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "col-start-2 text-xs leading-relaxed text-muted-foreground [&_p]:leading-relaxed",
        className,
      )}
      {...props}
    />
  );
}

export { Alert, AlertDescription, AlertTitle };
