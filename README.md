# Climbing Coach V2

React + TypeScript frontend for the second generation of Climbing Coach. The production path is now an additive in-place evolution of V1, protected by private snapshots and reconciliation gates.

## Local app

```bash
pnpm install
pnpm dev
```

Without environment variables the app starts in an explicit, non-persistent demo mode. To connect a Supabase project, copy `.env.example` to `.env.local` and provide only the project URL and publishable key. Set `VITE_BACKEND_SCHEMA=legacy-v1` while the React frontend uses the existing V1 model; use `workspace-v2` only for the separate foundations environment.

## Account access

Existing V1 users sign in with their registered email as username. Users created through passwordless access can open **Account e sicurezza** once, set a password with at least eight characters including a letter and a number, and then sign in from any device with email and password. The magic link remains available only as a bootstrap/recovery option. Setting a password updates the existing Supabase Auth identity and does not create or migrate profile, workout, exercise-log or test records.

## Quality gate

```bash
pnpm check
```

This runs lint, TypeScript, unit/migration tests and the production build.

## Local Supabase

Docker is required by the Supabase CLI.

```bash
pnpm db:start
pnpm db:reset
pnpm db:test
```

The first migration implements phases 3–4: profiles, workspaces, memberships, invitation acceptance, explicit grants and RLS. `complete_onboarding` is the only onboarding write entry point and is atomic and idempotent.

With the repository linked to a disposable Supabase development project, the remote smoke test creates two temporary users, exercises login, onboarding, invitation acceptance and RLS, then removes its fixtures:

```bash
pnpm test:remote:onboarding
```

The script obtains its server credential from the authenticated Supabase CLI process and keeps it only in server-side memory. It never writes that credential to a file or sends it to the frontend.

Before changing an existing Supabase project, create a private JSON snapshot of `auth`, `public` and Storage metadata:

```bash
pnpm snapshot:supabase <project-ref>
```

Snapshots are written under the Git-ignored `migration/private/` directory. The command stores no row contents in terminal output, verifies SHA-256 checksums after writing, repeats table counts to detect concurrent writes and stops if Storage contains payloads that require a separate byte-for-byte export.

Verify a private snapshot again before and after every database change:

```bash
pnpm snapshot:verify migration/private/<snapshot-directory>
```

## Offline session writes

The V1 runner writes with the authenticated athlete identity and never overwrites an exercise log that is already complete. Network-only failures are stored in IndexedDB using a deterministic user/session/exercise key. The queue replays on login, when the browser returns online, or from the sync control; an item is removed only after Supabase confirms it. RLS or validation errors remain visible and are never disguised as offline success.

## Coach dashboard and invitations

The coach dashboard reads the V1 relationships, active programs, weeks, sessions, logs and tests through the signed-in coach's RLS scope. No portfolio metric is hard-coded when the legacy backend is connected.

Coaches can invite an athlete by email, revoke a pending invitation, suspend/reactivate a relationship, or remove the relationship after an explicit confirmation. Removing an athlete deletes only the coach-athlete link: the account, programs, completed training, exercise logs and test history stay in the database. Athlete detail links preserve the selected athlete when opening their Program Builder or test analytics. Invitation acceptance uses `complete_invited_athlete_onboarding`, a `SECURITY INVOKER` Postgres function that atomically completes the profile and accepts the email-bound invitation; the existing trigger then creates the coach-athlete relationship.

## Program builder

The live builder reads the coach's active athletes, programs, weeks, sessions, session exercises and exercise library through the existing V1 RLS policies. A coach can create a draft, grow it one week and session at a time, add a library or ad-hoc exercise, edit its prescription and publish only after the structure is complete. No builder action deletes completed training or test history; publishing archives the prior active plan while preserving it for consultation.

## Exercise library

The coach-owned exercise catalog supports search, category and status filters, reusable default prescriptions, usage counts and editing. New removals are permanent and always require an explicit confirmation; `session_exercises.exercise_id` uses `ON DELETE SET NULL`, so session copies and completed logs retain their name, prescription and history. Previously archived entries remain visible through the legacy archive filter and can be restored or deleted.

## Navigation and active sessions

The last authorized app view and selected coach athlete are stored per user on the device, so a refresh returns to the same working context instead of the role's initial dashboard. During an active workout the session runner requests a Screen Wake Lock, releases it when the session closes or the view unmounts, and reacquires it when the app becomes visible again. The UI always shows whether the lock is active, unsupported or blocked by the device.

The athlete runner presents the full workout on one page, including every exercise description. Repeated sets with the same prescription are condensed into one summary; progressions with different loads keep a distinct row for every prescribed series. The athlete records one final outcome for the whole session: completed, or not completed with the omitted exercises explicitly selected. Only performed exercises are added to the immutable exercise history, while the session stores the final outcome and the omitted names.

## Tests, retests and analytics

Coaches can record immutable test sessions for active athletes; athletes can also record their own sessions under the existing V1 RLS policies. Each session stores the date, body weight, protocol, setup and notes, with one or more side-aware results. If result creation fails, the newly created empty session is rolled back while all pre-existing history remains untouched.

Each row in the test history can also be deleted after an explicit confirmation. Deleting a test session removes only that dated measurement and its child results through the existing `ON DELETE CASCADE` constraint; the athlete, workouts and every other test remain unchanged. The screen then reloads the source data and recalculates trends and comparisons.

Analytics group measurements by metric, side, grip and unit. Deltas are calculated only when protocol version and setup also match; incompatible results remain visible with a clear reason rather than producing a misleading comparison. The screen calculates percentage change, body-weight ratio, trends and left/right asymmetry from live records.

## Security boundary

- Authorization is derived from `auth.uid()` and database membership, never editable user metadata.
- The browser receives only a publishable key; secret and `service_role` keys are forbidden.
- Direct anonymous table access is revoked.
- V1 upgrades run server-side as additive, versioned migrations; protected records are reconciled against the private snapshot before the next step.
