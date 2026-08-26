import * as React from "react";

import { cn } from "@/lib/utils";

type SwitchProps = Omit<React.ComponentProps<"input">, "type"> & {
  onCheckedChange?: (checked: boolean) => void;
};

function Switch({ className, onChange, onCheckedChange, ...props }: SwitchProps) {
  return (
    <input
      type="checkbox"
      role="switch"
      data-slot="switch"
      className={cn(
        "border-border bg-secondary relative h-6 w-10 shrink-0 cursor-pointer appearance-none rounded-full border outline-none transition-colors",
        "before:bg-background before:absolute before:top-0.5 before:left-0.5 before:size-4.5 before:rounded-full before:shadow-flat before:transition-transform before:content-['']",
        "checked:border-primary checked:bg-primary checked:before:translate-x-4",
        "focus-visible:ring-3 focus-visible:ring-ring/20",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45",
        className,
      )}
      onChange={(event) => {
        onChange?.(event);
        onCheckedChange?.(event.currentTarget.checked);
      }}
      {...props}
    />
  );
}

export { Switch, type SwitchProps };
