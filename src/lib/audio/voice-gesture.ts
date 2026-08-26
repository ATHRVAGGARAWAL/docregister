export type VoicePointerIntent = "none" | "start" | "stop";
export type VoicePointerReleaseIntent = "none" | "lock" | "stop";

export const VOICE_TAP_MAX_MS = 350;
export const VOICE_TAP_SLOP_PX = 10;

/** Decide the action once, at pointer-down, so a phase change cannot rewrite it. */
export function voicePointerDownIntent({
  listening,
  busy,
}: {
  listening: boolean;
  busy: boolean;
}): VoicePointerIntent {
  if (busy) return "none";
  return listening ? "stop" : "start";
}

/** Only a pointer that started the recording is allowed to classify its release. */
export function voicePointerReleaseIntent({
  pointerIntent,
  listening,
  locked,
  cancelled,
  heldForMs,
  travelPx,
}: {
  pointerIntent: VoicePointerIntent;
  listening: boolean;
  locked: boolean;
  cancelled: boolean;
  heldForMs: number;
  travelPx: number;
}): VoicePointerReleaseIntent {
  if (pointerIntent !== "start" || cancelled || locked || !listening) return "none";
  if (heldForMs < VOICE_TAP_MAX_MS && travelPx < VOICE_TAP_SLOP_PX) return "lock";
  return "stop";
}

/** Pointer activation already ran on pointer-down; detail 0 is keyboard/AT click. */
export function isKeyboardVoiceActivation(clickDetail: number): boolean {
  return clickDetail === 0;
}
