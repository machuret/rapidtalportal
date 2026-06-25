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

These are **not** deployed by `git push` — they must be pushed to Supabase.
Use the helper, which deploys **every** function under `supabase/functions/` so
none get silently forgotten after a change:

```bash
pnpm functions:deploy                # all functions (vault-ask, vault-process,
                                     # content-generate, kb-generate, send-message,
                                     # vault-delete, company-dna-scrape)
pnpm functions:deploy vault-ask      # just one (or a few, space-separated)
```

Requires the Supabase CLI (`supabase login` + `supabase link`, or set
`SUPABASE_PROJECT_REF`). Under the hood each is `supabase functions deploy <name>`.

Their secrets (OpenAI/Anthropic keys, etc.) live in Supabase function env, not
Vercel. After deploying, confirm `vault_items.indexed_at` starts advancing.

**Ask-the-Vault models (optional env, set in Supabase function env):**

- `VAULT_ASK_MODEL` — concise answers. Default `openai/gpt-4o-mini`.
- `VAULT_DEEP_MODEL` — "Go deeper" answers. Default `openai/gpt-4o`. Changing it
  needs a `vault-ask` redeploy.
- `VAULT_EXPAND_MODEL` — Expanded View strategic analysis. Default `openai/gpt-4o`.
  Vercel env var (the `/api/vault/expand` route, not an edge function), so it
  takes effect on the next deploy — no `supabase functions deploy` needed.
- `SOP_MODEL` — full-SOP generation. Default `openai/gpt-4o`
  (`SOP_SUGGEST_MODEL`, the angle suggestions, defaults to `openai/gpt-4o-mini`).
  Vercel env, live on deploy.

> ⚠️ Defaults are OpenAI models because `anthropic/claude-3.5-sonnet` returns
> "No endpoints found" on this OpenRouter account. Only point any of these at an
> Anthropic slug once you've confirmed your OpenRouter key has Anthropic access
> and the exact current slug.
- `VAULT_PROCESS_MODEL` — per-document summary/tagging (`vault-process` edge
  function). Default `openai/gpt-4o-mini`. Supabase function env; needs a
  `vault-process` redeploy. The prompt is also admin-editable at `/admin/prompts`
  (slug `vault.process`). Existing documents keep their old summary until
  reprocessed — use "re-run AI" in the Vault, or they refresh on next rebuild.

## 2b. Email (Resend)

Transactional email goes through Resend (`lib/email.ts` → `sendEmail`). It's
env-gated: with no key set, sends are skipped and the app works as before (the
sign-in-link UI still shows the copyable link). To enable:

1. **Verify the sending domain** (`rapidtal.online`) in the Resend dashboard —
   add the DNS records they give you. Until the domain is verified, Resend only
   lets you send to your own account email.
2. Set in **Vercel** env (Production + Preview):
   - `RESEND_API_KEY` — from the Resend dashboard. **Never commit it / paste it
     in chat** — env only.
   - `RESEND_FROM` *(optional)* — sender, default `RapidTal <noreply@rapidtal.online>`
     (must be on the verified domain).
3. Redeploy. `emailConfigured()` flips on and, e.g., the admin "send login link"
   action emails the magic link (still returns it as a copy/paste fallback).

`sendEmail` never throws — a provider hiccup is logged and returns `{ ok:false }`
without breaking the action that triggered it.

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

## 8. Pre-launch security hardening (manual steps)

The Phase 1–6 hardening landed in code, but four steps must be done **by hand**
in a dashboard or a one-time deploy — a `git push` cannot do them. Each is
independent.

### 8.1 Apply migration 082 (health page tallies) — DB

`/admin/health` aggregates per-client vault tallies via the `health_vault_tallies()`
function (migration `082`). Until applied, the per-client table shows zeros and
082 is flagged as pending.

- Preferred: `SUPABASE_DB_URL='postgres://...' pnpm db:apply` (see §1).
- No terminal: paste the contents of `db/migrations/082_health_vault_tallies.sql`
  into the Supabase **SQL Editor** and Run. It self-records into
  `schema_migrations`, so it won't re-flag.

Verify: `/admin/health` shows real counts and 082 is no longer pending.

### 8.2 Deploy the edge functions for the CORS change — CLI

The 7 edge functions had wildcard CORS (`Access-Control-Allow-Origin: *`); they
now read `ALLOWED_ORIGIN` (default `https://rapidtal.online`). The code change is
**inert until redeployed**.

```bash
supabase secrets set ALLOWED_ORIGIN=https://rapidtal.online   # dashboard works too
pnpm functions:deploy                                         # all 7 (see §2)
```

- `ALLOWED_ORIGIN` can also be set in the dashboard: **Edge Functions → Secrets**.
- Not browser-exploitable today (functions are JWT-gated + server-proxied), so
  this is hardening, not a launch blocker — but redeploy when a teammate has CLI.
- Multiple browser origins (e.g. Vercel previews): the functions currently accept
  one origin. Extend them to read a comma list if previews call functions directly.

Verify: a cross-origin OPTIONS preflight to a function no longer echoes `*`.

### 8.3 Content-Security-Policy: validate, then enforce — browser + 1-line code

CSP ships as **`Content-Security-Policy-Report-Only`** in `next.config.mjs` (it
logs violations without blocking). Do not flip to enforce blind.

1. On the deployed site, open DevTools → **Console** and click through dashboard,
   vault, tasks, notebook, daily-log/analytics (charts), a Loom "Video Tutorial"
   button, and login. Look for `[Report Only] … Content Security Policy` messages.
2. Zero violations → flip the header key in `next.config.mjs`:
   `Content-Security-Policy-Report-Only` → `Content-Security-Policy`, deploy.
3. Violations → add the blocked origin to the right directive (`img-src`,
   `connect-src`, `frame-src`, …) first, then enforce.

Allowed today: `self`, the Supabase origin (REST + `wss` + storage images),
Loom frames, `data:`/`blob:` images, inline styles/scripts (Next bootstrap).

### 8.4 Login brute-force protection — Supabase dashboard

Login is client-side direct-to-Supabase, so the real control is GoTrue's
server-side settings (an app-side counter would be bypassable). In the dashboard:

- **Authentication → Rate Limits** — keep sign-in limits enabled.
- **Authentication → Attack Protection** — enable **CAPTCHA** (hCaptcha/Turnstile).
  After enabling, wire the token into `app/login/page.tsx` (`signInWithPassword`'s
  `options.captchaToken`).
- **Authentication → password policy** — minimum length **≥ 8** (matches the
  reset-password flow's client check).

Verify: ~10 rapid bad logins get throttled/challenged; a full password-reset
round-trip (`/forgot-password` → email → `/reset-password` → sign in) works.
