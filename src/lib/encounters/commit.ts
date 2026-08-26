import type { CommitOutcome } from "@/lib/types";

/**
 * Validate the commit response before it is allowed to drive post-commit UI.
 * The callback helper keeps voice and manual entry on the same propagation path.
 */
export function propagateCommitOutcome(
  value: unknown,
  onCommitted: (outcome: CommitOutcome) => void,
  expected?: { encounterId: string; patientId?: string | null },
): CommitOutcome {
  const outcome = parseCommitOutcome(value, expected);
  onCommitted(outcome);
  return outcome;
}

export function parseCommitOutcome(
  value: unknown,
  expected?: { encounterId: string; patientId?: string | null },
): CommitOutcome {
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
  if (candidate.accountEntryId !== null && typeof candidate.accountEntryId !== "string") {
    throw new Error("The saved visit response had an invalid account entry.");
  }
  if (typeof candidate.accountEntryError !== "boolean") {
    throw new Error("The saved visit response had invalid account status.");
  }
  if (expected && candidate.encounterId !== expected.encounterId) {
    throw new Error("The saved visit could not be verified against this draft.");
  }
  if (expected?.patientId && candidate.patientId !== expected.patientId) {
    throw new Error("The saved visit could not be verified against the selected patient.");
  }

  return candidate as CommitOutcome;
}
