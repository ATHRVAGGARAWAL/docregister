import type { Page } from "playwright/test";

/**
 * The seven workspaces `?view=` can address, with the two things that prove one
 * of them actually rendered:
 *
 *  - `nav` is the label the sidebar marks `aria-current="page"`. It is the
 *    app's own claim about where the doctor is.
 *  - `heading` is content only that workspace has. Without it, a test passes on
 *    a highlighted tab above an empty page — which is precisely the shape of
 *    the bug where a deep link to the directory rendered "0 patients" for a
 *    clinic with 46 charts.
 *
 * `follow-ups` names an h2 rather than an h1 because that workspace has no h1.
 * That is worth fixing, but this list describes the app as it is.
 */
export interface Workspace {
  view: string;
  nav: string;
  heading: string | RegExp;
}

export const WORKSPACES: readonly Workspace[] = [
  // The greeting depends on the hour in Asia/Kolkata, so match its shape.
  { view: "overview", nav: "Overview", heading: /^Good (morning|afternoon|evening), / },
  { view: "register", nav: "Register", heading: "Patient register" },
  { view: "patients", nav: "Patients", heading: "Patient directory" },
  { view: "recall", nav: "Recall", heading: "Patient recall" },
  { view: "follow-ups", nav: "Follow-ups", heading: "Follow-up queue" },
  { view: "accounts", nav: "Accounts", heading: "Accounts" },
  { view: "settings", nav: "Settings", heading: "Account & settings" },
];

/**
 * The single nav item the app is currently claiming as the open workspace.
 *
 * Scoped to the primary navigation because `aria-current` is a general-purpose
 * attribute, and a future breadcrumb or pagination control marking its own
 * current item must not silently become what these tests assert on.
 */
export function currentWorkspace(page: Page) {
  return page.locator('nav[aria-label="Primary navigation"] [aria-current="page"]');
}
