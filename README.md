# RapidTal Portal

Multi-tenant SaaS portal where **clients** and their **virtual assistants
(VAs)** collaborate, and super-admins run the business. Lives at
[rapidtal.online](https://rapidtal.online).

## Stack

- **Next.js 15** (App Router) + React 18 + TypeScript, deployed on Vercel
- **Supabase** (Postgres + Auth + Storage + Realtime) with 140+ SQL migrations
- **Deno edge functions** (`supabase/functions/`) for the Vault/RAG and content
  pipelines — deployed manually, not via `git push`
- Tailwind + design tokens (enforced by `scripts/styles-guard.mjs`)
- Jest + React Testing Library, Playwright for e2e

## Read first

- **`CLAUDE.md`** — the non-obvious invariants (data-access rules, migrations
  discipline, conventions). Required reading before changing anything.
- **`docs/runbook.md`** — environment variables, migrations runner, edge
  function deploys, cron, and other manual operations.

## Develop

```bash
pnpm install
pnpm dev
```

Needs `.env.local` with at least `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` — see the full
reference in `docs/runbook.md` §0.

## Validation gates (run before every commit)

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm styles:check
pnpm test
pnpm build
```

CI (`.github/workflows/ci.yml`) runs all of these plus a Deno type-check of the
edge functions on every push/PR.

## Common operations

```bash
pnpm db:status / db:apply      # migration ledger + runner (needs SUPABASE_DB_URL)
pnpm functions:deploy          # deploy edge functions to Supabase
pnpm test:coverage             # jest with the coverage ratchet
pnpm audit:prod                # production dependency audit
```
