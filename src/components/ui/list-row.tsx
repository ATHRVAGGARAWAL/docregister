import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/lib/utils";

type ListRowProps = React.ComponentProps<"div"> & {
  asChild?: boolean;
  interactive?: boolean;
  selected?: boolean;
};

function ListRow({
  asChild = false,
  className,
  interactive = false,
  selected = false,
  ...props
}: ListRowProps) {
  const Comp = asChild ? Slot : "div";

  return (
    <Comp
      data-slot="list-row"
      data-interactive={interactive || undefined}
      data-selected={selected || undefined}
      className={cn(
        "border-border flex min-h-12 items-center gap-3 border-b px-4 py-2.5 last:border-b-0",
        interactive && "pressable cursor-pointer hover:bg-secondary",
        selected && "bg-primary-soft",
        className,
      )}
      {...props}
    />
  );
}

function ListRowContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="list-row-content"
      className={cn("min-w-0 flex-1", className)}
      {...props}
    />
  );
}

function ListRowTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="list-row-title"
      className={cn("truncate text-sm font-medium", className)}
      {...props}
    />
  );
}

function ListRowDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="list-row-description"
      className={cn("text-muted-foreground mt-0.5 truncate text-xs", className)}
      {...props}
    />
  );
}

function ListRowAside({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="list-row-aside"
      className={cn("text-muted-foreground ml-auto shrink-0 text-xs", className)}
      {...props}
    />
  );
}

export { ListRow, ListRowAside, ListRowContent, ListRowDescription, ListRowTitle };
