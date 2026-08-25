-- docregister — demo seed
--
-- Optional. Run it in the Supabase SQL editor AFTER you have signed in once:
-- the first sign-in fires `handle_new_doctor`, which creates your clinic and
-- your `doctors` row, and this script attaches to the most recently created
-- doctor. Without it the dashboard renders correctly but every chart is a flat
-- line at zero, which tells you nothing about whether the layout works.
--
-- Everything it writes is tagged (`extracted_raw ->> 'seed'` on encounters,
-- `notes = 'seed'` on patients) and removed at the top of the script, so it is
-- safe to re-run and easy to clear out before real use:
--
--   delete from encounters where extracted_raw ->> 'seed' = 'true';
--   delete from patients   where notes = 'seed';

do $$
declare
  v_doctor   doctors%rowtype;
  v_clinic   uuid;
  v_day      date;
  v_visits   int;
  v_i        int;
  v_patient  uuid;
  v_enc      uuid;
  v_dx_idx   int;
  -- Phone numbers are unique per clinic, so walk a counter rather than hoping
  -- random() does not collide.
  v_seq      int := 200;

  -- Pools for walk-in patients, so the new-vs-returning chart has something to
  -- show on every day rather than a wall of new charts in week one.
  v_first text[] := array[
    'Anil', 'Pooja', 'Manjit', 'Farhan', 'Deepa', 'Vikram',
    'Simran', 'Rohit', 'Anita', 'Jaspreet', 'Suresh', 'Nisha'
  ];
  v_last text[] := array[
    'Kumar', 'Sharma', 'Singh', 'Yadav', 'Chauhan', 'Reddy',
    'Kaur', 'Mehta', 'Bose', 'Patel', 'Iyer', 'Khan'
  ];

  v_names text[] := array[
    'Sunita Devi', 'Rajesh Kumar', 'Harpreet Singh', 'Meena Sharma',
    'Amit Verma', 'Kavita Joshi', 'Balwinder Kaur', 'Imran Sheikh',
    'Lakshmi Nair', 'Ravi Patil', 'Neha Gupta', 'Gurdeep Sandhu'
  ];
  v_phones text[] := array[
    '9811000101', '9811000102', '9811000103', '9811000104',
    '9811000105', '9811000106', '9811000107', '9811000108',
    '9811000109', '9811000110', '9811000111', '9811000112'
  ];
  v_ages int[] := array[42, 35, 61, 28, 50, 33, 68, 24, 47, 55, 31, 39];

  -- Diagnosis / treatment / drug are kept index-aligned so a seeded visit reads
  -- like an actual consultation rather than three unrelated random picks.
  v_dx text[] := array[
    'Acute pharyngitis', 'Type 2 diabetes — follow up', 'Hypertension — review',
    'Viral fever', 'Acid peptic disease', 'Lower back pain',
    'Allergic rhinitis', 'Urinary tract infection'
  ];
  v_tx text[] := array[
    'Antibiotic course, warm saline gargles',
    'Continue metformin, HbA1c in 3 months',
    'Dose unchanged, home BP log advised',
    'Symptomatic, fluids, review if fever persists 3 days',
    'PPI before breakfast, avoid late meals',
    'Analgesic, posture advice, physiotherapy referral',
    'Antihistamine at night, avoid dust exposure',
    'Antibiotic, high fluid intake'
  ];
  v_drug text[] := array[
    'Amoxicillin', 'Metformin', 'Amlodipine', 'Paracetamol',
    'Pantoprazole', 'Aceclofenac', 'Levocetirizine', 'Nitrofurantoin'
  ];
  v_strength text[] := array[
    '500 mg', '500 mg', '5 mg', '650 mg', '40 mg', '100 mg', '5 mg', '100 mg'
  ];
  v_spoken text[] := array[
    'do baar', 'BD', 'once daily', 'SOS', 'khali pet subah', 'BD', 'raat ko', 'BD'
  ];
  v_code text[] := array['BD', 'BD', 'OD', 'SOS', 'OD', 'BD', 'HS', 'BD'];
  v_label text[] := array[
    'Twice daily', 'Twice daily', 'Once daily', 'As needed',
    'Once daily', 'Twice daily', 'At bedtime', 'Twice daily'
  ];
begin
  select * into v_doctor from doctors order by created_at desc limit 1;
  if v_doctor.id is null then
    raise exception
      'No doctor rows yet. Sign in to the app once first — that creates your clinic and doctor row.';
  end if;
  v_clinic := v_doctor.clinic_id;

  -- Idempotent: clear any previous run before writing a new one.
  delete from encounters where clinic_id = v_clinic and extracted_raw ->> 'seed' = 'true';
  delete from patients   where clinic_id = v_clinic and notes = 'seed';

  for v_i in 1 .. array_length(v_names, 1) loop
    insert into patients (clinic_id, full_name, phone, age_years, notes, created_by, first_seen_at)
    values (
      v_clinic, v_names[v_i], v_phones[v_i], v_ages[v_i], 'seed', v_doctor.id,
      now() - (interval '1 day' * (60 - v_i * 3))
    );
  end loop;

  -- Three weeks of register, ending today.
  for v_day in
    select generate_series(
      (now() at time zone 'Asia/Kolkata')::date - 20,
      (now() at time zone 'Asia/Kolkata')::date,
      interval '1 day'
    )::date
  loop
    -- Sundays are half-days in most Indian clinics; the chart should show that
    -- rather than a suspiciously even week.
    v_visits := case when extract(dow from v_day) = 0 then 2 + floor(random() * 3)::int
                     else 5 + floor(random() * 7)::int end;

    for v_i in 1 .. v_visits loop
      -- Roughly a quarter of visits are someone the clinic has never seen. This
      -- ratio is the whole point of the new-vs-returning chart, so the seed has
      -- to produce it rather than leaving every new chart in week one.
      if random() < 0.25 then
        v_seq := v_seq + 1;
        insert into patients (
          clinic_id, full_name, phone, age_years, notes, created_by, first_seen_at
        )
        values (
          v_clinic,
          v_first[1 + floor(random() * array_length(v_first, 1))::int] || ' ' ||
            v_last[1 + floor(random() * array_length(v_last, 1))::int],
          '98110' || lpad(v_seq::text, 5, '0'),
          18 + floor(random() * 60)::int,
          'seed', v_doctor.id,
          (v_day + time '09:00') at time zone 'Asia/Kolkata'
        )
        returning id into v_patient;
      else
        select id into v_patient
        from patients
        where clinic_id = v_clinic and notes = 'seed'
        order by random()
        limit 1;
      end if;

      v_dx_idx := 1 + floor(random() * array_length(v_dx, 1))::int;

      insert into encounters (
        clinic_id, doctor_id, patient_id, status, occurred_at,
        patient_name_spoken, age_years, diagnosis, treatment, fees_inr,
        extraction_model, extracted_raw, committed_at
      )
      values (
        v_clinic, v_doctor.id, v_patient, 'committed',
        -- Clinic hours, 9am–8pm IST.
        ((v_day + time '09:00') at time zone 'Asia/Kolkata')
          + (interval '1 minute' * floor(random() * 660)::int),
        (select full_name from patients where id = v_patient),
        (select age_years from patients where id = v_patient),
        v_dx[v_dx_idx],
        v_tx[v_dx_idx],
        (array[200, 300, 300, 400, 500, 500, 600, 800])[1 + floor(random() * 8)::int],
        'seed',
        '{"seed": true}'::jsonb,
        now()
      )
      returning id into v_enc;

      insert into prescription_items (
        encounter_id, clinic_id, drug_name, strength, form,
        frequency_spoken, frequency_code, frequency_label,
        duration, route, instructions, position
      )
      values (
        v_enc, v_clinic, v_drug[v_dx_idx], v_strength[v_dx_idx], 'tab',
        v_spoken[v_dx_idx], v_code[v_dx_idx], v_label[v_dx_idx],
        '5 days', 'PO', 'after food', 0
      );
    end loop;
  end loop;

  -- `visit_number` and `is_new_patient` are assigned at commit time by
  -- `commit_encounter`, which this script bypasses. Backfill them the same way
  -- it would, in one pass, so the new-vs-returning chart is truthful.
  with numbered as (
    select id, row_number() over (partition by patient_id order by occurred_at) as n
    from encounters
    where clinic_id = v_clinic and extracted_raw ->> 'seed' = 'true'
  )
  update encounters e
     set visit_number   = numbered.n,
         is_new_patient = (numbered.n = 1)
    from numbered
   where e.id = numbered.id;

  raise notice 'Seeded % visits for %',
    (select count(*) from encounters where clinic_id = v_clinic and extracted_raw ->> 'seed' = 'true'),
    v_doctor.full_name;
end;
$$;
