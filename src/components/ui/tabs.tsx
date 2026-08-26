"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

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
      className={cn("surface-inset inline-flex w-fit items-center gap-0.5 p-1", className)}
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
        "pressable text-muted-foreground inline-flex h-8 flex-1 touch-manipulation items-center justify-center gap-1.5 rounded-md border border-transparent px-3 text-xs font-medium whitespace-nowrap outline-none select-none [@media(pointer:coarse)]:min-h-11",
        "hover:text-foreground",
        "focus-visible:ring-3 focus-visible:ring-ring/20",
        "data-[state=active]:border-border data-[state=active]:bg-popover data-[state=active]:text-foreground data-[state=active]:shadow-flat",
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
        "flex-1 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/20",
        className,
      )}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
