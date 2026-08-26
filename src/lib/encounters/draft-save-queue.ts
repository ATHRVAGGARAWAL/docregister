export interface VersionedSaveResult {
  version: number;
}

/**
 * Serialise optimistic draft writes and give each request the version produced
 * by the previous one. Autosave and the final save can therefore never race
 * each other with the same expected version.
 */
export function createDraftSaveQueue<T>(
  initialVersion: number,
  save: (payload: T, expectedVersion: number) => Promise<VersionedSaveResult>,
) {
  let version = initialVersion;
  let tail: Promise<void> = Promise.resolve();

  return {
    enqueue(payload: T): Promise<VersionedSaveResult> {
      const job = tail.catch(() => undefined).then(async () => {
        const result = await save(payload, version);
        version = result.version;
        return result;
      });
      tail = job.then(() => undefined, () => undefined);
      return job;
    },
    currentVersion(): number {
      return version;
    },
  };
}
