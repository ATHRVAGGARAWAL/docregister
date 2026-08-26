import * as React from "react";

import { cn } from "@/lib/utils";

function SegmentedControl({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      role="radiogroup"
      data-slot="segmented-control"
      className={cn("surface-inset inline-flex items-center gap-0.5 p-1", className)}
      {...props}
    />
  );
}

type SegmentedControlItemProps = React.ComponentProps<"button"> & {
  selected?: boolean;
};

function SegmentedControlItem({
  className,
  selected = false,
  type = "button",
  ...props
}: SegmentedControlItemProps) {
  return (
    <button
      type={type}
      role="radio"
      aria-checked={selected}
      data-slot="segmented-control-item"
      data-state={selected ? "active" : "inactive"}
      className={cn(
        "pressable text-muted-foreground inline-flex h-8 min-w-0 items-center justify-center rounded-md border border-transparent px-3 text-xs font-medium whitespace-nowrap outline-none",
        "hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/20",
        "data-[state=active]:border-border data-[state=active]:bg-popover data-[state=active]:text-foreground data-[state=active]:shadow-flat",
        "disabled:pointer-events-none disabled:opacity-45 [@media(pointer:coarse)]:min-h-11",
        className,
      )}
      {...props}
    />
  );
}

export { SegmentedControl, SegmentedControlItem, type SegmentedControlItemProps };
