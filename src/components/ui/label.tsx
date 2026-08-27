"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { Slottable } from "@radix-ui/react-slot";

import { cn } from "@/lib/utils";

type LabelProps = React.ComponentProps<typeof LabelPrimitive.Root> & {
  /**
   * Marks the field as required in both channels at once: an asterisk for sight
   * and the word for a screen reader. A bare red `*` is the version this app had
   * been hand-rolling, and it says nothing at all when the label is read aloud.
   */
  required?: boolean;
};

function Label({ className, required = false, children, ...props }: LabelProps) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "text-foreground flex items-center gap-1.5 text-xs font-medium select-none",
        "group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50",
        className,
      )}
      {...props}
    >
      {/* `Slottable` rather than a bare `{children}`, because callers pass
          `asChild` — the review sheet does, so that the visible label and the
          field share one `<label>` element. Radix's Slot runs `Children.only`,
          and appending anything after `{children}` makes the child list an
          array of two even when the second entry is `null`. That threw
          "Primitive.label failed to slot onto its children" and, since it threw
          during render, took the whole review sheet with it the moment a doctor
          finished dictating. This marks which child to slot onto instead. */}
      <Slottable>{children}</Slottable>
      {required ? (
        <>
          {/* A glyph, not a colour — the asterisk still marks the field for a
              doctor who cannot pick the red out. */}
          <span aria-hidden className="text-destructive">
            *
          </span>
          <span className="sr-only">(required)</span>
        </>
      ) : null}
    </LabelPrimitive.Root>
  );
}

export { Label, type LabelProps };
