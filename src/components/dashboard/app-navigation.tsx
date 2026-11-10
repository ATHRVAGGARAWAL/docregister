"use client";

import { useState } from "react";
import { AccountButton } from "@/components/auth/account-button";

import {
  ClipboardClockIcon,
  ClipboardListIcon,
  PlusIcon,
  SearchIcon,
  ChevronRightIcon,
  HistoryIcon,
  CalendarDaysIcon,
  ToothIcon,
  WalletCardsIcon,
  ActivityIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  Settings2Icon,
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
  | "schedule"
  | "treatments"
  | "operations"
  | "finance"
  | "reports"
  | "settings";

const primaryItems = [
  { id: "overview", label: "Today", icon: LayoutDashboardIcon },
  { id: "schedule", label: "Schedule", icon: CalendarDaysIcon },
  { id: "patients", label: "Patients", icon: UsersRoundIcon },
  { id: "register", label: "Register", icon: ClipboardListIcon },
  { id: "follow-ups", label: "Follow-ups", icon: ClipboardClockIcon },
] as const;

const careItems = [
  { id: "treatments", label: "Treatments", icon: ToothIcon },
  { id: "recall", label: "Search history", icon: HistoryIcon },
] as const;

const adminItems = [
  { id: "finance", label: "Billing & payments", icon: WalletCardsIcon },
  { id: "accounts", label: "Cashbook", icon: LandmarkIcon },
  { id: "operations", label: "Lab & stock", icon: ClipboardListIcon },
  { id: "reports", label: "Reports", icon: ActivityIcon },
] as const;
const settingsItem = {
  id: "settings",
  label: "Settings",
  icon: Settings2Icon,
} as const;
const mobileItems = [primaryItems[0], primaryItems[1], primaryItems[2]];
const allItems = [...primaryItems, ...careItems, ...adminItems, settingsItem];

export function AppNavigation({
  active,
  doctorName,
  speciality,
  role,
  onChange,
  onManualEntry,
  onSearch,
  newVisitDisabled = false,
  onSignOut,
}: {
  active: AppView;
  doctorName: string;
  speciality: string | null;
  role: string;
  onChange: (view: AppView) => void;
  onManualEntry: () => void;
  onSearch: () => void;
  newVisitDisabled?: boolean;
  onSignOut: () => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const activeLabel =
    allItems.find((item) => item.id === active)?.label ?? "Today";

  return (
    <>
      <aside aria-label="Clinical workspace" className="clinical-sidebar">
        <div className="clinical-sidebar-brand">
          <BrandLockup subtitle="Clinic workspace" />
        </div>

        <div className="px-3 pb-2">
          <Button className="w-full justify-start" onClick={onManualEntry} disabled={newVisitDisabled}>
            <PlusIcon aria-hidden />
            New visit
          </Button>
          <button className="workspace-sidebar-search" onClick={onSearch}>
            <SearchIcon aria-hidden />
            <span>Search anything</span>
            <kbd>⌘ K</kbd>
          </button>
        </div>
        <nav className="clinical-sidebar-nav" aria-label="Primary navigation">
          <NavGroup
            label="Workspace"
            items={primaryItems}
            active={active}
            onChange={onChange}
          />
          <NavGroup
            label="Clinical tools"
            items={careItems}
            active={active}
            onChange={onChange}
          />
          <details
            className="workspace-management"
            open={adminItems.some((item) => item.id === active) || undefined}
          >
            <summary>
              Practice management
              <ChevronRightIcon className="rotate-90" aria-hidden />
            </summary>
            <NavGroup
              label=""
              items={adminItems}
              active={active}
              onChange={onChange}
            />
          </details>
        </nav>

        <div className="clinical-sidebar-footer">
          <button
            type="button"
            className={cn(
              "clinical-nav-item",
              active === "settings" && "is-active",
            )}
            aria-current={active === "settings" ? "page" : undefined}
            onClick={() => onChange("settings")}
          >
            <Settings2Icon aria-hidden />
            Settings
          </button>
          <div className="clinical-profile-row">
            <AccountButton />
            <span className="min-w-0 flex-1">
              <strong>{doctorName}</strong>
              <small>
                {speciality ||
                  `${role.charAt(0).toUpperCase()}${role.slice(1)}`}
              </small>
            </span>
          </div>
          <button
            type="button"
            className="clinical-sign-out"
            onClick={onSignOut}
          >
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
        <AccountButton />
        <Button
          variant="ghost"
          size="icon"
          onClick={onSearch}
          aria-label="Search anything"
        >
          <SearchIcon aria-hidden />
        </Button>
        <Button size="sm" onClick={onManualEntry} disabled={newVisitDisabled}>
          <PlusIcon aria-hidden />
          New visit
        </Button>
      </header>

      <nav className="clinical-mobile-tabs" aria-label="Primary navigation">
        {mobileItems.map((item) => (
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
          selected={!mobileItems.some((item) => item.id === active)}
          onClick={() => setMoreOpen(true)}
        />
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl overflow-y-auto p-0"
        >
          <SheetHeader className="border-b border-border px-5 py-5 text-left">
            <SheetTitle>Your workspace</SheetTitle>
            <SheetDescription>
              Visits, clinical tools and practice management.
            </SheetDescription>
          </SheetHeader>
          <nav className="grid gap-1 p-3" aria-label="More navigation">
            {[
              ...primaryItems.slice(3),
              ...careItems,
              ...adminItems,
              settingsItem,
            ].map((item) => (
              <SheetClose asChild key={item.id}>
                <button
                  type="button"
                  onClick={() => onChange(item.id)}
                  aria-current={active === item.id ? "page" : undefined}
                  className={cn(
                    "clinical-more-row",
                    active === item.id && "is-active",
                  )}
                >
                  <item.icon aria-hidden />
                  <span>{item.label}</span>
                </button>
              </SheetClose>
            ))}
          </nav>
          <div className="grid gap-2 border-t border-border p-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between gap-3 px-2 py-1">
              <span className="text-xs font-medium text-muted-foreground">
                Appearance
              </span>
              <ThemeToggle />
            </div>
            <SheetClose asChild>
              <Button
                type="button"
                variant="outline"
                className="justify-start"
                onClick={onManualEntry} disabled={newVisitDisabled}
              >
                <PlusIcon aria-hidden /> New visit
              </Button>
            </SheetClose>
            <SheetClose asChild>
              <Button
                type="button"
                variant="ghost"
                className="justify-start text-destructive"
                onClick={onSignOut}
              >
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
  items: readonly {
    id: AppView;
    label: string;
    icon: typeof LayoutDashboardIcon;
  }[];
  active: AppView;
  onChange: (view: AppView) => void;
}) {
  return (
    <div>
      {label && <p className="clinical-nav-label">{label}</p>}
      <div className="grid gap-1">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            aria-current={active === item.id ? "page" : undefined}
            className={cn(
              "clinical-nav-item",
              active === item.id && "is-active",
            )}
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
    <button
      type="button"
      onClick={onClick}
      aria-current={selected ? "page" : undefined}
      className={cn("clinical-mobile-tab", selected && "is-active")}
    >
      <Icon aria-hidden />
      <span>{label}</span>
    </button>
  );
}
