#!/usr/bin/env bash
# Apply every migration to a throwaway Postgres and report the first failure.
#
# The local Supabase stack cannot run on this machine, so without this the only
# way to find out whether a migration parses is to push it at the remote
# project — which is the one place a broken migration must never arrive. This
# gets a real PostgreSQL to answer the question first.
#
# It is not a substitute for the remote push. The stubs below stand in for
# Supabase's `auth` and `storage` schemas, so anything that depends on GoTrue's
# real behaviour is out of scope here. What it does catch is every syntax error,
# every constraint that will not build, every missing dependency between
# migrations, and every function that fails to compile.
#
#   scripts/validate-migrations.sh            # apply the chain
#   KEEP=1 scripts/validate-migrations.sh     # leave the container up to poke at
#
# Requires podman (or docker — set ENGINE=docker).
set -euo pipefail

ENGINE="${ENGINE:-podman}"
CONTAINER="${CONTAINER:-docregister-migration-check}"
IMAGE="${IMAGE:-docker.io/library/postgres:17}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cleanup() {
  if [ "${KEEP:-0}" != "1" ]; then
    "$ENGINE" rm -f "$CONTAINER" >/dev/null 2>&1 || true
  else
    echo "Container kept: $ENGINE exec -it $CONTAINER psql -U postgres -d docregister"
  fi
}
trap cleanup EXIT

"$ENGINE" rm -f "$CONTAINER" >/dev/null 2>&1 || true
"$ENGINE" run -d --rm --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=docregister "$IMAGE" >/dev/null

printf 'waiting for postgres'
for _ in $(seq 1 60); do
  if "$ENGINE" exec "$CONTAINER" pg_isready -U postgres -q 2>/dev/null; then break; fi
  printf '.'; sleep 1
done
echo

psql_run() { "$ENGINE" exec -i "$CONTAINER" psql -U postgres -d docregister -v ON_ERROR_STOP=1 -q; }

# Stand-ins for the Supabase-managed schemas the migrations reference. Only the
# surface they actually use: auth.uid(), auth.jwt(), auth.users, and the three
# storage objects 0002 touches.
psql_run <<'SQL'
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end $$;
create schema if not exists auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;
-- pg_cron and pg_net are Supabase-managed and cannot be installed into a plain
-- PostgreSQL. The migrations guard their `create extension` on availability, so
-- the only thing still needed here is somewhere for `cron.schedule` to land and
-- a `net._http_response` for the retention health view to select from.
create schema if not exists cron;
create or replace function cron.schedule(job_name text, schedule text, command text)
returns bigint language sql as $$ select 1::bigint $$;
create or replace function cron.unschedule(job_name text)
returns boolean language sql as $$ select true $$;
create schema if not exists net;
create table if not exists net._http_response (
  id bigserial primary key, status_code int, content text,
  error_msg text, created timestamptz default now()
);

create schema if not exists storage;
create table storage.buckets (
  id text primary key, name text, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text, owner uuid, metadata jsonb, created_at timestamptz default now()
);
create or replace function storage.foldername(p_name text) returns text[] language sql immutable as $$
  select (string_to_array(p_name, '/'))[1:array_length(string_to_array(p_name, '/'), 1) - 1];
$$;
SQL

failed=0
for file in "$ROOT"/supabase/migrations/[0-9]*.sql; do
  name="$(basename "$file")"
  if output=$(psql_run < "$file" 2>&1); then
    echo "  ok    $name"
  else
    echo "  FAIL  $name"
    echo "$output" | grep -E 'ERROR|LINE|DETAIL|HINT|CONTEXT' | head -8 | sed 's/^/        /'
    failed=1
    break
  fi
done

if [ "$failed" -eq 0 ]; then
  echo
  echo "All migrations applied cleanly."
else
  echo
  echo "Migration chain is broken. Fix before pushing to the remote project."
  exit 1
fi

# Anything reachable by `anon` is reachable by anyone holding the publishable
# key, so a new one is worth failing over. Extension functions are excluded —
# pgcrypto, pg_trgm, unaccent and uuid-ossp install into `public` carrying their
# own default grants, and revoking those is not this project's business.
#
# BASELINE is the set that is already granted and already understood:
#   auth_clinic_id, is_platform_admin  0021:117 keeps these deliberately — both
#                                      return null/false without a session, and
#                                      auth_clinic_id is called from inside RLS
#                                      policies that have no `to` clause, where
#                                      a missing EXECUTE turns an empty result
#                                      into a permission error.
#   approve_clinic_member, decline_clinic_member, list_patients,
#   match_patients, doctor_top_drugs   never revoked by 0017, which enumerated
#                                      its list by hand. All five fail closed —
#                                      the first two require an active owner,
#                                      the rest are SECURITY INVOKER and anon
#                                      holds no table grants — so this is a gap
#                                      in the stated policy rather than a hole.
#                                      0030 should close it.
BASELINE="approve_clinic_member auth_clinic_id decline_clinic_member doctor_top_drugs is_platform_admin list_patients match_patients"

granted=$("$ENGINE" exec -i "$CONTAINER" psql -U postgres -d docregister -tAq <<'SQL'
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
left join pg_depend d on d.objid = p.oid and d.deptype = 'e'
where n.nspname = 'public'
  and d.objid is null
  and has_function_privilege('anon', p.oid, 'execute')
order by p.proname;
SQL
)

new_leaks=""
for fn in $granted; do
  case " $BASELINE " in
    *" $fn "*) ;;
    *) new_leaks="$new_leaks $fn" ;;
  esac
done

if [ -n "$new_leaks" ]; then
  echo
  echo "New functions executable by anon:$new_leaks"
  echo "Add a revoke, or add it to BASELINE here with the reason."
  exit 1
fi
echo "No new function is executable by anon."

unpinned=$("$ENGINE" exec -i "$CONTAINER" psql -U postgres -d docregister -tAq <<'SQL'
select string_agg(p.proname, ', ' order by p.proname)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
left join pg_depend d on d.objid = p.oid and d.deptype = 'e'
where n.nspname = 'public'
  and d.objid is null
  and p.prokind = 'f'
  and (p.proconfig is null or not exists (
        select 1 from unnest(p.proconfig) c where c like 'search_path=%'));
SQL
)
if [ -n "$unpinned" ]; then
  echo
  echo "Functions with no search_path pin: $unpinned"
  echo "0021 explains why every one of these is a privilege-escalation surface."
  exit 1
fi
echo "Every function pins search_path."
