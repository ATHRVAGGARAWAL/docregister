import { Mic, UsersRoundIcon } from "@/components/icons";
import { EmptyState } from "@/components/ui/empty-state";
import { type EmptyVariantProps, quoteTerm } from "@/components/empty/shared";

export type PatientsEmptyProps =
  | (EmptyVariantProps & {
      /** No chart exists in this clinic yet. */
      kind: "first-run";
      onRecordVisit: () => void;
    })
  | (EmptyVariantProps & {
      kind: "filtered";
      /** Clears the search box and reloads the unfiltered directory. */
      onClearFilters: () => void;
      /** The active search term. Echoed so a typo is visible rather than guessed at. */
      query?: string;
    })
  | (EmptyVariantProps & {
      kind: "error";
      onRetry: () => void;
      retrying?: boolean;
    });

/**
 * The patient directory's three empty states.
 *
 * A chart here is a by-product: there is no "add patient" form, because a
 * chart is created the first time a dictated visit naming that patient is
 * confirmed. The first-run copy says so rather than pointing at a button that
 * does not exist.
 */
export function PatientsEmpty(props: PatientsEmptyProps) {
  const { className, compact, announce, headingLevel, id, ref } = props;
  const chrome = { className, compact, announce, headingLevel, id, ref };

  if (props.kind === "error") {
    return (
      <EmptyState
        {...chrome}
        kind="error"
        title="Couldn’t load the patient list"
        description="The charts are safe on the server — this is a problem reaching them. Check your connection and try again."
        onRetry={props.onRetry}
        retrying={props.retrying}
      />
    );
  }

  if (props.kind === "filtered") {
    const term = props.query?.trim();

    return (
      <EmptyState
        {...chrome}
        kind="filtered"
        title={term ? `No patients match ${quoteTerm(term)}` : "No patients match this search"}
        description="Try fewer letters, a different spelling, or the last digits of a phone number."
        onClearFilters={props.onClearFilters}
        clearFiltersLabel="Clear search"
      />
    );
  }

  return (
    <EmptyState
      {...chrome}
      kind="first-run"
      icon={<UsersRoundIcon aria-hidden />}
      title="No patient charts yet"
      description="A chart appears here the first time you confirm a dictated visit — there is nothing to fill in by hand."
      action={{ label: "Record a visit", onClick: props.onRecordVisit, icon: <Mic aria-hidden /> }}
    />
  );
}
