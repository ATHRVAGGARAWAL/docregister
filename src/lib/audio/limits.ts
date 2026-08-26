/** One minute of dictation, with a small upload tolerance for recorder shutdown. */
export const RECORDING_LIMIT_MS = 60_000;
export const RECORDING_WARNING_MS = 50_000;
export const RECORDING_UPLOAD_LIMIT_MS = RECORDING_LIMIT_MS + 1_500;

/**
 * Keep a full minute of mono speech comfortably below Vercel's 4.5 MB request
 * ceiling. Browsers may negotiate a different rate, so the byte limit below
 * remains the final guard before constructing the multipart request.
 */
export const RECORDING_AUDIO_BITS_PER_SECOND = 96_000;

/** Multipart overhead still has room inside the platform's 4.5 MB limit. */
export const RECORDING_UPLOAD_LIMIT_BYTES = 4 * 1024 * 1024;
