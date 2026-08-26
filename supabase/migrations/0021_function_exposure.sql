-- docregister — take the internal functions off the API surface, and pin the
-- search_path on every function that still resolves its tables through one it
-- does not control.
--
-- Three groups, three different threats. Every claim below was checked against
-- the live project rather than reasoned about, because the obvious reading of
-- two of them is wrong and the third is worse than it looks.
--
-- (1) TRIGGER FUNCTIONS carry an EXECUTE grant to `anon` and `authenticated`.
--     Supabase ships `alter default privileges ... grant execute on functions
--     to anon, authenticated`, so a trigger function picks the grant up simply
--     by being created; 0017 left the two it knew about on the grounds that
--     the grant conveys nothing.
--
--     That is still true, and it is worth recording how it was established
--     rather than repeating it: `select record_audit()` and
--     `select handle_new_doctor()` both fail with "trigger functions can only
--     be called as triggers", so no POST to /rest/v1/rpc/record_audit forges an
--     audit row — signed in or not. The grant is not a hole today.
--
--     It is revoked anyway because it is one refactor away from being one: the
--     day someone lifts the body of a trigger into a plain function and keeps
--     the name, the default grant is already sitting there and nobody re-reads
--     this file. Revoking costs nothing, and that was measured too — a trigger
--     whose function had EXECUTE revoked from public, anon and authenticated
--     still fired for a `set role authenticated` insert on this database.
--     PostgreSQL checks EXECUTE once, when the trigger is created, and never
--     again when it fires.
--
-- (2) INTERNAL HELPERS with no caller. `mark_audio_deleted` is SECURITY
--     DEFINER and 0011 granted it to `authenticated` for an audio-retention
--     caller that was never written. The retention job that now exists
--     (src/app/api/maintenance/audio-retention/route.ts) names the function
--     only to explain why it does not call it: the function joins `doctors where id =
--     auth.uid()`, which is null under the service-role key a scheduled job
--     runs with. So the grant buys the app nothing and costs it this: any
--     doctor can null the `audio_path` of every transcript in their clinic in
--     one call. That does not delete the object, it loses the only pointer to
--     it — the recording outlives the row that could find it, and a signed
--     visit loses the evidence behind it. If a doctor-facing purge is built
--     later it will want a confirmation step and a route of its own, and
--     re-granting then is a deliberate act rather than an inherited default.
--
-- (3) MUTABLE search_path, on twenty functions. For the SECURITY INVOKER ones
--     it is a correctness risk. For the SECURITY DEFINER ones it is privilege
--     escalation — and `set search_path = public`, which five of them already
--     have, does not fix it. pg_temp is searched FIRST whenever it is not
--     named explicitly, so `public` alone still lets a caller's temp table
--     win. Measured here, not assumed: a SECURITY DEFINER function declared
--     `set search_path = public` and selecting from a public table read the
--     caller's temp table of the same name instead.
--
--     What that buys, concretely:
--       auth_clinic_id()     a temp `doctors` row mapping the caller's uid to
--                            another clinic makes every RLS policy in 0001
--                            hand them that clinic's charts.
--       record_audit()       a temp `audit_log` swallows the trigger's insert.
--                            The register keeps changing and the trail — the
--                            artefact you would show a regulator — records
--                            none of it.
--       is_platform_admin()  a temp `admin_emails` row makes the caller an
--                            owner, and `issue_clinic_invite` lets owners mint
--                            invites into any clinic they can name.
--
--     Reachable today? No. PostgREST gives a browser no way to run `create
--     temp table`, and `anon`/`authenticated` are NOLOGIN roles reached only
--     through the authenticator. But both roles do hold TEMP on this database,
--     so the distance between "not exploitable" and "exploitable" is one
--     session opened as either role: a leaked pooler credential, or the first
--     maintenance script somebody writes in psql. The pin is one line per
--     function and changes no behaviour — pg_trgm and unaccent are installed
--     in `public` on this project, so `public, pg_temp` still resolves
--     `similarity`, `%` and `unaccent`. pgcrypto and uuid-ossp are in
--     `extensions`, and the only functions that reach into those
--     (`issue_clinic_invite`, `handle_new_doctor`) already name it.
--
-- Nothing here drops or recreates a function, so it is safe to re-run: REVOKE
-- of a privilege that is not held is a no-op, and ALTER ... SET writes a value
-- that is already there.

-- ---------------------------------------------------------------------------
-- Deliberately NOT revoked
-- ---------------------------------------------------------------------------
--
-- Every route builds its client with `getSupabaseServerClient()` — the anon key
-- plus the doctor's session cookie, so role `authenticated`. The one
-- service-role client in the app is the audio-retention job, which calls no
-- RPCs at all. Anything the app calls therefore has to keep its grant to
-- `authenticated`:
--
--   account_entries_search       create_transcript_workflow   register_search
--   account_entries_summary      discard_draft_workflow       register_totals
--   append_encounter_amendment   doctor_top_drugs             save_clinical_draft
--   clinic_daily_stats           list_follow_ups              update_account_entry_status
--   commit_encounter_workflow    list_patients                update_doctor_profile_workflow
--   commit_encounter_with_income_workflow                     update_draft_workflow
--   complete_follow_up_workflow  log_sensitive_access         update_patient_workflow
--   consume_rate_limit           match_patients               restore_discarded_draft_workflow
--   create_account_entry         create_follow_up_workflow    create_manual_draft
--   update_draft_with_consultation_fee_workflow
--
-- Grepping `.rpc(` finds seven of those. The rest go through `callWorkflow()`
-- in src/lib/supabase/workflows.ts, which takes the function name as a string
-- argument. Grep both, or a function three routes depend on will look unused.
--
-- `log_sensitive_access` is the one to be careful with, because it reads like
-- an internal helper and is not one: the visit-details, patient-history and
-- recall routes all call it and all three fail closed on its error, so
-- revoking it returns 500 from every PHI read in the app. The residue is that
-- a doctor can POST a spurious `read` entry into their own clinic's log under
-- their own actor id. They cannot name another actor or another clinic — both
-- come from `auth.uid()` inside the body — so the trail can be padded but not
-- rewritten. That is the price of logging a read from the same session that
-- performs it; a service-role logger the routes call through would move the
-- forgery surface rather than remove it.
--
-- `auth_clinic_id` and `is_platform_admin` keep their grants for the reasons
-- 0017 recorded: both are read-only, both return null/false without a session,
-- and `auth_clinic_id` is called from inside RLS policies that have no `to`
-- clause, where a missing EXECUTE turns an empty result into a permission
-- error. Their real exposure is the search_path, fixed below.

-- ---------------------------------------------------------------------------
-- (1) Trigger functions — nothing may call these directly
-- ---------------------------------------------------------------------------

revoke execute on function record_audit()                         from public, anon, authenticated;
revoke execute on function handle_new_doctor()                    from public, anon, authenticated;
revoke execute on function normalize_patient_name()               from public, anon, authenticated;
revoke execute on function prevent_encounter_amendment_mutation() from public, anon, authenticated;
revoke execute on function enforce_encounter_commit_evidence()    from public, anon, authenticated;
revoke execute on function strip_encounter_financial_fields()     from public, anon, authenticated;
revoke execute on function strip_amendment_financial_fields()     from public, anon, authenticated;
revoke execute on function touch_account_entry_updated_at()       from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- (2) Internal helpers
-- ---------------------------------------------------------------------------
--
-- `public` is named alongside the two roles because revoking PUBLIC does not
-- touch a role's own explicit grant, and Supabase's default privileges write
-- one for `anon` and `authenticated` on every function created. That asymmetry
-- is what made 0011's `revoke ... from public` look sufficient when it was not.

revoke execute on function mark_audio_deleted(uuid[]) from public, anon, authenticated;

-- `expired_audio_paths` is the read half of the same pair and keeps its
-- `authenticated` grant. It is SECURITY INVOKER over `transcripts`, so it can
-- only ever return rows the caller could have selected directly — revoking it
-- would close a door that opens onto a room the doctor is already standing in.
-- `anon` is taken off it on 0017's principle: close the grant rather than rely
-- on `auth_clinic_id()` returning null inside the body.
revoke execute on function expired_audio_paths(int) from public, anon;

-- `prune_rate_limits()` and `replace_prescription_items_internal(uuid, uuid,
-- jsonb)` belong to this group and are already clean — 0011 revoked both. They
-- are named here so that the next person greps this file and finds them
-- considered rather than forgotten.

-- ---------------------------------------------------------------------------
-- (3) search_path
-- ---------------------------------------------------------------------------
--
-- Applied with ALTER rather than by editing each definition, so this migration
-- cannot change a function body by accident. The catch: `create or replace
-- function` assigns every property the command implies, and a definition with
-- no SET clause implies none — verified, replacing a pinned function without
-- repeating the clause leaves proconfig null. So when you next touch any
-- function below, carry `set search_path = public, pg_temp` into the definition
-- itself. Otherwise this migration is silently undone and only the security
-- advisor will notice.

-- No search_path at all: whatever the caller happens to be using.
alter function account_entries_search(timestamptz, timestamptz, text, text, text, int, int)
  set search_path = public, pg_temp;
alter function account_entries_summary(timestamptz, timestamptz)   set search_path = public, pg_temp;
alter function clinic_daily_stats(date, date, uuid)                set search_path = public, pg_temp;
alter function commit_encounter(uuid, uuid)                        set search_path = public, pg_temp;
alter function doctor_top_drugs(uuid, int)                         set search_path = public, pg_temp;
alter function expired_audio_paths(int)                            set search_path = public, pg_temp;
alter function match_patients(text, text, int)                     set search_path = public, pg_temp;
alter function normalize_patient_name()                            set search_path = public, pg_temp;
alter function prevent_encounter_amendment_mutation()              set search_path = public, pg_temp;
alter function register_search(uuid, timestamptz, text, text, int, int)
  set search_path = public, pg_temp;
alter function register_totals(uuid, timestamptz, text)            set search_path = public, pg_temp;
alter function save_clinical_draft(uuid, uuid, text, int, text, text, jsonb, text[], text, real, jsonb)
  set search_path = public, pg_temp;
alter function strip_amendment_financial_fields()                  set search_path = public, pg_temp;
alter function strip_encounter_financial_fields()                  set search_path = public, pg_temp;
alter function touch_account_entry_updated_at()                    set search_path = public, pg_temp;

-- Pinned to `public`, which reads as done and is not: pg_temp is searched first
-- until it is named, and all five of these are SECURITY DEFINER.
alter function auth_clinic_id()                                    set search_path = public, pg_temp;
alter function is_platform_admin()                                 set search_path = public, pg_temp;
alter function record_audit()                                      set search_path = public, pg_temp;
alter function consume_rate_limit(text)                            set search_path = public, pg_temp;
alter function prune_rate_limits()                                 set search_path = public, pg_temp;
