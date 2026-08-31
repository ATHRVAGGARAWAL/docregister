/**
 * Everything the palette can offer, assembled from what the host already holds.
 *
 * Kept apart from the component so the set of commands can be read — and
 * argued with — without reading any rendering. A row exists here only when the
 * host passed a handler for it: a palette that offers "Export the register" to
 * a screen that cannot export is worse than one that does not mention it.
 */

import type { CommandItem } from "@/components/command/command-items";
import {
  BanknoteIcon,
  ClipboardClockIcon,
  ClipboardListIcon,
  ClipboardPenLineIcon,
  HistoryIcon,
  CalendarDaysIcon,
  ToothIcon,
  WalletCardsIcon,
  ActivityIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  Mic,
  Settings2Icon,
  Table2,
  UserRoundIcon,
  UsersRoundIcon,
  type IconProps,
} from "@/components/icons";
import type { PatientMatch } from "@/hooks/use-voice-capture";
import { formatVisitDay } from "@/lib/format";
import type { RegisterEntry } from "@/lib/types";
import type { ComponentType } from "react";

/**
 * Restated rather than imported from the dashboard's navigation, so the palette
 * depends on nothing above it and can be rendered by any host. The two lists
 * still have to agree: a host wiring `onNavigate` to its own view setter gets a
 * type error the moment they drift, which is the point of naming them at all.
 */
export type CommandWorkspaceId =
  | "overview"
  | "register"
  | "patients"
  | "recall"
  | "follow-ups"
  | "accounts"
  | "schedule"
  | "treatments"
  | "operations"
  | "finance"
  | "reports"
  | "settings";

export interface CommandWorkspace {
  id: CommandWorkspaceId;
  label: string;
  /** Searched, never shown — the words a doctor reaches for instead of the label. */
  keywords: string;
  icon: ComponentType<IconProps>;
}

/**
 * The destinations, in sidebar order.
 *
 * Keywords carry the vocabulary the labels do not: "money" has to find
 * Accounts, and "ask" has to find Recall, because those are what the doctor is
 * actually trying to do.
 */
export const COMMAND_WORKSPACES: readonly CommandWorkspace[] = [
  { id: "overview", label: "Overview", keywords: "home dashboard summary today numbers", icon: LayoutDashboardIcon },
  { id: "register", label: "Register", keywords: "visits encounters daybook log drafts", icon: ClipboardListIcon },
  { id: "patients", label: "Patients", keywords: "charts directory people records", icon: UsersRoundIcon },
  { id: "recall", label: "Recall", keywords: "ask question search history", icon: HistoryIcon },
  { id: "follow-ups", label: "Follow-ups", keywords: "callback review due reminders", icon: ClipboardClockIcon },
  { id: "accounts", label: "Accounts", keywords: "money fees payments income expenses ledger", icon: LandmarkIcon },
  { id: "schedule", label: "Schedule", keywords: "appointments chairs operatory booking diary calendar", icon: CalendarDaysIcon },
  { id: "treatments", label: "Treatments", keywords: "plans quotes phases sittings course of treatment", icon: ToothIcon },
  { id: "operations", label: "Lab & stock", keywords: "lab cases crown denture inventory materials expiry reorder", icon: ClipboardListIcon },
  { id: "finance", label: "Finance", keywords: "invoices estimates outstanding receivables billing", icon: WalletCardsIcon },
  { id: "reports", label: "Reports", keywords: "analytics trends business clinical performance", icon: ActivityIcon },
  { id: "settings", label: "Settings", keywords: "profile preferences clinic account language", icon: Settings2Icon },
];

export interface CommandSources {
  workspaces: readonly CommandWorkspace[];
  activeWorkspace?: CommandWorkspaceId;
  onNavigate?: (id: CommandWorkspaceId) => void;
  visits: readonly RegisterEntry[];
  onOpenVisit?: (entry: RegisterEntry) => void;
  patients: readonly PatientMatch[];
  onOpenPatient?: (patient: PatientMatch) => void;
  onStartDictation?: () => void;
  onAddAccountEntry?: () => void;
  onExportRegister?: () => void;
}

/**
 * Ids are prefixed by kind because two things downstream read them: the DOM,
 * which needs them unique, and the recents store, which remembers only the
 * prefixes that carry no patient in them.
 */
export function buildCommandItems({
  workspaces,
  activeWorkspace,
  onNavigate,
  visits,
  onOpenVisit,
  patients,
  onOpenPatient,
  onStartDictation,
  onAddAccountEntry,
  onExportRegister,
}: CommandSources): CommandItem[] {
  const items: CommandItem[] = [];

  if (onNavigate) {
    for (const workspace of workspaces) {
      items.push({
        id: `navigate:${workspace.id}`,
        group: "navigate",
        label: workspace.label,
        meta: workspace.id === activeWorkspace ? "Current" : undefined,
        keywords: workspace.keywords,
        icon: workspace.icon,
        run: () => onNavigate(workspace.id),
      });
    }
  }

  if (onOpenPatient) {
    for (const patient of patients) {
      items.push({
        id: `patient:${patient.id}`,
        group: "patients",
        label: patient.full_name,
        detail: patientDetail(patient),
        meta: lastSeen(patient.last_visit),
        icon: UserRoundIcon,
        // The server also matches on phone digits and on near-spellings, so a
        // row whose name does not contain what was typed is a correct answer,
        // not a near miss for the local matcher to discard.
        keepUnmatched: true,
        run: () => onOpenPatient(patient),
      });
    }
  }

  if (onOpenVisit) {
    for (const visit of visits) {
      items.push({
        id: `visit:${visit.id}`,
        group: "visits",
        label: visit.patient_name,
        detail: visit.diagnosis ?? undefined,
        meta: visitMeta(visit),
        keywords: [visit.treatment ?? "", ...visit.drugs].join(" ").trim() || undefined,
        icon: visit.status === "draft" ? ClipboardPenLineIcon : ClipboardListIcon,
        run: () => onOpenVisit(visit),
      });
    }
  }

  if (onStartDictation) {
    items.push({
      id: "action:start-dictation",
      group: "actions",
      label: "Start a dictation",
      detail: "Record a visit, then review it before it is saved",
      keywords: "record voice microphone speak new visit consultation",
      icon: Mic,
      run: onStartDictation,
    });
  }

  if (onAddAccountEntry) {
    items.push({
      id: "action:add-account-entry",
      group: "actions",
      label: "Add an account entry",
      detail: "Record income or an expense in the ledger",
      keywords: "money fee cash payment income expense receipt",
      icon: BanknoteIcon,
      run: onAddAccountEntry,
    });
  }

  if (onExportRegister) {
    items.push({
      id: "action:export-register",
      group: "actions",
      label: "Export the register",
      detail: "Download the register as a CSV file",
      keywords: "download csv spreadsheet backup accountant",
      icon: Table2,
      run: onExportRegister,
    });
  }

  return items;
}

/**
 * Age and how often this chart has been opened — enough to tell two people with
 * the same name apart. The phone number is deliberately left out: it is the one
 * field here that turns a screenshot of the palette into a contact record, and
 * the last-seen date already separates the duplicates it would have separated.
 */
function patientDetail(patient: PatientMatch): string | undefined {
  const parts: string[] = [];
  if (patient.age_years !== null) parts.push(`${patient.age_years} years`);
  if (patient.visit_count) parts.push(patient.visit_count === 1 ? "1 visit" : `${patient.visit_count} visits`);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function lastSeen(iso: string | null): string | undefined {
  const day = formatVisitDay(iso);
  return day ? `Seen ${day}` : undefined;
}

/** A draft says so first: it is the row a doctor is most likely to be hunting for. */
function visitMeta(visit: RegisterEntry): string | undefined {
  const day = formatVisitDay(visit.occurred_at);
  if (visit.status === "draft") return day ? `Draft · ${day}` : "Draft";
  return day ?? undefined;
}
