import { BookOpenCheckIcon, Mic, SearchIcon } from "@/components/icons";
import { EmptyState } from "@/components/ui/empty-state";
import { type EmptyVariantProps, quoteTerm } from "@/components/empty/shared";

export type RecallEmptyProps =
  | (EmptyVariantProps & {
      /** The register holds nothing for recall to read, so no question can be answered yet. */
      kind: "first-run";
      onRecordVisit: () => void;
    })
  | (EmptyVariantProps & {
      /** A question was asked and matched no visit in this clinic's register. */
      kind: "filtered";
      /** Clears the question and returns recall to its prompts. */
      onClearFilters: () => void;
      /** The question that found nothing, echoed so the doctor can see how it was read. */
      question?: string;
    })
  | (EmptyVariantProps & {
      kind: "error";
      onRetry: () => void;
      retrying?: boolean;
    });

/**
 * Recall's three empty states.
 *
 * Recall reads the register; it does not hold records of its own, so its
 * "nothing yet" is about the register being new rather than about recall. The
 * no-match copy names the boundary explicitly — recall can only answer from
 * this clinic’s own visits — because a doctor who does not know that reads an
 * empty answer as the visit being gone.
 */
export function RecallEmpty(props: RecallEmptyProps) {
  const { className, compact, announce, headingLevel, id, ref } = props;
  const chrome = { className, compact, announce, headingLevel, id, ref };

  if (props.kind === "error") {
    return (
      <EmptyState
        {...chrome}
        kind="error"
        title="Couldn’t search your register"
        description="Your visits are safe on the server — this is a problem reaching them. Check your connection and try again."
        onRetry={props.onRetry}
        retrying={props.retrying}
      />
    );
  }

  if (props.kind === "filtered") {
    const question = props.question?.trim();

    return (
      <EmptyState
        {...chrome}
        kind="filtered"
        icon={<SearchIcon aria-hidden />}
        title={question ? `No answer for ${quoteTerm(question)}` : "No matching visits"}
        description="Recall only reads visits from this clinic’s register. Try a patient’s name, a medicine, or a shorter question."
        onClearFilters={props.onClearFilters}
        clearFiltersLabel="Ask something else"
      />
    );
  }

  return (
    <EmptyState
      {...chrome}
      kind="first-run"
      icon={<BookOpenCheckIcon aria-hidden />}
      title="Nothing to recall yet"
      description="Recall answers from visits already in your register. Record one and it becomes searchable straight away."
      action={{ label: "Record a visit", onClick: props.onRecordVisit, icon: <Mic aria-hidden /> }}
    />
  );
}
