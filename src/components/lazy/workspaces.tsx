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
 * The tab bodies, one chunk per tab.
 *
 * MEASURED, AND IT DOES NOT PAY. Wiring all six of these into the dashboard was
 * built twice on 766751f and compared against the same tree with only the
 * charts split. It moves 51 kB of uncompressed JavaScript off `/`, but the
 * first load goes from 325 kB gzipped to 322 kB and from 275 kB brotli to
 * 278 kB — worse over the wire on modern browsers — while turning 12 requests
 * into 17. Do not wire these expecting a win; re-measure if you wire them at
 * all.
 *
 * The reason is worth keeping even though the conclusion is negative. SSR is
 * left on here, because a component that is server-rendered still deep-links
 * correctly — `?view=register` renders that workspace into the HTML instead of
 * a placeholder. But a server-rendered dynamic import has its chunk preloaded
 * with the document, so the bytes do not leave the first load; splitting mostly
 * fragments them across more files, and a compressor given six small files
 * beats a compressor given one large file by less than the per-file overhead
 * costs. Turning SSR off would move real bytes, at the price of a blank tab on
 * every deep link — the wrong side of that trade for a register a doctor links
 * colleagues into.
 *
 * The charts are the opposite case and the reason `charts.tsx` exists: recharts
 * is a single 334 kB dependency that renders nothing on the server anyway, so
 * `ssr: false` there costs no pixels and removes 96 kB gzipped.
 *
 * Nothing on the dictation path is in here. The voice dock, the capture hook,
 * the recorder and the review sheet are all imported eagerly by the dashboard
 * and must stay that way — see the note in `sheets.tsx`.
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
    loading: () => <WorkspacePending label="accounts" />,
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
