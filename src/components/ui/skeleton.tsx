import { cn } from "@/lib/utils";

/**
 * A pulsing solid block. The usual skeleton shimmer is a gradient swept across
 * the placeholder; this system has no gradients, so the "loading" signal is
 * opacity instead — which also happens to be the cheaper of the two to animate.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-muted animate-pulse rounded-md", className)}
      {...props}
    />
  );
}

export { Skeleton };
