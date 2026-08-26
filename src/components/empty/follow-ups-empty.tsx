import { CalendarClockIcon, CalendarPlusIcon, CircleCheckIcon } from "@/components/icons";
import { EmptyState } from "@/components/ui/empty-state";
import type { EmptyVariantProps } from "@/components/empty/shared";

/** The queue tab the doctor is looking at. */
export type FollowUpFilterTab = "open" | "completed";

export type FollowUpsEmptyProps =
  | (EmptyVariantProps & {
      /** No follow-up has ever been scheduled in this clinic. */
      kind: "first-run";
      onSchedule: () => void;
    })
  | (EmptyVariantProps & {
      kind: "filtered";
      /** Which tab is empty. The open queue being empty is good news; the completed one is not. */
      filter: FollowUpFilterTab;
      /** Returns the workspace to the tab that shows every follow-up. */
      onClearFilters: () => void;
      /** Adds "Schedule a follow-up" beside the clear-filters button. */
      onSchedule?: () => void;
    })
  | (EmptyVariantProps & {
      kind: "error";
      onRetry: () => void;
      retrying?: boolean;
    });

/**
 * The follow-up queue's three empty states.
 *
 * An empty open queue is the only empty state in this app that is an
 * achievement rather than an absence, and it gets a tick and a sentence that
 * says so. Reading "no follow-ups yet" there would tell a doctor who has just
 * cleared eight of them that their afternoon did not happen.
 */
export function FollowUpsEmpty(props: FollowUpsEmptyProps) {
  const { className, compact, announce, headingLevel, id, ref } = props;
  const chrome = { className, compact, announce, headingLevel, id, ref };

  if (props.kind === "error") {
    return (
      <EmptyState
        {...chrome}
        kind="error"
        title="Couldn’t load follow-ups"
        description="Anything already scheduled is still scheduled — this is a problem reaching the list. Check your connection and try again."
        onRetry={props.onRetry}
        retrying={props.retrying}
      />
    );
  }

  if (props.kind === "filtered") {
    const cleared = props.filter === "open";
    const onSchedule = props.onSchedule;

    return (
      <EmptyState
        {...chrome}
        kind="filtered"
        icon={cleared ? <CircleCheckIcon aria-hidden /> : <CalendarClockIcon aria-hidden />}
        title={cleared ? "Queue is clear" : "No completed follow-ups yet"}
        description={
          cleared
            ? "Nothing is waiting on you. New follow-ups appear here as you set return dates."
            : "A follow-up moves to this tab once you mark it done."
        }
        onClearFilters={props.onClearFilters}
        clearFiltersLabel="Show all follow-ups"
        secondaryAction={
          onSchedule
            ? {
                label: "Schedule a follow-up",
                onClick: onSchedule,
                icon: <CalendarPlusIcon aria-hidden />,
                variant: "outline",
              }
            : undefined
        }
      />
    );
  }

  return (
    <EmptyState
      {...chrome}
      kind="first-run"
      icon={<CalendarClockIcon aria-hidden />}
      title="No follow-ups yet"
      description="Set a return date after a visit and it stays on this list until you mark it done."
      action={{
        label: "Schedule a follow-up",
        onClick: props.onSchedule,
        icon: <CalendarPlusIcon aria-hidden />,
      }}
    />
  );
}
