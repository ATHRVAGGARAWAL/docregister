import type { CommitOutcome } from "@/lib/types";

/**
 * Validate the commit response before it is allowed to drive post-commit UI.
 * The callback helper keeps voice and manual entry on the same propagation path.
 */
export function propagateCommitOutcome(
  value: unknown,
  onCommitted: (outcome: CommitOutcome) => void,
): CommitOutcome {
  const outcome = parseCommitOutcome(value);
  onCommitted(outcome);
  return outcome;
}

export function parseCommitOutcome(value: unknown): CommitOutcome {
  if (!value || typeof value !== "object") throw new Error("The saved visit response was incomplete.");

  const candidate = value as Partial<CommitOutcome>;
  if (typeof candidate.encounterId !== "string" || !candidate.encounterId) {
    throw new Error("The saved visit response was missing its encounter.");
  }
  if (typeof candidate.patientId !== "string" || !candidate.patientId) {
    throw new Error("The saved visit response was missing its patient.");
  }
  if (candidate.visitNumber !== null && typeof candidate.visitNumber !== "number") {
    throw new Error("The saved visit response had an invalid visit number.");
  }
  if (candidate.isNewPatient !== null && typeof candidate.isNewPatient !== "boolean") {
    throw new Error("The saved visit response had invalid patient status.");
  }
  if (typeof candidate.alreadyCommitted !== "boolean") {
    throw new Error("The saved visit response had invalid commit status.");
  }

  return candidate as CommitOutcome;
}
