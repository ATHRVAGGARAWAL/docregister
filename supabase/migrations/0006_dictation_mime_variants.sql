-- docregister — accept codec-qualified audio types in the dictations bucket
--
-- 0002 allowlisted the bare container types. MediaRecorder does not produce
-- bare container types: it reports what it negotiated, parameter and all, and
-- `src/lib/audio/recorder.ts` asks for "audio/webm;codecs=opus" first on every
-- non-WebKit browser. Storage compares `allowed_mime_types` as an exact
-- string, so every Chromium dictation was rejected with InvalidMimeType (415)
-- and surfaced to the doctor as "Could not save the recording."
--
-- The route now strips the parameter before it reaches Storage, which is the
-- real fix — this migration is the second layer, so that a future caller that
-- forgets to strip is not another silent 415. It cannot be exhaustive: browsers
-- differ on quoting and on the space after the semicolon, and an allowlist
-- matched by equality can only ever list the spellings someone has seen. That
-- asymmetry is the reason the normalising belongs in the application.

update storage.buckets
   set allowed_mime_types = array[
     'audio/webm',
     'audio/webm;codecs=opus',
     'audio/mp4',
     'audio/mp4;codecs=mp4a.40.2',
     'audio/ogg',
     'audio/ogg;codecs=opus',
     'audio/wav',
     'audio/mpeg'
   ]
 where id = 'dictations';
