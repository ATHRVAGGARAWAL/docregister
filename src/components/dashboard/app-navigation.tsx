"use client";

import { useState } from "react";

import {
  ClipboardClockIcon,
  ClipboardListIcon,
  ClipboardPenLineIcon,
  HistoryIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  Settings2Icon,
  ShieldCheckIcon,
  UsersRoundIcon,
} from "@/components/icons";
import { BrandLockup, BrandMark } from "@/components/brand/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type AppView =
  | "overview"
  | "register"
  | "patients"
  | "recall"
  | "follow-ups"
  | "accounts"
  | "settings";

const items = [
  { id: "overview", label: "Overview", icon: LayoutDashboardIcon },
  { id: "register", label: "Register", icon: ClipboardListIcon },
  { id: "patients", label: "Patients", icon: UsersRoundIcon },
  { id: "recall", label: "Recall", icon: HistoryIcon },
  { id: "follow-ups", label: "Follow-ups", icon: ClipboardClockIcon },
  { id: "accounts", label: "Accounts", icon: LandmarkIcon },
  { id: "settings", label: "Settings", icon: Settings2Icon },
] as const;

export function AppNavigation({
  active,
  doctorName,
  speciality,
  role,
  onChange,
  onManualEntry,
  onSignOut,
}: {
  active: AppView;
  doctorName: string;
  speciality: string | null;
  role: string;
  onChange: (view: AppView) => void;
  onManualEntry: () => void;
  onSignOut: () => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const initials = doctorName
    .replace(/^(dr\.?|prof\.?)\s+/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-border bg-background lg:flex lg:flex-col">
        <div className="border-b border-border px-5 py-5">
          <BrandLockup subtitle="Clinical workspace" />
        </div>

        <ProfileBlock
          doctorName={doctorName}
          speciality={speciality}
          role={role}
          initials={initials}
          className="mx-4 mt-4"
        />

        <NavigationList active={active} onChange={onChange} className="flex-1 px-3 py-4" />

        <div className="space-y-3 border-t border-border p-4">
          <Button type="button" className="w-full justify-start" onClick={onManualEntry}>
            <ClipboardPenLineIcon className="size-4" aria-hidden />
            Enter visit manually
          </Button>
          <div className="flex items-center justify-between gap-3">
            <ThemeToggle />
            <Button type="button" variant="ghost" size="icon" onClick={onSignOut} aria-label="Sign out">
              <LogOutIcon className="size-4" aria-hidden />
            </Button>
          </div>
          <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            Encrypted records stay in the Mumbai region.
          </p>
        </div>
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-background px-4 lg:hidden">
          <SheetTrigger asChild>
            <button
              type="button"
              className="pressable grid size-11 place-items-center rounded-lg text-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Open workspace menu"
            >
              <span className="grid gap-1" aria-hidden>
                <span className="h-px w-5 bg-current" />
                <span className="h-px w-5 bg-current" />
                <span className="h-px w-5 bg-current" />
              </span>
            </button>
          </SheetTrigger>
          <BrandMark compact />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
            {items.find((item) => item.id === active)?.label}
          </span>
        </header>

        <SheetContent side="left" className="w-[min(82vw,19rem)] rounded-none border-r border-border bg-background p-0" showClose>
          <SheetHeader className="border-b border-border px-4 py-4 text-left">
            <BrandLockup subtitle="Clinical workspace" />
            <SheetTitle className="sr-only">Workspace menu</SheetTitle>
            <SheetDescription className="sr-only">Choose a workspace or account action.</SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <ProfileBlock
              doctorName={doctorName}
              speciality={speciality}
              role={role}
              initials={initials}
              className="mx-3 mt-3"
              compact
            />
            <NavigationList
              active={active}
              onChange={(next) => {
                onChange(next);
                setMobileOpen(false);
              }}
              className="px-2 py-2.5"
              closeItems
            />
          </div>

          <div className="space-y-2.5 border-t border-border p-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
            <SheetClose asChild>
              <Button type="button" className="w-full justify-start" onClick={onManualEntry}>
                <ClipboardPenLineIcon className="size-4" aria-hidden />
                Enter visit manually
              </Button>
            </SheetClose>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">Appearance</p>
              <ThemeToggle className="scale-90 origin-right" />
            </div>
            <SheetClose asChild>
              <Button type="button" variant="outline" className="w-full justify-start" onClick={onSignOut}>
                <LogOutIcon className="size-4" aria-hidden />
                Sign out
              </Button>
            </SheetClose>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function NavigationList({
  active,
  onChange,
  className,
  closeItems = false,
}: {
  active: AppView;
  onChange: (view: AppView) => void;
  className?: string;
  closeItems?: boolean;
}) {
  return (
    <nav className={cn("space-y-1", className)} aria-label="Primary navigation">
      {items.map((item) => {
        const selected = item.id === active;
        const control = (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            aria-current={selected ? "page" : undefined}
            className={cn(
              "pressable flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            <item.icon className="size-4.5 shrink-0" aria-hidden />
            <span>{item.label}</span>
          </button>
        );

        return closeItems ? <SheetClose key={item.id} asChild>{control}</SheetClose> : control;
      })}
    </nav>
  );
}

function ProfileBlock({
  doctorName,
  speciality,
  role,
  initials,
  className,
  compact = false,
}: {
  doctorName: string;
  speciality: string | null;
  role: string;
  initials: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("surface-inset rounded-xl", compact ? "p-2.5" : "p-3", className)}>
      <div className="flex items-center gap-3">
        <span className={cn("grid shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground", compact ? "size-9" : "size-10")}>
          {initials || "DR"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{doctorName}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{speciality || "Independent practice"}</p>
        </div>
      </div>
      <Badge variant="outline" className={cn("text-xs", compact ? "mt-2" : "mt-3")}>{role} workspace</Badge>
    </div>
  );
}
