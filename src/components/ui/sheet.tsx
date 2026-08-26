"use client";

import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";

import { cn } from "@/lib/utils";

function Sheet(props: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger(props: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose(props: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal(props: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-[var(--scrim)]",
        "data-[state=open]:animate-in data-[state=open]:fade-in-0",
        "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
        className,
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = "responsive",
  showClose = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left" | "responsive";
  showClose?: boolean;
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "surface-elevated text-popover-foreground fixed z-50 flex flex-col outline-none",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-4",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-bottom-4",
          "duration-200",
          side === "responsive" &&
            "inset-x-0 bottom-0 max-h-[94dvh] rounded-b-none sm:inset-0 sm:m-auto sm:h-fit sm:max-h-[88dvh] sm:w-full sm:max-w-lg sm:rounded-xl",
          side === "bottom" && "inset-x-0 bottom-0 max-h-[94dvh] rounded-b-none",
          side === "top" && "inset-x-0 top-0 max-h-[94dvh] rounded-t-none",
          side === "right" && "inset-y-0 right-0 h-full w-[min(90vw,28rem)] rounded-r-none",
          side === "left" && "inset-y-0 left-0 h-full w-[min(90vw,28rem)] rounded-l-none",
          className,
        )}
        {...props}
      >
        {(side === "responsive" || side === "bottom") && (
          <div
            aria-hidden
            className={cn(
              "bg-muted-foreground mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full opacity-45",
              side === "responsive" && "sm:hidden",
            )}
          />
        )}

        {children}

        {showClose && (
          <SheetPrimitive.Close className="pressable text-muted-foreground hover:bg-secondary hover:text-foreground absolute top-3 right-3 grid size-9 place-items-center rounded-md border border-transparent">
            <span aria-hidden className="text-xl leading-none">×</span>
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1 px-5 pt-5 pb-3", className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        "border-border bg-popover mt-auto flex gap-3 border-t px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]",
        className,
      )}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-foreground text-base font-semibold tracking-[-0.02em]", className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-muted-foreground text-xs leading-relaxed", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
  SheetOverlay,
  SheetPortal,
};
