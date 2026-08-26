import { BrandLockup } from "@/components/brand/brand-mark";

export default function Loading() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-6">
      <div className="w-full max-w-sm text-center" role="status" aria-live="polite">
        <BrandLockup className="justify-center" subtitle="Clinical workspace" />
        <div className="surface-card mt-6 p-5">
          <span className="mx-auto block size-5 animate-spin rounded-full border-2 border-border border-t-primary" aria-hidden />
          <p className="mt-3 text-sm font-medium">Opening your workspace…</p>
          <p className="mt-1 text-xs text-muted-foreground">Loading the latest clinic records.</p>
        </div>
      </div>
    </main>
  );
}
