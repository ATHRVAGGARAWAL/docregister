import { cn } from "@/lib/utils";

export function BrandMark({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <span
      className={cn("brand-mark", compact && "brand-mark--compact", className)}
      aria-hidden="true"
    >
      <span className="brand-mark__wave">
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className="brand-mark__pulse" />
    </span>
  );
}

export function BrandLockup({
  className,
  subtitle = "Voice clinical intelligence",
}: {
  className?: string;
  subtitle?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <BrandMark />
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold tracking-[-0.035em] text-foreground">
          docregister
        </span>
        <span className="mt-0.5 block truncate text-[10px] font-medium tracking-[0.13em] text-muted-foreground uppercase">
          {subtitle}
        </span>
      </span>
    </span>
  );
}
