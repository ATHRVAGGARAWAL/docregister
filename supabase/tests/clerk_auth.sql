-- Run against a local migrated database. Every fixture is rolled back.
begin;
do $$
declare
  a doctors%rowtype;
  b doctors%rowtype;
  pending doctors%rowtype;
  v_count integer;
  v_patient uuid;
begin
  a := provision_clerk_doctor('user_ClerkIsolationA', 'isolation-a@example.com', 'Isolation A', 'Clerk isolation A');
  b := provision_clerk_doctor('user_ClerkIsolationB', 'isolation-b@example.com', 'Isolation B', 'Clerk isolation B');
  pending := provision_clerk_doctor('user_ClerkIsolationPending', 'isolation-pending@example.com', 'Pending', 'Clerk isolation A');
  if a.id = b.id or pending.membership_status <> 'pending' then raise exception 'identity provisioning failed'; end if;
  if (provision_clerk_doctor('user_ClerkIsolationA', 'isolation-a@example.com', 'Changed name', 'Different clinic')).id <> a.id then
    raise exception 'provisioning must retain a stable identity';
  end if;
  insert into patients(clinic_id, full_name, created_by) values(a.clinic_id, 'Isolation patient A', a.id) returning id into v_patient;
  insert into patients(clinic_id, full_name, created_by) values(b.clinic_id, 'Isolation patient B', b.id);

  perform set_config('request.jwt.claims', jsonb_build_object('sub','user_ClerkIsolationA','sid','sess_test','role','authenticated','doctor_id',b.id,'clinic_id',b.clinic_id)::text, true);
  set local role authenticated;
  if current_doctor_id() <> a.id or auth_clinic_id() <> a.clinic_id then raise exception 'client claims must not choose a clinic'; end if;
  select count(*) into v_count from patients;
  if v_count <> 1 then raise exception 'cross-clinic patient read'; end if;
  begin
    perform provision_clerk_doctor('user_ClerkImpersonation', 'attacker@example.com', 'Attacker', 'Clerk isolation A');
    raise exception 'authenticated caller provisioned an identity';
  exception when insufficient_privilege then null;
  end;
  begin
    update doctors set clerk_user_id = 'user_ClerkImpersonation' where id = a.id;
    raise exception 'authenticated caller changed identity';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claims', '{"sub":"user_ClerkIsolationPending","sid":"sess_test","role":"authenticated"}', true);
  if auth_clinic_id() is not null then raise exception 'pending member gained clinic access'; end if;
  select count(*) into v_count from patients;
  if v_count <> 0 then raise exception 'pending member read patient data'; end if;
  perform set_config('request.jwt.claims', '{"sub":"user_ClerkIsolationA","sid":"sess_test","sts":"pending","role":"authenticated"}', true);
  if current_doctor_id() is not null then raise exception 'unfinished Clerk session was accepted'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a.id, 'sid','sess_test','role','authenticated')::text, true);
  if current_doctor_id() is not null then raise exception 'legacy UUID token bypassed Clerk'; end if;
  perform set_config('request.jwt.claims', '{"sub":"user_ClerkIsolationA","role":"authenticated"}', true);
  if current_doctor_id() is not null then raise exception 'non-session token was accepted'; end if;
  reset role;
end;
$$;
rollback;
