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
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
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

const primaryItems = [
  { id: "overview", label: "Today", icon: LayoutDashboardIcon },
  { id: "register", label: "Register", icon: ClipboardListIcon },
  { id: "patients", label: "Patients", icon: UsersRoundIcon },
] as const;

const careItems = [
  { id: "recall", label: "Search history", icon: HistoryIcon },
  { id: "follow-ups", label: "Follow-ups", icon: ClipboardClockIcon },
] as const;

const adminItems = [
  { id: "accounts", label: "Accounts", icon: LandmarkIcon },
  { id: "settings", label: "Settings", icon: Settings2Icon },
] as const;

const allItems = [...primaryItems, ...careItems, ...adminItems];

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
  const [moreOpen, setMoreOpen] = useState(false);
  const initials = initialsFor(doctorName);
  const activeLabel = allItems.find((item) => item.id === active)?.label ?? "Today";

  return (
    <>
      <aside aria-label="Clinical workspace" className="clinical-sidebar">
        <div className="clinical-sidebar-brand">
          <BrandLockup subtitle="Dental register" />
        </div>

        <nav className="clinical-sidebar-nav" aria-label="Primary navigation">
          <NavGroup label="Clinical" items={primaryItems} active={active} onChange={onChange} />
          <NavGroup label="Care" items={careItems} active={active} onChange={onChange} />
          <NavGroup label="Practice" items={adminItems} active={active} onChange={onChange} />
        </nav>

        <div className="clinical-sidebar-footer">
          <Button type="button" variant="outline" className="w-full justify-start" onClick={onManualEntry}>
            <ClipboardPenLineIcon aria-hidden />
            Type a clinical note
          </Button>
          <div className="clinical-profile-row">
            <span className="clinical-avatar" aria-hidden>{initials || "DR"}</span>
            <span className="min-w-0 flex-1">
              <strong>{doctorName}</strong>
              <small>{speciality || `${role} workspace`}</small>
            </span>
          </div>
          <button type="button" className="clinical-sign-out" onClick={onSignOut}>
            <LogOutIcon aria-hidden /> Sign out
          </button>
        </div>
      </aside>

      <header className="clinical-mobile-header">
        <BrandMark compact />
        <div className="min-w-0 flex-1">
          <p>docregister</p>
          <span>{activeLabel}</span>
        </div>
      </header>

      <nav className="clinical-mobile-tabs" aria-label="Primary navigation">
        {primaryItems.map((item) => (
          <MobileTab
            key={item.id}
            icon={item.icon}
            label={item.label}
            selected={active === item.id}
            onClick={() => onChange(item.id)}
          />
        ))}
        <MobileTab
          icon={Settings2Icon}
          label="More"
          selected={!primaryItems.some((item) => item.id === active)}
          onClick={() => setMoreOpen(true)}
        />
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl p-0">
          <SheetHeader className="border-b border-border px-5 py-5 text-left">
            <SheetTitle>More workspace tools</SheetTitle>
            <SheetDescription>Clinical follow-up, accounts and practice settings.</SheetDescription>
          </SheetHeader>
          <nav className="grid gap-1 p-3" aria-label="More navigation">
            {[...careItems, ...adminItems].map((item) => (
              <SheetClose asChild key={item.id}>
                <button
                  type="button"
                  onClick={() => onChange(item.id)}
                  className={cn("clinical-more-row", active === item.id && "is-active")}
                >
                  <item.icon aria-hidden />
                  <span>{item.label}</span>
                </button>
              </SheetClose>
            ))}
          </nav>
          <div className="grid gap-2 border-t border-border p-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between gap-3 px-2 py-1">
              <span className="text-xs font-medium text-muted-foreground">Appearance</span>
              <ThemeToggle />
            </div>
            <SheetClose asChild>
              <Button type="button" variant="outline" className="justify-start" onClick={onManualEntry}>
                <ClipboardPenLineIcon aria-hidden /> Type a clinical note
              </Button>
            </SheetClose>
            <p className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
              <ShieldCheckIcon className="size-4" aria-hidden /> Patient data stays in the clinic workspace.
            </p>
            <SheetClose asChild>
              <Button type="button" variant="ghost" className="justify-start text-destructive" onClick={onSignOut}>
                <LogOutIcon aria-hidden /> Sign out
              </Button>
            </SheetClose>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function NavGroup({
  label,
  items,
  active,
  onChange,
}: {
  label: string;
  items: readonly { id: AppView; label: string; icon: typeof LayoutDashboardIcon }[];
  active: AppView;
  onChange: (view: AppView) => void;
}) {
  return (
    <div>
      <p className="clinical-nav-label">{label}</p>
      <div className="grid gap-1">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            aria-current={active === item.id ? "page" : undefined}
            className={cn("clinical-nav-item", active === item.id && "is-active")}
          >
            <item.icon aria-hidden />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MobileTab({
  icon: Icon,
  label,
  selected,
  onClick,
}: {
  icon: typeof LayoutDashboardIcon;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} aria-current={selected ? "page" : undefined} className={cn("clinical-mobile-tab", selected && "is-active")}>
      <Icon aria-hidden />
      <span>{label}</span>
    </button>
  );
}

function initialsFor(name: string): string {
  return name
    .replace(/^(dr\.?|prof\.?)\s+/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
