"use client";

import {
  BookOpenCheckIcon,
  ClipboardListIcon,
  HistoryIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  Settings2Icon,
  ShieldCheckIcon,
  UsersRoundIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type AppView = "overview" | "register" | "patients" | "recall" | "accounts" | "settings";

const items = [
  { id: "overview", label: "Overview", icon: LayoutDashboardIcon },
  { id: "register", label: "Register", icon: ClipboardListIcon },
  // Next to the register on purpose: the register is one day's visits, the
  // directory is the people those visits belong to, and a doctor moves between
  // the two constantly.
  { id: "patients", label: "Patients", icon: UsersRoundIcon },
  { id: "recall", label: "Recall", icon: HistoryIcon },
  { id: "accounts", label: "Accounts", icon: LandmarkIcon },
  { id: "settings", label: "Settings", icon: Settings2Icon },
] as const;

export function AppNavigation({
  active,
  doctorName,
  speciality,
  role,
  onChange,
}: {
  active: AppView;
  doctorName: string;
  speciality: string | null;
  role: string;
  onChange: (view: AppView) => void;
}) {
  const initials = doctorName
    .replace(/^(dr\.?|prof\.?)\s+/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[17rem] flex-col border-r border-border bg-card px-4 py-5 lg:flex">
        <div className="flex items-center gap-3 px-2">
          <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-flat">
            <BookOpenCheckIcon className="size-5" aria-hidden />
          </span>
          <div>
            <p className="font-semibold tracking-tight">docregister</p>
            <p className="text-[11px] text-muted-foreground">Clinical workspace</p>
          </div>
        </div>

        <div className="mt-7 rounded-xl border border-border bg-secondary/55 p-3.5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/12 text-sm font-semibold text-primary">
              {initials || "DR"}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{doctorName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {speciality || "Independent practice"}
              </p>
            </div>
          </div>
          <Badge variant="outline" className="mt-3 capitalize">
            {role} workspace
          </Badge>
        </div>

        <nav className="mt-6 flex flex-1 flex-col gap-1" aria-label="Primary navigation">
          {items.map((item) => {
            const selected = item.id === active;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChange(item.id)}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                  selected
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <item.icon className="size-[18px]" aria-hidden />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="rounded-xl border border-primary/15 bg-primary/8 p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-foreground">
            <ShieldCheckIcon className="size-4 text-primary" aria-hidden />
            India data residency
          </div>
          <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">
            Patient records remain in the Mumbai region.
          </p>
        </div>
      </aside>

      {/* The column count tracks `items`. Leaving it behind when another
          workspace was added would not have dropped the tab — it would have
          wrapped it onto a second row, half off the bottom of the screen and
          under the voice dock. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-6 border-t border-border bg-card/95 px-1.5 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_24px_-18px_rgba(0,0,0,0.35)] lg:hidden"
        aria-label="Primary navigation"
      >
        {items.map((item) => {
          const selected = item.id === active;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              aria-current={selected ? "page" : undefined}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-2 text-[10px] font-medium transition-colors",
                selected
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <item.icon className="size-5" aria-hidden />
              {item.label}
            </button>
          );
        })}
      </nav>
    </>
  );
}
