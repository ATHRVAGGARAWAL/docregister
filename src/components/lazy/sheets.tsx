"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type ComponentProps, type ComponentType } from "react";

import type { VisitDetailSheet as VisitDetailSheetImpl } from "@/components/dashboard/visit-detail-sheet";
import { SheetPending } from "@/components/lazy/pending";
import type { PatientHistorySheet as PatientHistorySheetImpl } from "@/components/patients/patient-history-sheet";
import type { ReviewSheet as ReviewSheetImpl } from "@/components/voice/review-sheet";

/**
 * The sheets, deferred until something opens them.
 *
 * Two of these are mounted unconditionally by their parent and told whether
 * they are open, which is the right shape for a Radix sheet — it owns its own
 * enter and exit animation and has to be in the tree to play the exit. It is
 * the wrong shape for code splitting, because a component that is always
 * rendered is always server-rendered, and a server-rendered dynamic import has
 * its chunk preloaded with the document. So the wrappers below hold the import
 * back until `open` first turns true, and then keep it mounted for good: the
 * second open must not re-suspend, and the first close must still animate.
 *
 * `ManualVisitFlow` is deliberately absent. It is the escape hatch the offline
 * notice offers when the network has already failed, and a fallback that has to
 * be fetched over the network is not a fallback. It stays eagerly imported.
 */

/**
 * True once `open` has been true, and true forever after.
 *
 * Assigning during render rather than in an effect is deliberate — an effect
 * would paint one frame with the sheet still absent, which is a frame of the
 * doctor's tap doing nothing.
 */
function useOpenedAtLeastOnce(open: boolean): boolean {
  const [opened, setOpened] = useState(open);
  if (open && !opened) setOpened(true);
  return opened;
}

const loadReviewSheet = () => import("@/components/voice/review-sheet");
const loadVisitDetailSheet = () => import("@/components/dashboard/visit-detail-sheet");
const loadPatientHistorySheet = () => import("@/components/patients/patient-history-sheet");

/**
 * The confirmation step of a dictated visit.
 *
 * This one sits on the dictation path, and it is the screen where a doctor
 * turns what a model heard into a record — so it must never be the thing they
 * are waiting on. Splitting it is only safe alongside a preload: mount
 * `<ReviewSheetPreloader />` once, or call `preloadReviewSheet()` when
 * recording arms, and the chunk is in memory long before a transcript comes
 * back from the server. Without one of those, leave the direct import in place.
 */
export const ReviewSheet: ComponentType<ComponentProps<typeof ReviewSheetImpl>> = dynamic(
  () => loadReviewSheet().then((mod) => mod.ReviewSheet),
  { loading: () => <SheetPending label="the visit review" /> },
);

export function preloadReviewSheet(): void {
  void loadReviewSheet();
}

export function preloadVisitDetailSheet(): void {
  void loadVisitDetailSheet();
}

export function preloadPatientHistorySheet(): void {
  void loadPatientHistorySheet();
}

/**
 * Warms the review sheet's chunk once the page has gone quiet.
 *
 * Renders nothing and mounts anywhere inside the dashboard. The idle callback
 * is the point: fetching during hydration would put the bytes back on the
 * critical path and undo the split. `requestIdleCallback` is still missing on
 * older iOS, which is exactly the phone a clinic is likely to be holding, so
 * the timeout is the real path for a meaningful share of users rather than a
 * theoretical fallback.
 */
export function ReviewSheetPreloader(): null {
  useEffect(() => {
    if (typeof window.requestIdleCallback !== "function") {
      const timer = window.setTimeout(preloadReviewSheet, 1200);
      return () => window.clearTimeout(timer);
    }

    const handle = window.requestIdleCallback(preloadReviewSheet, { timeout: 3000 });
    return () => window.cancelIdleCallback(handle);
  }, []);

  return null;
}

const VisitDetailSheetLazy: ComponentType<ComponentProps<typeof VisitDetailSheetImpl>> = dynamic(
  () => loadVisitDetailSheet().then((mod) => mod.VisitDetailSheet),
  { loading: () => <SheetPending label="the visit" /> },
);

export function VisitDetailSheet(props: ComponentProps<typeof VisitDetailSheetImpl>) {
  return useOpenedAtLeastOnce(props.open) ? <VisitDetailSheetLazy {...props} /> : null;
}

const PatientHistorySheetLazy: ComponentType<ComponentProps<typeof PatientHistorySheetImpl>> =
  dynamic(() => loadPatientHistorySheet().then((mod) => mod.PatientHistorySheet), {
    loading: () => <SheetPending label="the patient history" />,
  });

export function PatientHistorySheet(props: ComponentProps<typeof PatientHistorySheetImpl>) {
  return useOpenedAtLeastOnce(props.open) ? <PatientHistorySheetLazy {...props} /> : null;
}
