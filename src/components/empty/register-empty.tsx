import { Mic, NotebookPenIcon } from "@/components/icons";
import { EmptyState, type EmptyStateAction } from "@/components/ui/empty-state";
import { type EmptyVariantProps, quoteTerm } from "@/components/empty/shared";

type RegisterEmptyBase = EmptyVariantProps & {
  /**
   * Starts a dictation. Offered beside the filter and error affordances too:
   * a doctor who reaches an empty register between consultations usually wants
   * the next visit, not the missing one.
   */
  onRecordVisit?: () => void;
};

export type RegisterEmptyProps =
  | (RegisterEmptyBase & {
      /** The register has never held a confirmed visit or a draft. */
      kind: "first-run";
      onRecordVisit: () => void;
    })
  | (RegisterEmptyBase & {
      /**
       * At least one control — search, status tab, date range — sits away from
       * its default. Use `first-run` instead when the register itself is empty,
       * so the copy does not blame filters that would not have helped.
       */
      kind: "filtered";
      /** Returns every register control to its default. */
      onClearFilters: () => void;
      /** The active search term, echoed so the doctor sees what was matched against. */
      query?: string;
      /** A status tab other than "all" is active. */
      statusFiltered?: boolean;
      /** Days covered by the active date window. */
      days?: number;
      /** The widest window the range control offers, so the copy never suggests a longer one. */
      longestRangeDays?: number;
      clearFiltersLabel?: string;
    })
  | (RegisterEmptyBase & {
      kind: "error";
      onRetry: () => void;
      retrying?: boolean;
    });

/**
 * Which filter to name.
 *
 * A typed search term is the most specific thing the doctor did, so it answers
 * first; a status tab next; the date window last, because it is the one control
 * that is always set to something and would otherwise be blamed for every
 * empty page.
 */
function filteredCopy({
  query,
  statusFiltered,
  days,
  longestRangeDays,
}: {
  query?: string;
  statusFiltered?: boolean;
  days?: number;
  longestRangeDays?: number;
}): { title: string; description: string; clearFiltersLabel: string } {
  const term = query?.trim();

  if (term) {
    return {
      title: `No visits match ${quoteTerm(term)}`,
      description:
        "Try fewer letters, a different spelling, or the last digits of a phone number.",
      clearFiltersLabel: "Clear search",
    };
  }

  if (statusFiltered) {
    return {
      title: "No visits with this status",
      description:
        "Drafts, confirmed visits and discarded ones are listed separately — another tab may hold the visit you are looking for.",
      clearFiltersLabel: "Show all statuses",
    };
  }

  if (days !== undefined) {
    // Suggesting a longer range to someone already on the widest one sends them
    // to a control that cannot do what the sentence promised.
    const longerRangeExists = longestRangeDays === undefined || days < longestRangeDays;

    return {
      title: days === 1 ? "No visits recorded today" : `No visits in the last ${days} days`,
      description: longerRangeExists
        ? "Dictate a visit and it appears here, or choose a longer date range."
        : "Dictate a visit and it appears here.",
      clearFiltersLabel: "Reset filters",
    };
  }

  return {
    title: "No visits match these filters",
    description: "Widen the date range, choose a different status, or clear the search.",
    clearFiltersLabel: "Clear filters",
  };
}

/**
 * The register's three empty states.
 *
 * The register is the one list in this app where getting these confused is a
 * clinical problem: a doctor checking whether this morning's consultation was
 * saved needs "your filters hide it" and "it is not there" to be visibly
 * different sentences.
 */
export function RegisterEmpty(props: RegisterEmptyProps) {
  const { className, compact, announce, headingLevel, id, ref, onRecordVisit } = props;
  const chrome = { className, compact, announce, headingLevel, id, ref };

  const recordVisit: EmptyStateAction | undefined = onRecordVisit
    ? { label: "Record a visit", onClick: onRecordVisit, icon: <Mic aria-hidden />, variant: "outline" }
    : undefined;

  if (props.kind === "error") {
    return (
      <EmptyState
        {...chrome}
        kind="error"
        title="Couldn’t load the register"
        description="Your visits are safe on the server — this is a problem reaching them. Check your connection and try again."
        onRetry={props.onRetry}
        retrying={props.retrying}
        secondaryAction={recordVisit}
      />
    );
  }

  if (props.kind === "filtered") {
    const copy = filteredCopy(props);

    return (
      <EmptyState
        {...chrome}
        kind="filtered"
        icon={<NotebookPenIcon aria-hidden />}
        title={copy.title}
        description={copy.description}
        onClearFilters={props.onClearFilters}
        clearFiltersLabel={props.clearFiltersLabel ?? copy.clearFiltersLabel}
        secondaryAction={recordVisit}
      />
    );
  }

  return (
    <EmptyState
      {...chrome}
      kind="first-run"
      icon={<NotebookPenIcon aria-hidden />}
      title="No visits recorded yet"
      description="Dictate a consultation and it is written up here. Nothing joins the register until you have read it back and confirmed it."
      action={{ label: "Record a visit", onClick: props.onRecordVisit, icon: <Mic aria-hidden /> }}
    />
  );
}
