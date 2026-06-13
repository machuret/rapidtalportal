# Operational runbook — RapidTal

The recurring manual operations, written down once so they stop being
rediscovered. For architecture/invariants see `CLAUDE.md`.

---

## 1. Apply database migrations

New SQL lands in `db/migrations/NNN_name.sql`. To apply to an environment you
need its Postgres connection string: **Supabase → Project Settings → Database →
Connection string (URI)**.

```bash
export SUPABASE_DB_URL='postgres://...'   # the URI from Supabase

pnpm db:status      # list applied vs PENDING (read-only — always run first)
pnpm db:apply       # run all pending files, in order, each in its own txn
```

- `db:apply` stops at the first failure (later files often depend on earlier
  ones). Fix the file, re-run.
- `db:baseline` — **one-time only** on a DB whose schema was built by hand:
  marks all current files as applied *without running them*. After that, only
  new files are ever applied.
- Alternatively, paste a file's SQL into the Supabase SQL editor. Every
  migration is idempotent and self-records, so this is safe — but `db:apply` is
  preferred because it keeps the ledger honest.

Verify afterwards at **`/admin/health`** (drift between the manifest and the
live DB shows there).

## 2. Deploy the Edge Functions (vault search / indexing)

These are **not** deployed by `git push` — they must be pushed to Supabase:

```bash
supabase functions deploy vault-ask
supabase functions deploy vault-process
```

Their secrets (OpenAI/Anthropic keys, etc.) live in Supabase function env, not
Vercel. After deploying, confirm `vault_items.indexed_at` starts advancing.

## 3. Backfill / repair vault embeddings

Indexing is resumable and cron-driven (`/api/cron/vault-index`, every 15 min),
so normally it self-heals. To force progress or diagnose:

- Check `/admin/health` for `index_error` counts and last cron heartbeat.
- Re-process a single item from the Vault UI (reprocess action) or via
  `/api/vault/[id]/reprocess`.
- Big documents are processed in batches across cron runs — a doc going from a
  few chunks to fully indexed over several 15-min cycles is expected, not a bug.

## 4. CRON_SECRET (cron authentication)

Cron routes reject requests without the right `Authorization: Bearer
<CRON_SECRET>`. Set `CRON_SECRET` in **Vercel → Project → Settings →
Environment Variables** (Production + Preview), then redeploy. Vercel's cron
scheduler injects it automatically for the scheduled invocations defined in
`vercel.json`.

## 5. Force the canonical domain

`rapidtal.online` is canonical; `rapidtalportal.vercel.app` is redirected to it
in `middleware.ts` (the matcher excludes `/api` so the redirect can't turn
same-origin API calls into cross-origin 308s — that previously caused
"Failed to fetch"). If the canonical host changes, update it there.

## 6. Reading the health dashboard

`/admin/health` (super-admin) surfaces: migration drift, vault index progress /
errors, and the latest cron heartbeats. It's the first place to look when
"search is weird", "the cron didn't run", or "did that migration land?".

## 7. Where errors go

Server + client errors are captured to the `app_errors` table and shown at
**`/admin/errors`**. API routes wrapped with `withAuth`/`withSuperAdmin` report
automatically; React render crashes report via the error boundaries. No
external error vendor is wired in (swap `captureError`'s body for Sentry if that
changes).
