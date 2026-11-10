# Clerk authentication

Clerk handles account creation, sign-in, session refresh, profile controls, and
sign-out. Supabase remains the database and private storage provider. Clinical
requests use Clerk's session JWT and the Supabase publishable key, so Row Level
Security still governs every patient query and clinical workflow.

## Configuration

1. Run `clerk auth login`, then
   `clerk init --app app_3IxoXlaJOkQEfY1sHt5eDDauIsW` from the project root.
   The CLI writes the application keys without requiring manual copying.
2. Enable Clerk's Supabase integration. The session token must include
   `"role": "authenticated"`. In this project's development instance, the CLI
   configures that claim directly through `session.claims`.
3. In the hosted Supabase project's **Authentication → Sign In / Providers**,
   add Clerk as a third-party provider using the linked Clerk instance's domain.
   See the [official integration guide](https://clerk.com/docs/guides/development/integrations/databases/supabase).
4. Apply migrations through `0040_clerk_auth.sql` before starting the updated
   application against that database. The local demo and the hosted Mumbai
   project `clwbqxxffhvaswbgfanf` have the complete migration chain, including
   this migration. The hosted project starts with a fresh clinic database.
5. Give the transcription process `CLERK_SECRET_KEY` and set
   `CLERK_AUTHORIZED_PARTIES` to the web app's permitted origins. Clerk sign-in
   must use the same development or production instance on both processes.
6. Run `clerk doctor` and `npm run dev`.

The existing clinic membership system handles practice ownership and approvals,
so the development Clerk instance allows personal accounts instead of requiring
a separate Clerk organization before clinic setup. Clerk organization membership
does not grant clinical access.

## Account and data flow

`/sign-in` and `/sign-up` contain Clerk's prebuilt controls with the shadcn theme.
A new account continues to `/onboarding`, where it enters the doctor's name and
clinic name. The first member creates a clinic; matching an existing clinic name
creates a pending membership that its owner must approve.

An existing doctor can retain their UUID and all associated clinical records
by signing in with a verified Clerk primary email matching a verified, unclaimed
legacy account. Linking is serialized and cannot transfer an already linked
doctor to a different Clerk identity. User-editable metadata never selects a
clinic, role, or doctor ID.

`current_doctor_id()` maps the verified Clerk session subject to the existing
doctor UUID. Migration 0040 rebinds the existing policies and workflows to that
helper, preserving their role checks and tenant boundaries. Supabase's managed
`auth.uid()` is unchanged. New database code must use `current_doctor_id()`.
Pending Clerk sessions and tokens without a session ID resolve to no doctor.
Clinical HTTP handlers and live transcription also require active clinic
membership before using provider quota or processing patient information.

The service-role key is used only to provision a verified account and for the
pre-existing maintenance workflow. Clinical queries never use it. Direct identity
updates and the provisioning RPC are unavailable to ordinary users.

The old `/login` URL redirects to Clerk. Old magic-link callbacks go to the new
sign-in screen. `/api/auth/test-login` returns 410; its former access-code helpers
have been removed. Existing Supabase browser sessions no longer authenticate app
requests. Doctor records are retained when a Clerk account is deleted so clinical
history and audit references remain stable.

The local demo runs at `http://docregister.localhost:3100`, with its database API
on port 54322. This avoids other projects using ports 3000/3001 and isolates
browser sessions from apps on `localhost`. Its old GoTrue and mail services are
stopped, and the demo gateway rejects `/auth/v1/*` with 410. Supabase remains the
database and storage provider; the legacy identity table is retained only for
safe account migration and historical references.

The sign-in panel displays loading and retry states while Clerk initializes.
When OAuth completes in the browser, an active session triggers a full
navigation so the server receives the new session before opening the workspace.

## Verification

The Playwright suite uses `@clerk/testing` and a designated
`E2E_DOCTOR_EMAIL` in a **development** Clerk instance. Sign-up tests use
`+clerk_test` addresses and the development verification code, without delivering
email. The auth tests cover sign-up, clinic setup, sign-out, session reload, and
unauthenticated API denial. Existing workspace fixtures now authenticate through
Clerk as well.
The approval test checks clinical API rejection for pending members. Set
`E2E_STT_URL=ws://localhost:8787` with the voice proxy running to also verify
that pending members cannot open a transcription stream.

Run `supabase/tests/clerk_auth.sql` against a migrated local database with
`psql -v ON_ERROR_STOP=1`. It rolls back its fixtures and checks isolation,
pending memberships, identity tampering, and rejection of legacy/non-session
tokens. `scripts/validate-migrations.sh` also validates the complete schema chain.

The local demo's PostgREST service trusts the linked development instance's
public JWKS. Refresh that configuration if Clerk rotates its signing keys.
Hosted Supabase manages Clerk signing-key discovery through the configured
third-party provider. The current hosted testing setup uses the same Clerk
development instance as the local app. Switch to production Clerk keys and
update the Supabase third-party provider together when moving to a production
Clerk instance.
