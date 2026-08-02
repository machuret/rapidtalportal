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

## Database types — generated snapshot + curated layer

- `types/schema.generated.ts` is the **tracked** output of `pnpm gen:types`
  (`supabase gen types typescript`). After migrations land, regenerate and
  commit the diff — the typed clients in `lib/supabase/` follow the live
  schema. (The old `types/database.generated.ts` slot stays gitignored for
  stale local copies.)
- `types/database.ts` derives `Database` from that snapshot and adds a small
  curated layer: JSONB columns narrowed to validated shapes
  (`sops.steps`, `company_dna.hard_rules`, …), trigger-filled columns optional
  on insert, CHECK-constraint status unions, nullable RPC args (Postgres
  params accept NULL; the generator can't express it), plus the `Db*` row
  aliases app code uses. Keep overrides minimal — generated types win unless
  existing code provably depends on a narrower shape.
- Because the client knows the real schema, `(db as any)` is a code smell:
  don't add casts for "missing" tables/columns — regenerate the snapshot. The
  casts that remain are dynamic update bags and JSONB boundaries.

## Conventions you must follow

- **Styling tokens only.** No arbitrary hex, no new inline styles, and **no new
  arbitrary design values** (`text-[13px]`, `p-[18px]`, `rounded-[10px]`, literal
  `rgba()` in classes) — `scripts/styles-guard.mjs` (`pnpm styles:check`) blocks
  them: undefined-var + arbitrary-hex are hard fails; raw-hex, inline-style and
  arbitrary-value are forward-only ratchets baselined in
  `scripts/styles-baseline.json` (clean a file, then `pnpm styles:baseline` to
  ratchet down). Use the zinc/token palette and the `text-xs…`/`rounded-lg`
  scale. Full architecture + migration playbook: **`docs/STYLING.md`**.
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

## Help videos & editable guides (super-admin managed)

Two super-admin surfaces under `/admin/tutorials` (migration 081, no RLS — read
server-side via the admin client, written via `withSuperAdmin` routes):

- **Feature tutorial videos** (`feature_videos`, keyed by the **PageIntro slug**).
  `lib/tutorials/server.ts` `getFeatureVideos()` loads them once in the portal
  layout; `FeatureVideosProvider` exposes them so **`PageIntro`** can show a
  "Video Tutorial" button (`components/help/*`) on any feature page — no per-page
  prop. The button label/slug set **is** `PAGE_INTROS`, so a new feature gets
  video support for free by giving its page a `<PageIntro id="…">`.
- **Editable Client/VA guides** (`guides`, one JSONB `{ intro, groups }` row per
  audience). `lib/guides/server.ts` `getGuideDoc('client'|'va')` resolves the
  admin-edited row **?? the code default** (`CLIENT_GUIDE`/`VA_GUIDE` are the seed
  + fallback), with the same 30s cache + `bustGuideCache` pattern as
  `lib/prompts/server.ts`. Each guide item can carry a `video` (Loom). Edit text
  in code **or** in the editor — the DB row wins once saved; "Reset to default"
  deletes the row.

Loom links are normalised by `lib/loom.ts` (share ↔ embed). Both surfaces go
live within ~30s of a save (cache TTL), no deploy.

## Shared modules — reuse, don't re-derive

- **Task/throughput metrics** live in `lib/tasks/metrics.ts` (`sumWorkHours`,
  `workHours`, `isOnTime`, `onTimePct`). Dashboard, supervision, reports, etc.
  all use these — don't reimplement on-time/hours math inline.
- **Admin CRUD data layer**: `hooks/useResource.ts` — generic React-Query
  collection (SSR-seeded, optimistic create/update/remove, rollback on error).
  Backs Leads and Expenses (Users is a custom flow and intentionally does
  not). `hooks/useCrudDialog.ts` holds the shared
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
  deployed by a `git push`. They're Deno (excluded from the Next tsconfig/lint);
  the `edge-functions` CI job `deno check`s them.
- **Node Brain surfaces are semantic too.** `lib/brain/resolver.ts` proxies
  gte-small embeddings through the `brain-embed` edge function (service-key
  auth, ~10s timeout) instead of falling back to lexical Vault retrieval.
  `brain-embed` is also a **manual deploy** (`pnpm functions:deploy brain-embed`);
  until it's live, Node degrades to lexical + a visible warning as before.
- **Ask-the-Vault has two modes:** concise (default) and `mode:"deep"` ("Go
  deeper" — stronger model, whole-section context, bigger budget). Models are
  env-configurable: `VAULT_ASK_MODEL` / `VAULT_DEEP_MODEL` (see `docs/runbook.md`).
  Don't confuse deep mode with `/api/vault/expand` ("Expanded View" — a separate
  whole-corpus strategic analysis stored in `vault_analyses`, not retrieval).
- Indexing is resumable (CPU-capped edge runtime drops big docs otherwise):
  `vault-index` cron runs every 15 min and processes in batches.
  `vault_items.indexed_at` / `index_error` track progress; surfaced on
  `/admin/health`.
- Dedup is a DB invariant (unique partial index on
  `vault_items(client_id, content_hash)`, migration 057).

## The Brain (the learning system)

The "Company Brain" is the loop that makes every AI surface get smarter from use.
Its official context contract is shared by Next and the Deno edge functions:
`lib/brain/context-contract.ts` is the parser/validator and
`supabase/functions/_shared/brain-context.ts` is the edge resolver. Keep their
resolver versions and invariants aligned.

- **Signals → memory → context.** Every 👍/👎 (`<BrainFeedback>` → `/api/brain/
  signals`, table `brain_signals`) is distilled (`lib/brain/distill.ts`, cron
  `/api/cron/brain-distill` + manual "Distill now") into curated lessons
  (`brain_memory`). Generation surfaces must call the official resolver and
  persist the exact result with `persistBrainContextSnapshot` before producing
  an answer. **There is no legacy context fallback** — do not re-derive profile,
  Vault, Library, memory or market context inline.
- **Library is a separate evidence boundary.** Company DNA, Vault and learned
  memory are company evidence and outrank generic Library guidance. Every
  Library statement carries entry, version and chunk provenance. Library
  retrieval reports `available`, `degraded`, `unavailable` or `not_requested`.
  When it fails, persist a valid snapshot with the visible warning
  "Library temporarily unavailable", answer from verified company context when
  possible, and expose a retry. Never fail silently or fabricate Library use.
- **Memory is self-correcting (migration 076).** Lessons have `scope`
  (surfaces), `status` (`proposed`|`active`|`muted`), an `embedding` (JSON) and
  `last_reinforced_at`. Distillation reinforces repeats, routes conflicts/rules/
  low-confidence to `proposed` (admin approval in `BrainMemoryPanel`), and decays
  stale lessons. `active` is kept in sync with `status` so readers (context,
  score, health) need no changes — **keep them in sync on any write**.
- **One canonical field list per concern, don't fork them:** `lib/brain/gaps.ts`
  (profile fields + onboarding questions), `score.ts` `PROFILE_FIELDS`
  (completeness), `context.ts` `PROFILE_FIELDS` (prompt). If you add a profile
  field, update the relevant ones deliberately.
- **Brain Score & journal.** `lib/brain/score.ts` computes a 0–100 score (shown
  on `/brain`); the cron snapshots it to `brain_score_history` (trend) and writes
  human-readable `brain_events` (the journal). Score/journal are derived — never
  the source of truth.
- **Surfaces are unified.** Official context surfaces include `ask`,
  `content_generate`, `content_quick_draft`, `content_pilot` and `diagnostic`.
  Legacy signal names are compatibility data only, not context fallbacks.
  Ask-the-Brain dual-writes feedback via `/api/vault/feedback`; outcomes via
  `/api/content/outcome` and the approval edit-distance check in
  `/api/content/pieces` PATCH.
- **Proactive opportunities are snapshot-backed.** The weekly
  `/api/cron/brain-opportunities` diagnostic and manual Brain-page run resolve
  official context, persist a required snapshot, and only then create
  `brain_opportunities`. Newly created rows notify the client's admins
  (in-app, href `/brain`) — zero new rows means zero notifications. State
  changes go through
  `transition_brain_opportunity`, which records the approval/outcome event and
  effectiveness. Opportunity queries and writes must remain client-scoped.
- **Grounded + self-critical generation** lives in the `content-generate` **edge
  function** (semantic retrieval via `match_vault_chunks` + a self-critique pass)
  — **redeploy it manually** after changes. `ai_original` (the AI's delivered
  draft) is captured in the `/api/content/generate` proxy so approval can measure
  how much a human rewrote it.
- **Env:** Next-side Brain **chat** (distillation, onboarding draft) runs on
  **`OPENROUTER_API_KEY` or `OPENAI_API_KEY`** — `lib/brain/llm.ts` `chatProvider()`
  prefers OpenRouter and normalises the model id (`gpt-4o-mini` → `openai/gpt-4o-mini`).
  **Embeddings** (`lib/brain/embed.ts`, `text-embedding-3-small`) are **OpenAI-only**
  — OpenRouter has no embeddings endpoint — and **optional**: without `OPENAI_API_KEY`,
  memory dedup/reinforce/contradiction and embedding fit are skipped, everything
  else works. Models: `BRAIN_DISTILL_MODEL`, `BRAIN_EMBED_MODEL`. The edge
  functions use `OPENROUTER_API_KEY`. `/admin/health` shows both rows.
- **Core migration ranges:** 070–077 (learning loop), 125–129 (official context
  and Library), 130 (`brain_diagnostic_runs`, `brain_opportunities`,
  `brain_opportunity_events`), 131 (outcome measurement integrity), and 132
  (official snapshotted Brain onboarding).

## Proactive Coach (draft-and-confirm)

The Coach can **initiate** — but everything it originates still requires a
human to confirm through the unchanged `/api/coach/actions` execution path.
`/api/cron/coach-proactive` (weekly, Mon 04:15) runs `lib/coach/proactive.ts`:
per client admin it resolves the official context (surface `diagnostic`,
actor = the target user), scans for deterministic triggers
(overdue/unassigned/due-this-week/review work), and only then drafts ONE
suggested action (`create_task`/`update_task`). Writes, in order: immutable
snapshot (`artifact_kind: coach_proactive`, `created_by` = the user) →
`coach_action_previews` row (server-authored, same as vault-ask) →
`coach_turns` row with `origin='proactive'` (migration 142) → notification.

Invariants you must not break:

- **Never invent IDs** — `validateDraftAgainstContext` drops any draft
  referencing team/task IDs the resolver didn't supply.
- **No noise** — zero triggers → zero writes; one proactive turn per owner
  per 7 days (origin-tagged dedupe).
- The quality gate (`evaluateCoachQuality` with `expectedClientId`) runs
  before any write, exactly like the interactive path.
- Model: `COACH_PROACTIVE_MODEL` (default gpt-4o-mini via the Brain chat
  provider chain).

## Coach mode router

When a Coach question arrives in the default `private` mode and the
client-side regex (`inferredCoachMode`) stays silent, the UI asks
`POST /api/coach/route-mode` (`lib/coach/route-mode.ts`) — a tiny classifier
(`COACH_ROUTER_MODEL`, temp 0) that suggests an action mode. It is advisory
only: validated against `coachActionDenial` in the route, re-enforced by the
edge function and DB at execution, and any failure degrades to a private
answer. All proxies validate `coachMode` against the single
`coachModeSchema` in `lib/brain/coach-action-policy.ts` — do not re-add local
enums.

## Cron

`vercel.json` defines crons (`/api/cron/tasks` daily, `/api/cron/vault-index`
every 15 min, `/api/cron/brain-distill`). Cron routes authenticate with a
`CRON_SECRET` Bearer token — set it in Vercel env. Heartbeats land in
`cron_heartbeats` (migration 059). Check-in notifications are LLM-generated
follow-ups (`COACH_CHECKIN_MODEL`, grounded in the commitment + linked goal +
recent progress events); generation failure falls back to the raw commitment
text (`deliver_coach_check_in`'s `p_message`, migration 143) so delivery never
depends on the model.

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
