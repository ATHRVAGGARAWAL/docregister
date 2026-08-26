"use client";

import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Sheet — Radix Dialog with this app's material.
 *
 * Radix rather than a hand-rolled overlay because the parts that are invisible
 * are the parts that matter: focus is trapped and restored, the page behind is
 * inert and scroll-locked, and Escape closes. A review sheet that a doctor can
 * tab out of into the register underneath is a way to sign off on the wrong
 * patient.
 *
 * The scrim is a flat black at alpha rather than a blur — no `backdrop-filter`
 * anywhere in this app. Tailwind compiles `backdrop-blur-*` into a chained
 * custom-property expression that WebKit fails to parse and then drops, so the
 * effect silently disappears on exactly the phones this app is used on.
 */

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
        "fixed inset-0 z-50 bg-[#060812]/68 backdrop-blur-md",
        "data-[state=open]:animate-in data-[state=open]:fade-in-0",
        "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
        className,
      )}
      {...props}
    />
  );
}

/**
 * `side="responsive"` is the one this app actually uses: a bottom sheet on a
 * phone, because it is the natural continuation of a gesture that began at the
 * bottom edge; a centred panel on a laptop, where a full-width strip pinned to
 * the bottom of a 27-inch display would be absurd.
 */
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
          "glass-strong bg-popover/82 text-popover-foreground fixed z-50 flex flex-col border border-border/70 shadow-raise outline-none",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-8",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-bottom-8",
          "duration-300",
          side === "responsive" &&
            "inset-x-2 bottom-2 max-h-[92dvh] rounded-[1.75rem] sm:inset-0 sm:m-auto sm:h-fit sm:max-h-[88dvh] sm:w-full sm:max-w-lg sm:rounded-[1.75rem]",
          side === "bottom" && "inset-x-2 bottom-2 max-h-[92dvh] rounded-[1.75rem]",
          side === "top" && "inset-x-0 top-0 max-h-[92dvh] rounded-b-2xl",
          side === "right" && "inset-y-0 right-0 h-full w-3/4 max-w-sm sm:max-w-md",
          side === "left" && "inset-y-0 left-0 h-full w-3/4 max-w-sm sm:max-w-md",
          className,
        )}
        {...props}
      >
        {/* The grab handle. Purely a signifier — the sheet is not draggable —
            but it is the mark a phone user reads as "this came up from the
            bottom and can go back down". Hidden once the sheet is centred. */}
        {(side === "responsive" || side === "bottom") && (
          <div
            aria-hidden
            className={cn(
              "bg-muted-foreground/35 mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full",
              side === "responsive" && "sm:hidden",
            )}
          />
        )}

        {children}

        {showClose && (
          <SheetPrimitive.Close className="pressable text-muted-foreground hover:bg-secondary/70 hover:text-foreground absolute top-3.5 right-3.5 grid size-9 place-items-center rounded-xl border border-transparent transition-colors hover:border-border/60">
            <XIcon className="size-4" aria-hidden />
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
      className={cn("flex flex-col gap-0.5 px-5 pt-4 pb-3", className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        "border-border mt-auto flex gap-3 border-t px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]",
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
      className={cn("text-foreground text-base font-semibold tracking-[-0.025em]", className)}
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
      className={cn("text-muted-foreground text-xs", className)}
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
