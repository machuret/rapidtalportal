# CLAUDE.md — RapidTal portal

Working notes for any agent (or human) touching this codebase. These are the
**non-obvious invariants** that are easy to violate and expensive to get wrong.
Read this before making changes; keep it current when an invariant changes.

## What this is

A multi-tenant SaaS portal where **clients** and their **virtual assistants
(VAs)** collaborate, and **super-admins** run the business. Next.js 14 App
Router + Supabase (Postgres) + a few Supabase Edge Functions.

Roles (`users.role`): `super_admin`, `client_admin`, `va`. There is no
`client` role — the string `client` only appears in the Notebook `actor_role`
enum.

## Data access — the most important rule

There are two Supabase clients and the choice is a security boundary:

- **`lib/supabase/admin.ts` (`createAdminClient`)** — service role, **bypasses
  RLS**. Almost all reads use this and scope by `client_id` **in code**. Use it
  in server components / route handlers where you've already authorised the
  caller and are filtering by tenant yourself.
- **`lib/supabase/server.ts` (`createClient`)** — user-scoped, **RLS applies**.
- **`lib/supabase/client.ts`** — browser client.

⚠️ **Notebook is the exception**: it deliberately uses the *user-scoped* client
so that DB-level RLS enforces "admins cannot read Notebook content". Do **not**
"optimise" Notebook reads to the admin client — that would defeat the privacy
guarantee that admins have zero content access. Admins only ever see Notebook
*metadata* (page counts, last-activity), never titles/bodies.

## Migrations — single source of truth

- SQL lives in `db/migrations/NNN_name.sql`, numbered, applied in filename order.
- The ledger is the `schema_migrations` table. Each file self-records with
  `INSERT INTO schema_migrations ... ON CONFLICT DO NOTHING`.
- `lib/migrations/manifest.ts` mirrors the directory (the `.sql` files aren't
  bundled into serverless functions). A unit test
  (`__tests__/migrations-manifest.test.ts`) fails if it drifts from the dir —
  **add new files to both**.
- `/admin/health` diffs the manifest against the live DB to surface drift.
- Runner: `pnpm db:status | db:baseline | db:apply` (needs `SUPABASE_DB_URL`).
- **History lesson**: migrations 018–023 were never applied for weeks, silently
  degrading vault search. Never hand-apply and forget — use the runner and
  check `/admin/health`.

## Conventions you must follow

- **Styling tokens only.** No arbitrary hex, no new inline styles —
  `scripts/styles-guard.mjs` (`pnpm styles:check`) blocks them. Use the
  zinc/token palette already in use.
- **API routes**: prefer the `withAuth` / `withSuperAdmin` wrappers in
  `lib/api/with-auth.ts` (they centralise auth, role checks, and error capture).
  Many older routes call `requireApiAuth` directly — fine, but new routes should
  use the wrappers. Validate input with Zod.
- **Client → API calls** go through `lib/api-client.ts` (`api.get/post/patch/
  delete`). It owns the error toast (`showErrorToast` defaults to true), so
  callers should **not** double-toast errors — only success toasts.
- **Route paths** come from the typed `ROUTES` registry (`lib/api/routes.ts`),
  not string literals.
- **Server auth guards**: `getCurrentUserAndClient`, `requireSuperAdmin`,
  `requireClientAdmin` (in `lib/auth.ts`) — redirect-based, for pages.
- **Pages are `force-dynamic`** by default; that's why placeholder Supabase env
  vars are enough to build in CI.

## Shared modules — reuse, don't re-derive

- **Task/throughput metrics** live in `lib/tasks/metrics.ts` (`sumWorkHours`,
  `workHours`, `isOnTime`, `onTimePct`). Dashboard, supervision, reports, etc.
  all use these — don't reimplement on-time/hours math inline.
- **Admin CRUD data layer**: `lib/hooks/useResource.ts` — generic React-Query
  collection (SSR-seeded, optimistic create/update/remove, rollback on error).
  Backs Users, Leads, Expenses. `lib/hooks/useCrudDialog.ts` holds the shared
  save/archive/busy plumbing for edit dialogs. (AdminPlacements and
  PromptsManager intentionally don't use these — they're server-refresh and
  slug-keyed-override shapes, not id-CRUD lists.)
- **Error tracking**: `lib/error-tracking.ts` `captureError()` → `app_errors`
  table → `/admin/errors`. Never throws, rate-capped. React error boundaries
  (`app/global-error.tsx`, `app/(portal)/error.tsx`) report via
  `lib/report-client-error.ts`.

## Vault / RAG (the search + AI-answer pipeline)

- Embeddings: `gte-small` (384-dim), pgvector. Full-text search via
  trigger-maintained `tsvector` columns (see migration 058).
- Edge functions `supabase/functions/vault-ask` and `vault-process` must be
  **deployed manually** (`supabase functions deploy …`) — they are *not*
  deployed by a `git push`.
- Indexing is resumable (CPU-capped edge runtime drops big docs otherwise):
  `vault-index` cron runs every 15 min and processes in batches.
  `vault_items.indexed_at` / `index_error` track progress; surfaced on
  `/admin/health`.
- Dedup is a DB invariant (unique partial index on
  `vault_items(client_id, content_hash)`, migration 057).

## Cron

`vercel.json` defines crons (`/api/cron/tasks` daily, `/api/cron/vault-index`
every 15 min). Cron routes authenticate with a `CRON_SECRET` Bearer token —
set it in Vercel env. Heartbeats land in `cron_heartbeats` (migration 059).

## Validation gates (run before every commit)

```
npx tsc --noEmit
npx next lint
node scripts/styles-guard.mjs      # or: pnpm styles:check
npx jest                           # or: pnpm test
pnpm build                         # placeholder Supabase env is fine
```

CI (`.github/workflows/ci.yml`) runs all of these on push/PR.

## Git workflow in this environment

Develop on the assigned feature branch, commit with clear messages, then
fast-forward `main` (`git push origin <branch>:main`). Do **not** open a PR
unless explicitly asked.
