-- docregister — take `anon` off the mutation surface
--
-- 0011 revoked each workflow `from public` and granted it to `authenticated`,
-- and its comment says that makes the boundary explicit. It did not. Supabase
-- ships `alter default privileges ... grant execute on functions to anon,
-- authenticated`, so every new function also carries an explicit grant to
-- `anon`, and revoking PUBLIC leaves that grant untouched. 0014-0016 write
-- `from public, anon` and were unaffected; the 0011 workflows were not.
--
-- Nothing was reachable through it: each workflow opens with a `doctors`
-- lookup on `auth.uid()` and raises `authentication required` when that is
-- null, which was verified against the live project with a publishable key --
-- `create_patient_workflow` and `update_patient_workflow` both refused, and no
-- row was created or altered. `consume_rate_limit` was the exception: it ran
-- and returned false, so an unauthenticated caller could still spend a bucket.
--
-- This closes the grant itself rather than relying only on the check inside
-- each body, so that a future workflow written without that opening guard is
-- not silently exposed.

revoke execute on function commit_encounter_workflow(uuid, uuid, jsonb, text) from anon;
revoke execute on function create_manual_draft(uuid, jsonb, jsonb) from anon;
revoke execute on function create_patient_workflow(text, text, int, text, text, text) from anon;
revoke execute on function create_transcript_workflow(uuid, text, text, int, stt_provider, text, text, text, real, boolean, text, text, text) from anon;
revoke execute on function discard_draft_workflow(uuid, int) from anon;
revoke execute on function issue_clinic_invite(text, clinic_role, interval) from anon;
revoke execute on function log_sensitive_access(audit_action, text, uuid, jsonb) from anon;
revoke execute on function mark_audio_deleted(uuid[]) from anon;
revoke execute on function restore_discarded_draft_workflow(uuid, int) from anon;
revoke execute on function save_extracted_draft(uuid, uuid, text, int, text, text, numeric, jsonb, text[], text, real, jsonb) from anon;
revoke execute on function update_doctor_profile_workflow(text, text, text, text[]) from anon;
revoke execute on function update_draft_workflow(uuid, jsonb, jsonb, int) from anon;
revoke execute on function update_patient_workflow(uuid, jsonb) from anon;
revoke execute on function consume_rate_limit(text) from anon;

-- Deliberately left executable by `anon`:
--   auth_clinic_id()    -- read-only, returns null without a session, and is
--                          called from inside RLS policies that have no `to`
--                          clause; revoking it would turn an empty result into
--                          a permission error for no gain.
--   is_platform_admin() -- read-only, returns false without a session.
--   record_audit(), handle_new_doctor()
--                       -- trigger functions. PostgreSQL does not consult
--                          EXECUTE when firing a trigger, and calling either
--                          directly fails with "can only be called as a
--                          trigger", so the grant conveys nothing.
