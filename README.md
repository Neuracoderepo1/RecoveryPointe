# RecoveryPointe

Ghana-first guidance for people who lost money to fraud: record the incident, store evidence privately, see recommended next steps and track the case.
It does not guarantee recovery, give legal or financial advice, access any account or system, or ask for passwords, OTPs, seed phrases, private keys or remote access.

## Architecture
Static site (`index.html`, `app.js`) + dedicated Supabase project `pxyopsongbyumjqmgkfo` (not shared with any other product).
Only the project URL and publishable key are in the client. Never add a service-role key to this repo.

## Database
- `profiles` (created by the `handle_new_user` auth trigger), `cases`, `case_events`, `case_evidence`, private bucket `case-evidence`.
- Cases are created only through RPC `create_case` (ownership from `auth.uid()`, server validation, server-generated `RP-YYYY-XXXXXXXX` number, idempotent via `client_request_id`, deterministic Ghana-first assessment in `rp_assess`).
- Users have read-only access to `cases` and `case_events`; no direct insert/update/delete, so status and assessment cannot be altered by victims.
- Evidence: insert/delete own rows only, path must be `{user_id}/{case_id}/...`, 10 MB max, PDF/PNG/JPEG/WebP/TXT/CSV only; audit events written by trigger.
- `add_case_reference` RPC records report/reference notes as events.
- Trigger/helper functions are not executable by API roles. `create_case` and `add_case_reference` are intentionally SECURITY DEFINER and executable by `authenticated` only.

## Auth
Supabase Auth email/password. Sign-up assumes email confirmation is ON (no session until confirmed). Password reset never reveals whether an email exists. The Supabase SDK keeps its own session token in browser storage; no cases or credentials are stored locally.
Dashboard settings to confirm: Auth > Email confirmations ON, Site URL and Redirect URLs set to the production URL.

## Run locally
`npx serve .` then open the printed URL (add it to Auth Redirect URLs).

## Deploy
Any static host. `vercel.json` sets CSP and security headers (CSP allows only this site, jsDelivr for supabase-js, and the Supabase project URL).

## Tests
`tests/rls_smoke.sql` — run in the Supabase SQL editor; it rolls back and reports results (duplicate submit, validation, cross-user isolation, blocked direct writes).

## Support contact
Set in the privacy notice (`app.js`, `Views.privacy`).
