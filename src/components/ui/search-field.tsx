import * as React from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type SearchFieldProps = React.ComponentProps<typeof Input> & {
  containerClassName?: string;
  onClear?: () => void;
};

function SearchField({
  className,
  containerClassName,
  onClear,
  value,
  defaultValue,
  ...props
}: SearchFieldProps) {
  const hasValue = value != null ? String(value).length > 0 : defaultValue != null;

  return (
    <div
      data-slot="search-field"
      className={cn("relative flex w-full min-w-0 items-center", containerClassName)}
    >
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        className="text-muted-foreground pointer-events-none absolute left-3 size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      >
        <circle cx="8.5" cy="8.5" r="5.25" />
        <path d="m12.5 12.5 4 4" />
      </svg>
      <Input
        type="search"
        data-slot="search-field-input"
        className={cn("pr-10 pl-9 [&::-webkit-search-cancel-button]:hidden", className)}
        value={value}
        defaultValue={defaultValue}
        {...props}
      />
      {onClear && hasValue ? (
        <button
          type="button"
          aria-label="Clear search"
          className="pressable text-muted-foreground hover:bg-secondary hover:text-foreground absolute right-1 grid size-8 place-items-center rounded-md"
          onClick={onClear}
        >
          <span aria-hidden className="text-lg leading-none">×</span>
        </button>
      ) : null}
    </div>
  );
}

export { SearchField, type SearchFieldProps };
