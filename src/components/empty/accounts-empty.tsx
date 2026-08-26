import { PlusIcon, ReceiptTextIcon } from "@/components/icons";
import { EmptyState } from "@/components/ui/empty-state";
import { type EmptyVariantProps, quoteTerm } from "@/components/empty/shared";

/** Which side of the ledger the active tab is showing. */
export type LedgerSide = "income" | "expense";

export type AccountsEmptyProps =
  | (EmptyVariantProps & {
      /** The ledger has never held an entry. */
      kind: "first-run";
      onAddEntry: () => void;
    })
  | (EmptyVariantProps & {
      kind: "filtered";
      onClearFilters: () => void;
      /** The active search term. */
      query?: string;
      /** Set when the income/expense tab is narrowing the ledger. */
      side?: LedgerSide;
      /** Days covered by the active date window. */
      days?: number;
      /** Adds "Add an entry" beside the clear-filters button. */
      onAddEntry?: () => void;
    })
  | (EmptyVariantProps & {
      kind: "error";
      onRetry: () => void;
      retrying?: boolean;
    });

function filteredCopy({
  query,
  side,
  days,
}: {
  query?: string;
  side?: LedgerSide;
  days?: number;
}): { title: string; description: string; clearFiltersLabel: string } {
  const term = query?.trim();

  if (term) {
    return {
      title: `No entries match ${quoteTerm(term)}`,
      description: "Try fewer letters, or search for the patient the entry was recorded against.",
      clearFiltersLabel: "Clear search",
    };
  }

  if (side) {
    return {
      title: side === "income" ? "No income in this period" : "No expenses in this period",
      description:
        "The other tab may hold what you are looking for, or the date range may be too narrow.",
      clearFiltersLabel: "Show the whole ledger",
    };
  }

  if (days !== undefined) {
    return {
      title: days === 1 ? "Nothing recorded today" : `Nothing recorded in the last ${days} days`,
      description: "Add income or an expense, or choose a longer date range.",
      clearFiltersLabel: "Reset filters",
    };
  }

  return {
    title: "No entries match these filters",
    description: "Widen the date range, switch between income and expenses, or clear the search.",
    clearFiltersLabel: "Clear filters",
  };
}

/**
 * The accounts ledger's three empty states.
 *
 * An empty ledger and a filtered one look identical in a money column, and the
 * difference matters at the end of a day: "you have taken nothing" and "this
 * view is hiding what you took" are not the same statement to act on.
 */
export function AccountsEmpty(props: AccountsEmptyProps) {
  const { className, compact, announce, headingLevel, id, ref } = props;
  const chrome = { className, compact, announce, headingLevel, id, ref };

  if (props.kind === "error") {
    return (
      <EmptyState
        {...chrome}
        kind="error"
        title="Couldn’t load the ledger"
        description="No figures are shown rather than the wrong ones. Check your connection and try again."
        onRetry={props.onRetry}
        retrying={props.retrying}
      />
    );
  }

  if (props.kind === "filtered") {
    const copy = filteredCopy(props);
    const onAddEntry = props.onAddEntry;

    return (
      <EmptyState
        {...chrome}
        kind="filtered"
        icon={<ReceiptTextIcon aria-hidden />}
        title={copy.title}
        description={copy.description}
        onClearFilters={props.onClearFilters}
        clearFiltersLabel={copy.clearFiltersLabel}
        secondaryAction={
          onAddEntry
            ? { label: "Add an entry", onClick: onAddEntry, icon: <PlusIcon aria-hidden />, variant: "outline" }
            : undefined
        }
      />
    );
  }

  return (
    <EmptyState
      {...chrome}
      kind="first-run"
      icon={<ReceiptTextIcon aria-hidden />}
      title="No account entries yet"
      description="Record what a consultation was paid for, or an expense the clinic carried, and the ledger starts here."
      action={{ label: "Add first entry", onClick: props.onAddEntry, icon: <PlusIcon aria-hidden /> }}
    />
  );
}
