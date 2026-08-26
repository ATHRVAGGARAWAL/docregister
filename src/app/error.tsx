"use client";

import { ErrorScreen } from "@/components/error/error-screen";

/**
 * The boundary around every route segment below the root layout.
 *
 * `error` is typed `unknown` rather than the documented `Error & { digest? }`
 * because Next's own boundary source says it does not guarantee an Error — a
 * thrown string arrives here unchanged, and this file must not be the second
 * thing that breaks.
 *
 * `retry`, not `reset`: `reset` only clears the boundary's state and re-renders
 * the payload it already has, which for a failed server render is the same
 * failure again. `retry` refetches first.
 */
export default function RouteError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <ErrorScreen
      scope="route"
      error={error}
      onRetry={retry}
      title="The register could not be opened"
      description="Nothing you have already saved has changed. Try again, and if this screen comes back, reopen the register."
    />
  );
}
