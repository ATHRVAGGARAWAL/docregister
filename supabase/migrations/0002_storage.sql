-- Dictation audio storage.
--
-- The recordings are protected health information: a consultation recording is
-- arguably more sensitive than the structured note derived from it, because it
-- contains everything that was said, including what the doctor chose not to
-- write down. So the bucket is private, and access is decided by the same
-- clinic boundary as every table.
--
-- Object paths are `<clinic_id>/<doctor_id>/<transcript_id>.<ext>`. The clinic
-- id leads because storage policies can only pattern-match on the path, and
-- `(storage.foldername(name))[1]` is the cheapest way to answer "whose is this".

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dictations',
  'dictations',
  false,                              -- never public; served via signed URLs only
  26214400,                           -- 25 MB, comfortably above a 30 s recording
  array['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/mpeg']
)
on conflict (id) do nothing;

-- Upload: only into your own clinic's folder.
create policy "dictations_insert_own_clinic"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'dictations'
    and (storage.foldername(name))[1] = auth_clinic_id()::text
  );

-- Read: any doctor in the clinic. Partners cover for each other, and a locum
-- reviewing yesterday's note needs the audio behind it.
create policy "dictations_select_own_clinic"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'dictations'
    and (storage.foldername(name))[1] = auth_clinic_id()::text
  );

-- Delete: only the doctor who recorded it. Retention cleanup runs as the
-- service role and bypasses this.
create policy "dictations_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'dictations'
    and (storage.foldername(name))[1] = auth_clinic_id()::text
    and (storage.foldername(name))[2] = auth.uid()::text
  );
