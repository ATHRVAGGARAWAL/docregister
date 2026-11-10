import Link from "next/link";
import { BrandLockup } from "@/components/brand/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";

export function AuthShell({ children, signUp = false }: { children: React.ReactNode; signUp?: boolean }) {
  return (
    <main className="min-h-dvh bg-background">
      <header className="mx-auto flex max-w-6xl flex-col items-stretch justify-between gap-4 px-5 py-6 sm:flex-row sm:items-center sm:px-8">
        <BrandLockup subtitle="Clinic workspace" />
        <div className="flex items-center justify-between gap-4 text-sm sm:justify-start">
          <Link href={signUp ? "/sign-in" : "/sign-up"} className="font-medium hover:underline">
            {signUp ? "Sign in" : "Create account"}
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl items-center gap-6 px-5 py-4 sm:px-8 lg:min-h-[calc(100dvh-110px)] lg:grid-cols-2 lg:gap-20 lg:py-16">
        <section className="max-w-md">
          <p className="hidden text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground lg:block">Your practice, in one place</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl lg:mt-4">{signUp ? "Set up your clinic workspace." : "Welcome back to your clinic."}</h1>
          <p className="mt-4 hidden text-base leading-7 text-muted-foreground lg:block">Appointments, patient charts and visit notes, connected throughout your day.</p>
          <p className="mt-6 hidden text-sm leading-6 text-muted-foreground lg:block">{signUp ? "Create your account, then start a practice or request access to your team’s clinic." : "Sign in to pick up where you left off."}</p>
        </section>
        <section aria-label={signUp ? "Create your account" : "Sign in to your account"} className="flex min-w-0 justify-center lg:justify-end">
          {children}
        </section>
      </div>
    </main>
  );
}
