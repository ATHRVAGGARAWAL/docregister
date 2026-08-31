"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ComponentType, type ReactNode } from "react";

import { BrandLockup, BrandMark } from "@/components/brand/brand-mark";
import {
  CalendarDaysIcon,
  ClipboardListIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  Settings2Icon,
  ShieldCheckIcon,
  SparklesIcon,
  Table2,
  ToothIcon,
  UsersRoundIcon,
  WalletCardsIcon,
  type IconProps,
} from "@/components/icons";
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
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface PracticeShellProps {
  children: ReactNode;
  profile: {
    fullName: string;
    speciality: string | null;
    role: string;
  };
}

interface NavItem {
  href: string;
  label: string;
  description: string;
  icon: ComponentType<IconProps>;
}

const clinicalItems: NavItem[] = [
  { href: "/today", label: "Today", description: "Clinic command centre", icon: LayoutDashboardIcon },
  { href: "/schedule", label: "Schedule", description: "Chairs and appointments", icon: CalendarDaysIcon },
  { href: "/patients", label: "Patients", description: "Charts and clinical history", icon: UsersRoundIcon },
  { href: "/treatments", label: "Treatments", description: "Plans and active cases", icon: ToothIcon },
];

const practiceItems: NavItem[] = [
  { href: "/operations", label: "Operations", description: "Lab and inventory", icon: ClipboardListIcon },
  { href: "/finance", label: "Finance", description: "Estimates, invoices and payments", icon: WalletCardsIcon },
  { href: "/reports", label: "Reports", description: "Clinical and business trends", icon: Table2 },
];

const routeTitles: Record<string, string> = {
  today: "Today",
  schedule: "Schedule",
  patients: "Patients",
  treatments: "Treatments",
  operations: "Operations",
  finance: "Finance",
  reports: "Reports",
  settings: "Settings",
};

export function PracticeShell({ children, profile }: PracticeShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  // `en-CA` is the shortest route to YYYY-MM-DD, which is what `<time>` wants.
  // Read once per render and to day precision, so the server and the browser
  // agree — see the note beside the element below.
  const istDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const section = pathname.split("/").filter(Boolean)[0] ?? "today";
  const initials = profile.fullName
    .replace(/^(dr\.?|prof\.?)\s+/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "DR";

  async function signOut() {
    try {
      await getSupabaseBrowserClient().auth.signOut();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  const navigation = (
    <>
      <div className="px-3 py-3">
        <Profile profile={profile} initials={initials} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <NavGroup label="Clinical" items={clinicalItems} pathname={pathname} />
        <NavGroup label="Practice" items={practiceItems} pathname={pathname} className="mt-5" />
      </div>
      <div className="space-y-2 border-t border-border p-3">
        <NavLink
          item={{ href: "/settings", label: "Settings", description: "Clinic and team", icon: Settings2Icon }}
          active={pathname.startsWith("/settings")}
        />
        <Button asChild className="w-full justify-start" size="lg">
          <Link href="/">
            <SparklesIcon className="size-4" aria-hidden />
            Voice clinical note
          </Link>
        </Button>
        <div className="flex items-center justify-between gap-2 pt-1">
          <ThemeToggle />
          <Button type="button" variant="ghost" size="icon" onClick={() => void signOut()} aria-label="Sign out">
            <LogOutIcon className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    </>
  );

  return (
    <div className="practice-shell min-h-dvh bg-background text-foreground">
      <aside
        aria-label="Practice navigation"
        className="fixed inset-y-0 left-0 z-30 hidden w-[17rem] flex-col border-r border-border bg-card lg:flex"
      >
        <div className="border-b border-border px-5 py-5">
          <BrandLockup subtitle="Dental practice OS" />
        </div>
        {navigation}
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-border bg-card px-4 lg:hidden">
          <SheetTrigger asChild>
            <button
              type="button"
              className="pressable grid size-11 place-items-center rounded-lg border border-border bg-background"
              aria-label="Open practice menu"
            >
              <span className="grid gap-1" aria-hidden>
                <span className="h-px w-5 bg-current" />
                <span className="h-px w-5 bg-current" />
                <span className="h-px w-5 bg-current" />
              </span>
            </button>
          </SheetTrigger>
          <BrandMark compact />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{routeTitles[section] ?? "Patient workspace"}</p>
            <p className="truncate text-xs text-muted-foreground">{profile.fullName}</p>
          </div>
          <ThemeToggle />
        </header>

        <SheetContent side="left" className="w-[min(88vw,20rem)] rounded-none border-r border-border bg-card p-0" showClose>
          <SheetHeader className="border-b border-border px-5 py-5 text-left">
            <BrandLockup subtitle="Dental practice OS" />
            <SheetTitle className="sr-only">Practice menu</SheetTitle>
            <SheetDescription className="sr-only">Move between clinic workspaces.</SheetDescription>
          </SheetHeader>
          <SheetClose asChild>
            <div className="contents" onClick={() => setMobileOpen(false)}>{navigation}</div>
          </SheetClose>
        </SheetContent>
      </Sheet>

      <div className="lg:pl-[17rem]">
        <div className="sticky top-0 z-20 hidden h-14 items-center justify-between border-b border-border bg-background/95 px-8 lg:flex">
          <div className="flex items-center gap-3">
            <p className="text-sm font-semibold">{routeTitles[section] ?? "Patient workspace"}</p>
            <Badge variant="outline" className="border-primary/20 bg-primary-soft text-primary">
              Live practice
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <ShieldCheckIcon className="size-4 text-primary" aria-hidden />
            Clinic-scoped records
            <span aria-hidden>·</span>
            {/*
              Day precision in the attribute as well as the text. This was
              `new Date().toISOString()`, which carries milliseconds — the
              server render and the hydration render are a few milliseconds
              apart, so the two strings never matched and React reported a
              hydration mismatch on every practice page. Both halves are now
              derived from the same IST calendar day, which is what the label
              actually means.
            */}
            <time dateTime={istDay}>
              {new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date())}
            </time>
          </div>
        </div>
        <main>{children}</main>
      </div>
    </div>
  );
}

function NavGroup({
  label,
  items,
  pathname,
  className,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={className}>
      <p className="px-3 pb-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <div className="space-y-1">
        {items.map((item) => (
          <NavLink key={item.href} item={item} active={pathname === item.href || pathname.startsWith(`${item.href}/`)} />
        ))}
      </div>
    </nav>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "pressable flex min-h-12 items-center gap-3 rounded-xl border px-3 py-2.5",
        active
          ? "border-primary/25 bg-primary-soft text-primary"
          : "border-transparent text-muted-foreground hover:border-border hover:bg-background hover:text-foreground",
      )}
    >
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", active ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground")}>
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{item.label}</span>
        <span className="block truncate text-[0.69rem] text-muted-foreground">{item.description}</span>
      </span>
    </Link>
  );
}

function Profile({ profile, initials }: { profile: PracticeShellProps["profile"]; initials: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-xs font-semibold text-primary-foreground" aria-hidden>
          {initials}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{profile.fullName}</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {profile.speciality || "Dental practice"}
          </span>
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <Badge variant="outline" className="capitalize">{profile.role}</Badge>
        <span className="inline-flex items-center gap-1 text-[0.68rem] font-medium text-money">
          <span className="size-1.5 rounded-full bg-money" aria-hidden />
          Ready
        </span>
      </div>
    </div>
  );
}
