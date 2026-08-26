export type VoiceTapAction = "none" | "start" | "stop";

/** A microphone tap is always a plain start/stop toggle. */
export function voiceTapAction({
  listening,
  busy,
}: {
  listening: boolean;
  busy: boolean;
}): VoiceTapAction {
  if (busy) return "none";
  return listening ? "stop" : "start";
}
