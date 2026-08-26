import * as React from "react";

import {
  ClipboardListIcon,
  HistoryIcon,
  LoaderCircleIcon,
  SearchIcon,
  TriangleAlertIcon,
  XIcon,
} from "@/components/icons";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The three reasons a list in this app is empty.
 *
 * They are separated because they lead to different actions, and conflating
 * them has already put a false statement on screen here: a list narrowed by a
 * filter told the doctor the register itself was empty. A single `isEmpty`
 * boolean cannot tell those apart, so this component takes the cause rather
 * than the symptom, and the union below makes each cause carry the affordance
 * that resolves it.
 *
 * - `first-run` — the collection has never held a record. Offer what creates one.
 * - `filtered`  — records exist, the current filter excludes them. Offer to clear it.
 * - `error`     — the load failed, so the count is unknown. Offer to retry.
 */
export type EmptyStateKind = "first-run" | "filtered" | "error";

/** How loudly the empty state announces itself when it replaces what was there. */
export type EmptyStateAnnounce = "polite" | "assertive" | "off";

export type EmptyStateAction = {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  variant?: ButtonProps["variant"];
  /** Renders the button busy and ignores presses without removing it from the tab order. */
  pending?: boolean;
  /** Replaces `label` while `pending`. */
  pendingLabel?: string;
};

type HeadingLevel = 2 | 3 | 4;

type EmptyStateCommon = {
  /** Names the cause in the doctor's words. There is no default: a generic one would be the bug. */
  title: string;
  description: React.ReactNode;
  /** Overrides the per-kind default glyph with something the screen owns. */
  icon?: React.ReactNode;
  /** Match the surrounding outline; the empty state is a section, not a page. */
  headingLevel?: HeadingLevel;
  /** Set `off` when the caller already wraps this in its own live region. */
  announce?: EmptyStateAnnounce;
  compact?: boolean;
  secondaryAction?: EmptyStateAction;
  /** Rendered below the actions — a caveat, a link out, a count. */
  children?: React.ReactNode;
  className?: string;
  id?: string;
  /**
   * The frame is `tabIndex={-1}` so a caller that has just changed the result
   * set — a submitted search, a cleared filter — can move focus here and have
   * the outcome read out, rather than leaving focus on a control whose list
   * silently vanished.
   */
  ref?: React.Ref<HTMLDivElement>;
};

export type EmptyStateProps =
  | (EmptyStateCommon & {
      kind: "first-run";
      /**
       * What creates the first record. `null` is the explicit answer for a
       * collection nothing on this screen can seed — spelling it out keeps
       * "there is no such action" a decision rather than a forgotten prop.
       */
      action: EmptyStateAction | null;
    })
  | (EmptyStateCommon & {
      kind: "filtered";
      /** Required: a filter that hid everything must be undoable from here. */
      onClearFilters: () => void;
      clearFiltersLabel?: string;
    })
  | (EmptyStateCommon & {
      kind: "error";
      /** Required: a failed load is the one empty state that can be retried. */
      onRetry: () => void;
      retrying?: boolean;
      retryLabel?: string;
    });

const DEFAULT_ICONS: Record<EmptyStateKind, React.ReactNode> = {
  "first-run": <ClipboardListIcon aria-hidden />,
  filtered: <SearchIcon aria-hidden />,
  error: <TriangleAlertIcon aria-hidden />,
};

/**
 * The kind-specific button, so `filtered` and `error` cannot reach the screen
 * without the affordance that answers them.
 */
function resolvePrimaryAction(props: EmptyStateProps): EmptyStateAction | null {
  switch (props.kind) {
    case "first-run":
      return props.action;
    case "filtered":
      return {
        label: props.clearFiltersLabel ?? "Clear filters",
        onClick: props.onClearFilters,
        icon: <XIcon aria-hidden />,
        variant: "outline",
      };
    case "error":
      return {
        label: props.retryLabel ?? "Try again",
        onClick: props.onRetry,
        icon: <HistoryIcon aria-hidden />,
        pending: props.retrying,
        pendingLabel: "Retrying…",
      };
  }
}

function EmptyStateFrame({
  kind,
  compact = false,
  className,
  ...props
}: React.ComponentProps<"div"> & { kind: EmptyStateKind; compact?: boolean }) {
  return (
    <div
      data-slot="empty-state"
      data-kind={kind}
      className={cn(
        "flex w-full flex-col items-center justify-center rounded-[1.5rem] border px-6 text-center",
        compact ? "min-h-40 py-8" : "min-h-56 py-14",
        // A failed load is a problem and reads as one; the other two are just
        // an absence, and a dashed edge says "waiting to be filled" without
        // borrowing the colour that means something went wrong.
        kind === "error"
          ? "border-destructive/40 bg-destructive-soft"
          : "border-dashed border-border bg-card shadow-flat",
        className,
      )}
      {...props}
    />
  );
}

function EmptyStateIcon({
  kind,
  className,
  ...props
}: React.ComponentProps<"div"> & { kind: EmptyStateKind }) {
  return (
    <div
      data-slot="empty-state-icon"
      aria-hidden
      className={cn(
        "grid size-12 place-items-center rounded-[1rem] border border-border [&_svg]:size-5",
        kind === "error"
          ? "bg-background text-destructive"
          : kind === "filtered"
            ? "bg-secondary text-muted-foreground"
            : "bg-primary-soft text-primary",
        className,
      )}
      {...props}
    />
  );
}

function EmptyStateTitle({
  level = 3,
  className,
  ...props
}: React.ComponentProps<"h3"> & { level?: HeadingLevel }) {
  const Heading: `h${HeadingLevel}` = `h${level}`;

  return (
    <Heading
      data-slot="empty-state-title"
      className={cn("mt-4 text-sm font-semibold tracking-[-0.015em] text-foreground", className)}
      {...props}
    />
  );
}

function EmptyStateDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="empty-state-description"
      className={cn(
        "mx-auto mt-1.5 max-w-sm text-xs leading-5 text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function EmptyStateActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-state-actions"
      className={cn("mt-5 flex flex-wrap items-center justify-center gap-2", className)}
      {...props}
    />
  );
}

function EmptyStateButton({ action }: { action: EmptyStateAction }) {
  const busy = action.pending === true;

  return (
    <Button
      type="button"
      variant={action.variant ?? "default"}
      // `aria-disabled` rather than `disabled`: a disabled button drops out of
      // the tab order, so retrying would throw focus to the body and leave a
      // keyboard user hunting for the control they just pressed. This keeps the
      // button focused and swallows the second press instead.
      aria-disabled={busy || undefined}
      aria-busy={busy || undefined}
      className="aria-disabled:opacity-60"
      onClick={() => {
        if (busy) return;
        action.onClick();
      }}
    >
      {busy ? <LoaderCircleIcon className="animate-spin" aria-hidden /> : action.icon}
      {busy ? (action.pendingLabel ?? action.label) : action.label}
    </Button>
  );
}

/**
 * One empty state for every list in the app.
 *
 * `title` and `description` have no defaults on purpose. A default sentence is
 * how the wrong one gets shipped — the caller is the only code that knows
 * whether the register is new, filtered, or unreachable, so it has to say so.
 * Use the ready-made variants in `@/components/empty` rather than writing copy
 * at each call site.
 */
function EmptyState(props: EmptyStateProps) {
  const {
    kind,
    title,
    description,
    icon,
    headingLevel = 3,
    announce,
    compact = false,
    secondaryAction,
    children,
    className,
    id,
    ref,
  } = props;

  const primaryAction = resolvePrimaryAction(props);
  const busy = primaryAction?.pending === true || secondaryAction?.pending === true;
  const loudness = announce ?? (kind === "error" ? "assertive" : "polite");
  const role = loudness === "assertive" ? "alert" : loudness === "polite" ? "status" : undefined;

  return (
    <EmptyStateFrame
      ref={ref}
      id={id}
      kind={kind}
      compact={compact}
      className={className}
      tabIndex={-1}
      {...(role ? { role } : {})}
      // `status` and `alert` are atomic by default, which would re-read the
      // whole block every time the retry button flips to "Retrying…". Off, an
      // appearing empty state is still announced in full because the subtree is
      // new, while a later in-place change announces only itself.
      aria-atomic={role ? false : undefined}
      aria-busy={busy || undefined}
    >
      <EmptyStateIcon kind={kind}>{icon ?? DEFAULT_ICONS[kind]}</EmptyStateIcon>
      <EmptyStateTitle level={headingLevel}>{title}</EmptyStateTitle>
      <EmptyStateDescription>{description}</EmptyStateDescription>

      {(primaryAction || secondaryAction) && (
        <EmptyStateActions>
          {primaryAction && <EmptyStateButton action={primaryAction} />}
          {secondaryAction && (
            <EmptyStateButton action={{ variant: "outline", ...secondaryAction }} />
          )}
        </EmptyStateActions>
      )}

      {children}
    </EmptyStateFrame>
  );
}

export {
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateFrame,
  EmptyStateIcon,
  EmptyStateTitle,
};
