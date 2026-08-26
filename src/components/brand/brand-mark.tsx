import { cn } from "@/lib/utils";
import { DocumentWaveformIcon } from "@/components/icons";

export function BrandMark({
  className,
  compact = false,
  title,
}: {
  className?: string;
  compact?: boolean;
  title?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center border border-foreground bg-foreground text-background",
        compact ? "size-9 rounded-[0.7rem]" : "size-10 rounded-[0.8rem]",
        className,
      )}
    >
      <DocumentWaveformIcon
        className={compact ? "size-[1.3rem]" : "size-6"}
        strokeWidth={1.6}
        title={title}
      />
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
        <span className="mt-0.5 block truncate text-xs font-medium tracking-[0.1em] text-muted-foreground uppercase">
          {subtitle}
        </span>
      </span>
    </span>
  );
}
