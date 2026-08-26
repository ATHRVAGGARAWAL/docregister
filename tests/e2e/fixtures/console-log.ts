import type { Page } from "playwright/test";

/**
 * Everything the browser complained about while a page was open.
 *
 * The bar is literally zero, with no allow-list. That is deliberate: a console
 * error in this app is either a request that failed, a React tree that was
 * thrown away, or an exception a doctor's screen swallowed silently — and the
 * moment one "known harmless" pattern is tolerated, the next real one hides
 * behind it. If something legitimate starts logging, the fix is to stop
 * logging it, not to widen a filter here.
 */
export interface ConsoleLog {
  /** `console.error` plus uncaught exceptions, in the order they happened. */
  readonly errors: string[];
  /** Any message, at any level, that reads like a hydration mismatch. */
  readonly hydration: string[];
}

/**
 * React reports a mismatch as prose, and the wording has changed across
 * versions ("Hydration failed because…", "A tree hydrated but some attributes
 * of the server rendered HTML didn't match…", "Text content did not match").
 * Matching the shared vocabulary rather than one release's exact sentence is
 * what keeps this from quietly passing after an upgrade.
 */
const HYDRATION = /hydrat|server[- ]rendered|did ?n[o']?t match/i;

export function recordConsole(page: Page): ConsoleLog {
  const errors: string[] = [];
  const hydration: string[] = [];

  page.on("pageerror", (error) => {
    errors.push(`uncaught: ${error.message}`);
    if (HYDRATION.test(error.message)) hydration.push(error.message);
  });

  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error") errors.push(text);
    // Warnings are searched too: Next's dev overlay reports some mismatches at
    // warning level, and a mismatch that only warns is still a discarded tree.
    if (HYDRATION.test(text)) hydration.push(text);
  });

  return { errors, hydration };
}
