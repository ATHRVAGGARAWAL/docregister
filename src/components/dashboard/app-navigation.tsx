"use client";

import {
  ClipboardListIcon,
  HistoryIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  Settings2Icon,
  ShieldCheckIcon,
  UsersRoundIcon,
} from "lucide-react";

import { BrandLockup } from "@/components/brand/brand-mark";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type AppView = "overview" | "register" | "patients" | "recall" | "accounts" | "settings";

const items = [
  { id: "overview", label: "Overview", icon: LayoutDashboardIcon },
  { id: "register", label: "Register", icon: ClipboardListIcon },
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
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[17rem] p-4 lg:block">
        <div className="glass-dock relative flex h-full flex-col overflow-hidden rounded-[2rem] p-3">
          <span
            aria-hidden
            className="pointer-events-none absolute -top-20 -left-20 size-56 rounded-full bg-primary/12 blur-3xl"
          />

          <div className="relative px-2 py-2.5">
            <BrandLockup subtitle="Voice clinical intelligence" />
          </div>

          <div className="glass-inset relative mt-5 rounded-[1.4rem] p-3.5">
            <div className="flex items-center gap-3">
              <span className="relative grid size-11 shrink-0 place-items-center rounded-[1rem] border border-primary/20 bg-primary/10 text-sm font-semibold tracking-[-0.03em] text-primary shadow-[inset_0_1px_0_rgb(255_255_255/0.12)]">
                {initials || "DR"}
                <span
                  aria-hidden
                  className="absolute right-0 bottom-0 size-3 rounded-full border-2 border-card bg-primary shadow-[0_0_12px_color-mix(in_oklab,var(--primary)_65%,transparent)]"
                />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold tracking-[-0.015em] text-foreground">
                  {doctorName}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {speciality || "Independent practice"}
                </p>
              </div>
            </div>
            <Badge
              variant="outline"
              className="mt-3 rounded-full border-primary/15 bg-primary/8 px-2.5 py-1 text-[9px] font-semibold tracking-[0.12em] text-primary uppercase"
            >
              {role} workspace
            </Badge>
          </div>

          <nav
            className="relative my-4 flex flex-1 flex-col justify-center gap-1.5"
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
                    "group relative flex h-12 items-center gap-3 rounded-[1rem] px-3 text-[13px] font-medium transition-[transform,background-color,color,box-shadow] duration-300 ease-out hover:translate-x-1 focus-visible:translate-x-1",
                    selected
                      ? "bg-primary/12 text-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_12px_28px_-20px_var(--primary)]"
                      : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-y-3 left-0 w-0.5 rounded-full bg-primary transition-opacity duration-300",
                      selected ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span
                    className={cn(
                      "grid size-8 place-items-center rounded-[0.8rem] transition-[transform,background-color,color] duration-300 group-hover:scale-110",
                      selected ? "bg-primary text-primary-foreground" : "bg-foreground/5",
                    )}
                  >
                    <item.icon className="size-4" strokeWidth={1.8} aria-hidden />
                  </span>
                  <span>{item.label}</span>
                  {selected && (
                    <span className="ml-auto size-1.5 rounded-full bg-primary shadow-[0_0_12px_var(--primary)]" aria-hidden />
                  )}
                </button>
              );
            })}
          </nav>

          <div className="relative rounded-[1.25rem] border border-primary/12 bg-primary/[0.06] p-3.5">
            <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.02em] text-foreground">
              <ShieldCheckIcon className="size-3.5 text-primary" strokeWidth={1.8} aria-hidden />
              India data residency
            </div>
            <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">
              Encrypted patient records remain in the Mumbai region.
            </p>
          </div>
        </div>
      </aside>

      <nav
        className="glass-dock fixed inset-x-2 bottom-[max(.5rem,env(safe-area-inset-bottom))] z-50 grid h-[4.1rem] grid-cols-6 rounded-[1.55rem] p-1.5 lg:hidden"
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
              aria-label={item.label}
              className={cn(
                "group relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-[1rem] px-0.5 text-[9px] font-medium transition-[transform,background-color,color] duration-300 ease-out active:scale-95",
                selected
                  ? "bg-primary/14 text-primary"
                  : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
              )}
            >
              <item.icon
                className={cn(
                  "size-[18px] transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-110",
                  selected && "-translate-y-0.5",
                )}
                strokeWidth={selected ? 2.1 : 1.7}
                aria-hidden
              />
              <span className="max-w-full truncate">{item.label}</span>
              <span
                aria-hidden
                className={cn(
                  "absolute bottom-0.5 h-0.5 rounded-full bg-primary transition-[width,opacity] duration-300",
                  selected ? "w-3 opacity-100" : "w-0 opacity-0",
                )}
              />
            </button>
          );
        })}
      </nav>
    </>
  );
}
