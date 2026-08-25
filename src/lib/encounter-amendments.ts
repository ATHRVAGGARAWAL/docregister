export interface AmendmentSnapshot {
  after_values: Record<string, unknown>;
}

/** Replay immutable snapshots without changing the signed source object. */
export function applyEncounterAmendments<T extends Record<string, unknown>>(
  source: T,
  amendments: AmendmentSnapshot[],
): T {
  return amendments.reduce<T>(
    (effective, amendment) => ({ ...effective, ...amendment.after_values }),
    { ...source },
  );
}
