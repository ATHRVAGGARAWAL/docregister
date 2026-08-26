"use client";

import dynamic from "next/dynamic";
import type { ComponentProps, ComponentType } from "react";

import type { AccountsWorkspace as AccountsWorkspaceImpl } from "@/components/accounts/accounts-workspace";
import type { AppView } from "@/components/dashboard/app-navigation";
import type { RecallWorkspace as RecallWorkspaceImpl } from "@/components/dashboard/recall-workspace";
import type { RegisterWorkspace as RegisterWorkspaceImpl } from "@/components/dashboard/register-workspace";
import type { SettingsWorkspace as SettingsWorkspaceImpl } from "@/components/dashboard/settings-workspace";
import type { FollowUpWorkspace as FollowUpWorkspaceImpl } from "@/components/follow-ups/follow-up-workspace";
import { WorkspacePending } from "@/components/lazy/pending";
import type { PatientDirectory as PatientDirectoryImpl } from "@/components/patients/patient-directory";

/**
 * The tab bodies, split one chunk per tab.
 *
 * The dashboard renders exactly one of these at a time — `{view === "register"
 * && <RegisterWorkspace …/>}` — but a static import puts all six in the chunk
 * that the document blocks on, so opening the app pays for the accounts ledger
 * and the settings form before it has drawn the overview.
 *
 * SSR is left on. A component that is not in the rendered tree is not
 * server-rendered and its chunk is not preloaded, so the split costs nothing on
 * the default tab; a doctor who deep-links to `?view=register` still gets that
 * workspace in the server HTML, and its chunk alongside the document, exactly
 * as before. Turning SSR off would trade the first-load win for a blank tab on
 * every deep link, which is the wrong side of the trade.
 *
 * Nothing on the dictation path is in here. The voice dock, the capture hook,
 * the recorder and the review sheet are all imported eagerly by the dashboard
 * and stay that way — see the note in `sheets.tsx`.
 */

/** Kept as named thunks so the preload path and the render path share one specifier. */
const loaders = {
  register: () => import("@/components/dashboard/register-workspace"),
  patients: () => import("@/components/patients/patient-directory"),
  recall: () => import("@/components/dashboard/recall-workspace"),
  "follow-ups": () => import("@/components/follow-ups/follow-up-workspace"),
  accounts: () => import("@/components/accounts/accounts-workspace"),
  settings: () => import("@/components/dashboard/settings-workspace"),
} as const;

export const RegisterWorkspace: ComponentType<ComponentProps<typeof RegisterWorkspaceImpl>> =
  dynamic(() => loaders.register().then((mod) => mod.RegisterWorkspace), {
    loading: () => <WorkspacePending label="the patient register" />,
  });

export const PatientDirectory: ComponentType<ComponentProps<typeof PatientDirectoryImpl>> = dynamic(
  () => loaders.patients().then((mod) => mod.PatientDirectory),
  { loading: () => <WorkspacePending label="the patient directory" /> },
);

export const RecallWorkspace: ComponentType<ComponentProps<typeof RecallWorkspaceImpl>> = dynamic(
  () => loaders.recall().then((mod) => mod.RecallWorkspace),
  { loading: () => <WorkspacePending label="patient recall" /> },
);

export const FollowUpWorkspace: ComponentType<ComponentProps<typeof FollowUpWorkspaceImpl>> =
  dynamic(() => loaders["follow-ups"]().then((mod) => mod.FollowUpWorkspace), {
    loading: () => <WorkspacePending label="follow-ups" />,
  });

export const AccountsWorkspace: ComponentType<ComponentProps<typeof AccountsWorkspaceImpl>> =
  dynamic(() => loaders.accounts().then((mod) => mod.AccountsWorkspace), {
    loading: () => <WorkspacePending label="accounts" /> ,
  });

export const SettingsWorkspace: ComponentType<ComponentProps<typeof SettingsWorkspaceImpl>> =
  dynamic(() => loaders.settings().then((mod) => mod.SettingsWorkspace), {
    loading: () => <WorkspacePending label="settings" />,
  });

/**
 * Fetch a tab's chunk without rendering it.
 *
 * Meant for the moment a tab is aimed at rather than the moment it is chosen —
 * `onPointerDown` and `onFocus` on the nav both fire before the click that
 * changes the view, which is enough on a good connection for the chunk to be
 * resolved by the time the tab is switched. Repeat calls are free: the import
 * is cached after the first.
 *
 * Unknown and already-eager views (`overview`) are no-ops, so the nav can call
 * this for whatever it is pointing at without knowing which tabs are split.
 */
export function preloadWorkspace(view: AppView): void {
  const load = (loaders as Partial<Record<AppView, () => Promise<unknown>>>)[view];
  // Rejections are swallowed on purpose. A failed preload must not surface as an
  // unhandled rejection: nothing is waiting on it, and rendering the tab for
  // real retries the same import and shows the doctor a real error if it fails
  // again.
  void load?.().catch(() => {});
}
