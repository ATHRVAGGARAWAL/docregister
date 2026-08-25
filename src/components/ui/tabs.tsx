"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

/**
 * Tabs — used here as a hardware segmented control.
 *
 * The track is a `.well`, recessed into the page; the active segment is a
 * raised slip sitting in it. So "which range am I looking at" is answered by
 * depth rather than by a tint, which survives being glanced at on a bright
 * phone screen in a clinic far better than a 10%-alpha background does.
 */
function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn("well inline-flex w-fit items-center gap-1 p-1", className)}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "pressable text-muted-foreground inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-sm px-3 text-xs font-medium whitespace-nowrap transition-colors outline-none select-none",
        "hover:text-foreground",
        "focus-visible:ring-ring/40 focus-visible:ring-[3px]",
        "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-flat data-[state=active]:border data-[state=active]:border-border",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn(
        // Radix puts `tabIndex={0}` on the active panel, so it *is* a focus
        // stop — and `outline-none` with no replacement made it a focus stop
        // with no visible indicator. `TabsTrigger` two functions up pairs the
        // two correctly; this did not.
        "flex-1 outline-none focus-visible:ring-ring/40 focus-visible:ring-[3px] focus-visible:rounded-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
