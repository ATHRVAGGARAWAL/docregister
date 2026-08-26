"use client";

import { CircleAlertIcon, CircleCheckIcon, FilePenLine } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * What a dropped connection actually costs, said plainly in the dock.
 *
 * The distinction worth making to a doctor mid-consultation: MediaRecorder is
 * entirely local, so losing the network costs nothing at capture time — the
 * microphone still works and the audio is still being written. What it costs is
 * filing. A doctor who reads "you are offline, this recording is held" carries
 * on with the patient; one who reads the generic upload error assumes their
 * dictation was the problem and says it all again.
 *
 * Nothing here is persisted, and that is a decision rather than an omission: a
 * held recording lives in this page's memory and a reload loses it. These are
 * shared clinic phones, and consultation audio parked in localStorage,
 * IndexedDB or a service-worker cache is patient data left behind for whoever
 * picks the phone up next. Whether to accept that is the clinic owner's call,
 * not a default. It is also why the copy below promises only "keep this page
 * open" — the sentence is true exactly as long as the storage stays empty.
 */
export function OfflineNotice({
  offline,
  heldRecording,
  onSend,
  onManualEntry,
}: {
  offline: boolean;
  /** A finished recording is waiting in memory, unfiled. */
  heldRecording: boolean;
  /**
   * Send the held recording. Offered, never called on the doctor's behalf:
   * nothing an LLM produces enters the register without them choosing it, and
   * that starts with choosing when the audio goes.
   */
  onSend: () => void;
  onManualEntry: () => void;
}) {
  if (!offline && !heldRecording) return null;

  const Icon = offline ? CircleAlertIcon : CircleCheckIcon;
  const headline = offline ? "No connection." : "The connection is back.";
  const detail = offline
    ? heldRecording
      ? "This recording is held on this screen and has not been filed. Keep this page open — nothing is saved to the phone."
      : "Recording still works; the microphone is entirely local. A visit can only be filed once the connection returns."
    : "The recording you just made is still held here, and nothing has been sent.";

  return (
    <div
      role="status"
      className={cn(
        "col-span-full mt-2 flex flex-col gap-2 rounded-xl border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between",
        offline ? "border-warning/30 bg-warning/10" : "border-primary/25 bg-primary/8",
      )}
    >
      <p className="flex items-start gap-2 text-xs leading-5 text-foreground">
        <Icon
          className={cn("mt-px size-4 shrink-0", offline ? "text-warning" : "text-primary")}
          aria-hidden
        />
        <span>
          <span className="font-semibold">{headline}</span> {detail}
        </span>
      </p>

      {heldRecording && (
        <div className="flex shrink-0 flex-wrap gap-2 pl-6 sm:pl-0">
          {/* Offered even while the browser says there is no link, because that
              reading is a heuristic and refusing to try would strand a doctor
              whose phone is wrong about its own network. */}
          <Button type="button" size="sm" onClick={onSend}>
            {offline ? "Try sending anyway" : "Send this recording"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onManualEntry}>
            <FilePenLine className="size-4" aria-hidden />
            Enter manually
          </Button>
        </div>
      )}
    </div>
  );
}
