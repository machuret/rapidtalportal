# RapidTal Portal — Per-Feature Audit & Product Scorecard (June 2026)

**Lens:** CTO / product-portfolio review (not code style).
**Method:** Full route map (49 pages, ~24 API domains, 77 migrations, 28 test files) + four grounded code deep-dives. Every feature below was read at the page + route + lib level.
**Scale (1–10):** 9–10 production-grade & differentiated · 7–8 solid, shippable, minor gaps · 5–6 functional MVP, real gaps · 3–4 half-built/thin · 1–2 stub.
**Each entry:** What it does · Bigger-picture role · Score · Gaps · Actions to raise it · Predicted score after actions.

> Companion docs: `AUDIT-2026-06.md` (code quality), `VAULT-AUDIT.md` (RAG internals).

**Overall platform maturity: 6.6 / 10.** Broader and better-engineered than its stage suggests; the differentiator (Vault→Brain learning loop) is the least *validated* part, and one table-stakes feature (Messages) is unfinished.

---

# PART A — ADMIN (super_admin) FEATURES

### A1. Admin Overview (`/admin`)
- **What:** Per-client health board — vault/task/activity stats, onboarding flags, "needs attention" sort, 24h error count, quick-action links (Feed Vault, Ask as Client, Supervision).
- **Bigger picture:** The super-admin's cockpit and the entry point into every tenant; the attention-score routing is what makes a 1-person agency able to run N clients.
- **Score: 9/10** — Postgres RPC (`admin_client_overview`) does aggregation in-DB (scales as data grows), attention-needing clients float up, helpful empty state.
- **Gaps:** Assumes the RPC exists with no fallback; 24h window is a magic number; no trend (today vs last week).
- **Actions:** Add a fallback path if RPC missing; surface a 7-day delta per client; make flags clickable filters.
- **Predicted: 9.5/10.**

### A2. Clients (`/admin/clients`, `/admin/clients/[id]`)
- **What:** CRUD over tenants with user counts, an onboarding checklist (admin added → VA assigned → vault fed → dossier → DNA → golden questions), and delete with cascading auth cleanup.
- **Bigger picture:** Tenant is the top-level isolation unit; everything else hangs off `client_id`. The onboarding checklist is the activation funnel.
- **Score: 8/10** — Zod + slug-conflict 409, atomic cascade with logged rollback, real onboarding guidance.
- **Gaps:** Hard-delete only (no soft-delete/restore), orphaned auth users only logged on failure, no pagination, `as any` casts.
- **Actions:** Add soft-delete + 30-day restore; a reconciliation job for orphaned auth users; convert checklist into a guided wizard with completion %.
- **Predicted: 9/10.**

### A3. All Users (`/admin/users`)
- **What:** Cross-tenant user lifecycle — invite, inline edit (email/role/client), suspend/reinstate, delete, magic login-link, force password reset.
- **Bigger picture:** The identity backbone; every auth decision downstream trusts `users.role`/`client_id` set here. Last-admin lockout guards protect the whole platform from being bricked.
- **Score: 9/10** — Atomic auth↔`public.users` sync with rollback, last-super-admin guards on demote/delete/suspend, SMTP-less fallbacks (returns link/password inline).
- **Gaps:** Hard-delete only; identity-cache invalidation relies on TTL; no bulk actions; no audit log of role changes.
- **Actions:** Add a `user_audit` trail for role/client/suspend changes; bulk invite (CSV); explicit cache-bust on role change.
- **Predicted: 9.5/10.**

### A4. Impersonation (`/api/admin/impersonate`)
- **What:** Super-admin assumes a user's session via cookie; only honored when the real user is super_admin.
- **Bigger picture:** Critical support/debug tool and a privileged path — the #1 thing to get right security-wise.
- **Score: 7/10** — Escalation-safe (real-role checked, not the impersonated one), tested in `roles.test.ts`.
- **Gaps:** **No audit log of who impersonated whom, when** — this is a compliance gap, not a feature gap; no visible "you are impersonating X" banner guarantee; no time-box on the impersonation.
- **Actions:** Log every impersonation start/stop to an immutable table; force a persistent banner; auto-expire after N minutes.
- **Predicted: 9/10.**

### A5. Leads (`/admin/leads`)
- **What:** Internal sales pipeline — kanban with drag-reorder, 6 stages, stage-change audit to `lead_events`, soft-archive, owner assignment.
- **Bigger picture:** RapidTal's *own* growth engine (RLS hides it from clients/VAs). Disconnected from the rest of the product (a lead never auto-becomes a Client).
- **Score: 8/10** — Strict enum/date/value Zod guards, audit trail, sort-order preserved.
- **Gaps:** 2000-row cap is not real pagination; "won" lead → Client tenant is fully manual; no lead source/attribution.
- **Actions:** "Convert to Client" button that seeds A2's onboarding; server-side pagination/filter; capture source + value forecast.
- **Predicted: 9/10.**

### A6. Expenses (`/admin/expenses`)
- **What:** Internal cost/subscription tracker — recurring + one-off, multi-currency, cadence/status, soft-archive.
- **Bigger picture:** Back-office bookkeeping; pairs with Leads to give the agency a P&L view — but the two never meet (no margin/runway calc).
- **Score: 7/10** — Clean CRUD, cadence enum, currency code, amount caps; cadence math unit-tested (`expenses-cadence.test.ts`).
- **Gaps:** No currency conversion (mixed-currency totals are meaningless); no monthly-burn rollup; 2000-row cap.
- **Actions:** Add FX normalization to a base currency; a "monthly burn / annualized" summary; tie to Leads for a simple margin view.
- **Predicted: 8/10.**

### A7. Placements (`/admin/placements`)
- **What:** Creates/toggles a VA⇄client engagement; `status=active` is what RLS checks to grant Notebook access; auto-seeds a starter Notebook from templates on creation.
- **Bigger picture:** The join-table that *activates* a working relationship — the hinge between "user exists" and "user can collaborate." Pausing it instantly revokes shared access.
- **Score: 8/10** — Validates both users' roles/tenancy, unique-pair guard, idempotent seed, admin sees only metadata (never Notebook content).
- **Gaps:** Seed side-effect (`seedPlacementNotebook`) is unguarded — silent partial seed if it fails; no end-date/history; hard-delete.
- **Actions:** Wrap seeding in a status flag + retry; record placement history (started/paused/ended timeline); surface seed failures on Health.
- **Predicted: 9/10.**

### A8. AI Prompts (`/admin/prompts`)
- **What:** Live editor for every system prompt — override code defaults, `[[variable]]` validation, version snapshots, reset-to-default, 30s cache.
- **Bigger picture:** The control panel for the *entire* AI surface (Vault, Tools, Brain, Content all read from here). Lets non-deploy prompt tuning — powerful and risky.
- **Score: 8/10** — Unknown-variable 422 with allow-list, cache-bust on write, snapshot on every change, smart "save default = delete override."
- **Gaps:** Version history is captured but **read-only — no rollback/diff UI**; no preview/test-run before save; 30s cache can diverge from code expectations.
- **Actions:** Add diff + one-click rollback; a "test this prompt" sandbox; show which features consume each prompt.
- **Predicted: 9/10.**

### A9. SOP Library — global (`/admin/sops`)
- **What:** Curates platform-wide SOPs (WordPress, Shopify, etc.) shared to all VAs; adoption stats (runs, completions, unique users); VA-restriction picker; suggestion backlog.
- **Bigger picture:** The agency's institutionalized know-how — the thing that makes a new VA productive on day one. Feeds the VA-side SOPs feature (V-S).
- **Score: 7/10** — Real usage analytics (dedup'd users), unified category tree, restriction controls.
- **Gaps:** No version lifecycle (can't deprecate/retire), completion-rate vs start-rate not distinguished, no VA-side voting on suggestions.
- **Actions:** Add status (draft/published/deprecated) + version pins; track start→complete funnel; let VAs upvote suggestions.
- **Predicted: 8/10.**

### A10. Client Vaults oversight (`/admin/vault`)
- **What:** Super-admin picks a client and manages their Vault (docs/URLs/notes) via the shared `VaultClient`.
- **Bigger picture:** How the agency seeds/curates each tenant's knowledge base during onboarding — the "feed the brain" step from A1.
- **Score: 6/10** — Clean client-picker with URL state, reuses the full Vault component, auth via existing route guards.
- **Gaps:** No bulk upload, no per-client audit (who added what when), no per-client index-health inline (only on Health).
- **Actions:** CSV/folder bulk ingest; an activity log per vault; inline index-health + "reprocess all" from this view.
- **Predicted: 8/10.**

### A11. Ask as Client (`/admin/ask`)
- **What:** Super-admin runs the client's Ask-the-Vault to QA answer quality before the client relies on it.
- **Bigger picture:** The manual QA gate for the moat — but a dead-end one: spot-checks here don't feed the Brain.
- **Score: 5/10** — Works, zero duplication (reuses Ask), correct scoping.
- **Gaps:** Spot-check verdicts aren't recorded as signals; no side-by-side vs keyword fallback; no saved "golden questions" run here.
- **Actions:** Let the admin 👍/👎 here and write `brain_signals`; wire to the golden-question eval set (see moat actions); show retrieved sources.
- **Predicted: 7/10.**

### A12. Daily-Logs review (`/admin/daily-logs`)
- **What:** Pages through all VAs' daily logs in 30-day windows.
- **Bigger picture:** The agency's pulse on VA wellbeing/output across all tenants; complements per-client Supervision.
- **Score: 5/10** — Efficient paged windows, parallel "is there older?" probe.
- **Gaps:** Browse-only — no search/filter by VA/mood/keyword, no mood-trend alerting, no bulk feedback, no export.
- **Actions:** Add filter + full-text search; a "3 VAs reported overwhelmed this week" alert; CSV export.
- **Predicted: 7/10.**

### A13. Issues triage (`/admin/issues`)
- **What:** Inbox of VA concerns escalated above their client_admin; status open→in_review→resolved.
- **Bigger picture:** The human-escalation safety valve — where retention problems surface first.
- **Score: 5/10** — Inline status control, denormalized names, open-count badge.
- **Gaps:** No assignment/owner, no SLA/aging, no reply thread (one-directional), no notification back to the VA.
- **Actions:** Add owner + SLA aging ("open >7d"); a two-way comment thread; notify VA on status change.
- **Predicted: 7/10.**

### A14. Errors monitor (`/admin/errors`)
- **What:** Self-owned error feed (api/client/proxy source tags), stack traces, 24h count, storm-capped at 30/min.
- **Bigger picture:** Vendor-free observability; the first place a regression shows up. Pairs with Health.
- **Score: 7/10** — Solid capture + display, storm-cap prevents loops, captured via `withAuth`.
- **Gaps:** No dedup (same error = N rows), no alerting on spikes, client errors need manual `captureError`.
- **Actions:** Group by fingerprint with counts; alert (email/Slack) on rate spike; auto-wire a client error boundary.
- **Predicted: 8/10.**

### A15. Health (`/admin/health`)
- **What:** Single-glance status — migration drift (manifest vs DB), schema self-check RPC, cron heartbeat ages, per-client Brain/index health, LLM/embeddings key detection, aggregated "needs attention" banner.
- **Bigger picture:** The platform's conscience; the documented antidote to the "migrations 018–023 silently unapplied for weeks" incident.
- **Score: 8/10** — Genuinely strong; catches the failure modes that actually bit this codebase before.
- **Gaps:** No auto-remediation, drift banner isn't copy-pasteable CLI, no historical trend ("indexing degrading over a week").
- **Actions:** One-click "apply migrations"/"reprocess degraded"; copyable commands; snapshot health to a trend table.
- **Predicted: 9/10.**

### A16. Cron (`/api/cron/tasks`, `vault-index`, `brain-distill`)
- **What:** Daily task spawn/archive, 15-min resumable vault indexing, daily Brain distillation; `CRON_SECRET` auth; heartbeats to `cron_heartbeats`.
- **Bigger picture:** The autonomic nervous system — keeps recurrences, indexing, and learning running without humans.
- **Score: 7/10** — Heartbeat guarantee, self-healing index rounds, per-client batching caps, never crashes the run.
- **Gaps:** Shallow metrics (counts only, no error-rate/throughput), no edge-function timeout guard, no manual "run now" from UI.
- **Actions:** Add per-run metrics + failure alerting; a manual trigger button on Health; timeout/circuit-break the edge calls.
- **Predicted: 8/10.**

### A17. Migrations system (`db/migrations`, `lib/migrations/manifest.ts`)
- **What:** 77 numbered SQL migrations, self-recording ledger, manifest mirror with a drift unit test, Health diff.
- **Bigger picture:** The schema's source of truth; the discipline that keeps a service-role-only architecture from corrupting tenants.
- **Score: 7/10** — Rigorous forward path, manifest test, drift surfaced.
- **Gaps:** No down-migrations/rollback, no data-migration validation, manifest must be hand-synced (test catches drift but it's manual).
- **Actions:** Adopt reversible migrations or a tested rollback runbook; pre-flight data checks; codegen the manifest from the dir.
- **Predicted: 8/10.**

---

# PART B — CLIENT (client_admin) FEATURES

### B1. Dashboard (`/dashboard`)
- **What:** Role-aware landing — client sees KB/contacts/vault counts + team status; VA sees their tasks/logs.
- **Bigger picture:** First screen every login; sets the daily narrative. Shared shell with the VA dashboard.
- **Score: 7/10** — Parallel SSR queries, graceful null-client bailout, clean role branching.
- **Gaps:** No per-query error boundary (one failed query → console only); admin team-strip can leak archived counts into "live"; no post-write revalidation.
- **Actions:** Wrap each tile in independent error/empty states; exclude archived from live counts; add a "since yesterday" delta.
- **Predicted: 8/10.**

### B2. Supervision (`/supervision`, `/supervision/[id]`)
- **What:** Client oversight of each VA over 30 days — delivered tasks, on-time %, hours, log submission; detail shows logs, SOP runs, mood, time entries.
- **Bigger picture:** The client's accountability lens on the VA they're paying for — a core value-prop surface.
- **Score: 7/10** — Outcome-first sort (review-needed bubbles up), N+1-safe batch queries, reuses tested `lib/tasks/metrics.ts`.
- **Gaps:** Purely passive — no intervention (no "review these overdue," no low-mood escalation), no time-series viz, no category breakdown.
- **Actions:** Add an action layer (nudges, escalations); sparkline trends for hours/mood; task-by-category drill-down.
- **Predicted: 8.5/10.**

### B3. My Team (`/team`, `/team/[id]`)
- **What:** VA roster with 7-day mood strip + log counts; detail edits salary/payment/contract terms, shows mood breakdown, time-by-day, searchable logs, leave approvals.
- **Bigger picture:** The lightweight HRIS for the client's VAs; the comp/contract record of truth.
- **Score: 7/10** — Centralized profile/contract editors, single-sourced mood metadata, batch-loaded logs, comp gated by visibility.
- **Gaps:** No audit on salary/comp edits, contract-document viewing stubbed, leave approvals lack bulk actions, no performance/skills rating beyond mood.
- **Actions:** Audit comp changes; finish contract-doc view/upload; bulk leave decisions; a simple periodic review/rating.
- **Predicted: 8/10.**

### B4. Reports (`/reports`)
- **What:** Monthly per-VA delivery, on-time %, hours, category breakdown, content/tool run counts; 6-month history; SSR-precomputed.
- **Bigger picture:** The artifact a client would show *their* boss to justify the spend — so distribution matters.
- **Score: 6/10** — Reuses metrics, clean SSR, month picker.
- **Gaps:** View-only (no PDF/email/export), no month-over-month trend, no SOP/Brain engagement, no target-vs-actual.
- **Actions:** PDF export + scheduled email digest; MoM deltas + velocity; targets and variance.
- **Predicted: 8/10.**

### B5. Company Brain (`/brain`)
- **What:** The learning-system hub — Brain Score (0–100), curated lessons (`brain_memory`), proposed-lesson approval, distill-now.
- **Bigger picture:** **The product's core differentiator** — the loop that makes every AI surface improve from use. See "The Moat" section below.
- **Score: 6/10** — Sophisticated, self-correcting design (conflict routing, decay, reinforcement); honest provisional scoring.
- **Gaps:** Outcomes unvalidated — no proof lessons improve answers; generic `gte-small` embeddings gate decisions; hardcoded thresholds; best-effort signal capture.
- **Actions:** Build the eval harness (below); validate/replace embeddings; make thresholds tunable + observable.
- **Predicted: 8/10.**

### B6. Brain Analytics (`/brain-analytics`)
- **What:** Coverage/satisfaction dashboards — question frequency, answer ratings, knowledge gaps, content acceptance trend, flag precision, downvote review queue, lessons inventory.
- **Bigger picture:** The instrumentation that *should* prove the Brain works; today it measures activity more than improvement.
- **Score: 7/10** — Multi-source, dedup'd question counts, flag-precision (decided-only), weekly trend, downvote queue.
- **Gaps:** 30-day window hardcoded, gap detection only sees asked questions (silent unknowns), no cohort/causality, no A/B.
- **Actions:** Configurable ranges; surface never-asked gaps from DNA/topics; cohort + Brain-on/off comparison.
- **Predicted: 8/10.**

### B7. Company Report (`/company-report`)
- **What:** Knowledge-coverage dossier — vault category coverage, KB count, knowledge gaps, DNA completeness, health actions.
- **Bigger picture:** The "how smart is my brain, and what's missing" narrative for the client — a guided completeness map.
- **Score: 6/10** — Good category coverage + gap surfacing, ties DNA/KB/vault into one view.
- **Gaps:** Descriptive not strategic (lists coverage, doesn't synthesize insight or recommend next docs); overlaps Brain/Brain-Analytics conceptually.
- **Actions:** Add prioritized "add these 3 docs to unlock X" recommendations; merge or clearly differentiate from `/brain`.
- **Predicted: 7.5/10.**

### B8. Company DNA (`/company-dna`)
- **What:** Hand-curated company profile (16+ fields: services, voice, goals, team, tools, internal rules); admin-write, VA-read; grounds all generation.
- **Bigger picture:** The root context every AI surface ingests — poison here poisons everything, hence admin-only writes.
- **Score: 6/10** — Tight role guard, extensible JSONB, smart partial-upsert, `internal_rules` marked non-AI-draftable.
- **Gaps:** No proof it's actually used downstream (wiring implicit), no completeness weighting/UI, no versioning/history.
- **Actions:** Show "this field feeds Ask/Compose/Content"; weighted completeness meter; version + change reason.
- **Predicted: 8/10.**

### B9. Vault (`/vault`, `/vault/knowledge`)
- **What:** Knowledge ingestion + RAG store — crawl sites, upload PDF/DOCX/text, AI metadata extraction, hash-dedup, structure-aware chunking, 384-dim embeddings, resumable indexing.
- **Bigger picture:** The substrate the entire AI layer retrieves from; quality here caps Ask/Content/Brain quality.
- **Score: 7/10** — Bulletproof dedup (hash + unique index + race rollback), honest extraction flags (<50-char PDFs = error not blind spot), section-aware chunks prefixed with source.
- **Gaps:** No eval of embedding/chunk quality, no validation that extracted tags/categories are accurate, crawl summaries' downstream use unproven.
- **Actions:** Retrieval eval harness; spot-check metadata accuracy as a signal; measure crawl-summary lift.
- **Predicted: 8.5/10.**

### B10. Ask the Vault (`/ask`, `/api/vault/ask`, `ask-stream`)
- **What:** Unified RAG Q&A across Vault + KB + SOPs + DNA; concise (gpt-4o-mini) and deep (gpt-4o) modes; multi-query rewrite; streaming; rate-limited 20/5min.
- **Bigger picture:** The most-used AI surface and the daily proof-of-value; its grounding quality is the brand's credibility.
- **Score: 8/10** — 4-source resilient retrieval (one source failing doesn't block others), multi-angle rewrite with raw-question fallback, Base64-safe source headers, dual prompts.
- **Gaps:** No hallucination/grounding check beyond prompt instruction, conversation history sent but not clearly used, Q/A pairs not logged for eval, deep mode always gpt-4o (cost).
- **Actions:** Add a self-critique/grounding pass; log Q+A+sources for the eval set; adaptive model selection by complexity.
- **Predicted: 9/10.**

### B11. Knowledge Base (`/api/kb`, under Vault/knowledge)
- **What:** Curated Q&A pairs generated from Vault + DNA, hand-editable, pinned entries survive regeneration, retrieved by Ask via FTS.
- **Bigger picture:** The human-trusted layer over raw Vault — preserves canonical answers; a hedge against retrieval drift.
- **Score: 5/10** — Pinning preserves human knowledge, source-vault traceability, generation stats.
- **Gaps:** Generation prompt quality opaque, no proof KB improves Ask vs Vault-only, category unused in ranking, no scale limit on retrieval.
- **Actions:** A/B KB-on/off in Ask; expose/tune generation prompt; rank by category + pin; cap retrieval volume.
- **Predicted: 7/10.**

### B12. CRM (`/crm`, `/crm/add-contact`)
- **What:** Contact lifecycle kanban (lead→prospect→active→inactive→closed) with notes + events trail; soft-delete; VA archive, admin hard-delete.
- **Bigger picture:** The client's relationship memory; also the data source Compose pulls "recent contacts" from.
- **Score: 7/10** — Zod, status-change audit, soft-delete + restore audited, input sanitization.
- **Gaps:** No duplicate detection (same email = new row), events insert is fire-and-forget, no API-level search (loads all 500 client-side), status changes don't notify the VA.
- **Actions:** Dedup on email/phone; server-side search/filter; notify on assignment/stage change; harden the events write.
- **Predicted: 8/10.**

### B13. Access — credential vault (`/access`)
- **What:** Encrypted shared logins — AES-256-GCM at app layer, versioned envelope, role-scoped (admins all, VAs a restricted list), reveal-on-demand.
- **Bigger picture:** The secure handoff that lets a VA operate the client's tools without owning the master password; a real trust feature.
- **Score: 9/10** — Strong crypto with key validation + 503-if-missing, passwords never in list selects, restricted-to VA scoping.
- **Gaps:** **No audit log of password reveals** (security/compliance gap), key rotation not automated (envelope is versioned but no migrator).
- **Actions:** Log every reveal (who/what/when); a key-rotation runbook + re-encrypt job; optional reveal approval.
- **Predicted: 9.5/10.**

### B14. Messages (`/messages`, `/api/messages`)
- **What:** Single shared client⇄VA thread, sorted by time; mark-read via the notifications API.
- **Bigger picture:** The primary in-product comms channel — and the most surprising gap in the product.
- **Score: 5/10** — GET is hardened (admin-scoped to dodge RLS fragility), ordered correctly.
- **Gaps:** **No POST/send endpoint — effectively read-only**; mark-read lives in notifications not messages; no edit/delete, no unread waterline, no attachments.
- **Actions:** Ship `POST /api/messages/send` + optimistic send + read-waterline; consolidate unread state; (later) attachments/threads.
- **Predicted: 8/10.**

### B15. Notebook (`/notebook`)
- **What:** Shared placement-scoped workspace (VA⇄client), 1-level nesting, soft-archive, **enforced by Postgres RLS via the user-scoped client** so admins can never read content.
- **Bigger picture:** The privacy crown-jewel — the one place where DB-level RLS (not app code) is the boundary, a deliberate trust guarantee.
- **Score: 7/10** — Real RLS enforcement, nesting enforced, optimistic-concurrency 409 on stale writes, integration-tested (`notebook-rls.integration.test.ts`).
- **Gaps:** 409 conflict has no merge/reload UI, no image malware/quota scan, reparent-to-archived not rejected.
- **Actions:** Add conflict-resolution UI (reload/merge); image quota + scan; tighten reparent validation.
- **Predicted: 8/10.**

### B16. Tasks (`/tasks`)
- **What:** Real-time kanban (todo→done), categories, assignment, recurrences (daily/weekly/monthly with burst-prevention), "Achieved" week/month + on-time %, activity trail.
- **Bigger picture:** The operational core of VA⇄client work; the source of truth Supervision/Reports/Dashboard all aggregate.
- **Score: 8/10** — Live `postgres_changes` sync, dependency-free unit-tested recurrence (`tasks-recurrence.test.ts`), server-computed achieved metrics that survive archiving, route tested.
- **Gaps:** Archived filtered at load not live (admin live-count vs achieved-with-archives mismatch), comment-count load is fire-and-forget, category delete doesn't warn/cascade.
- **Actions:** Live-filter archived consistently; harden comment loads; guard category deletion.
- **Predicted: 9/10.**

### B17. Guide (`/guide`)
- **What:** Role-aware static help (VA vs client) as an accordion of feature explainers.
- **Bigger picture:** Onboarding/self-serve support; reduces hand-holding as the user base grows.
- **Score: 8/10** — Role-aware, server-rendered, low-risk, genuinely useful.
- **Gaps:** Hardcoded (no CMS/edit UI), no search, no engagement analytics.
- **Actions:** Move to editable content + search; track most-opened sections to find UX pain.
- **Predicted: 8.5/10.**

### B18. Profile (`/profile`)
- **What:** Edit own name/phone/birthday/avatar; password reset via Supabase auth.
- **Bigger picture:** Universal account self-service; low-stakes but ubiquitous.
- **Score: 6/10** — Zod-validated, password length-checked.
- **Gaps:** Avatar is URL-only with no content-type check (SVG injection risk), birthday stored but unused, no image upload, password reset has no confirmation loop.
- **Actions:** Validate/host avatar uploads (block active SVG); use or drop birthday; confirm-email on password change.
- **Predicted: 7.5/10.**

---

# PART C — VA FEATURES

### C1. Compose (`/compose`)
- **What:** AI email drafting grounded in DNA brand voice/sign-off + 200 recent CRM contacts.
- **Bigger picture:** A daily VA productivity surface and a showcase of "DNA-grounded" generation — but the thinnest of the AI features.
- **Score: 4/10** — Clean minimal data model; *but the actual generation path is thin/unverified* and there's no feedback loop or fact-check.
- **Gaps:** No clear dedicated LLM endpoint, no consistency check vs past emails, can invent addresses/offers, no 👍/👎 to Brain.
- **Actions:** Solidify a `/api/compose` endpoint with grounding; add feedback signals; basic fact-guard on emails/dates.
- **Predicted: 7/10.**

### C2. Content Studio (`/content`)
- **What:** VA proposes topics → AI suggests fit/angle (`ai_fit_score`, `ai_flagged`) → generates drafts grounded in Vault (`content-generate` edge fn, captures `ai_original`) → VA approves/rejects, which trains the Brain via edit-distance.
- **Bigger picture:** The flagship "Brain learns from outcomes" loop — the clearest demonstration of the moat working.
- **Score: 6/10** — Explicit feedback loop, `ai_original` capture enables rewrite-distance measurement, honest flag-precision, role isolation.
- **Gaps:** `ai_fit_score` is a black-box LLM judgment, approval is binary (no "needs edits"), `ai_original` capture is best-effort (silent loss), no A/B of Brain versions.
- **Actions:** Make fit-score explainable; add a 3-state outcome; harden `ai_original` capture; A/B the content Brain.
- **Predicted: 8/10.**

### C3. SOPs — VA side (`/sops`, run/fork/generate/suggest)
- **What:** Structured procedures (intro, prerequisites, steps), global + client-scoped, restricted visibility, content versioning, runnable, forkable, AI-generate, AI-suggest.
- **Bigger picture:** How a VA executes consistently and how tacit knowledge becomes reusable; consumes A9's global library.
- **Score: 8/10** — Tight scope auth (global↔client boundary), atomic visibility/access sync, version bump on content change, legacy-text→steps parser, step Zod (`sop-steps.test.ts`).
- **Gaps:** Hard-delete (no soft-delete), forking records no lineage (`forked_from`/version), runner state not persisted, AI-generate params unvalidated.
- **Actions:** Soft-delete; capture fork lineage; persist run progress (resume a half-done SOP); validate generate inputs.
- **Predicted: 9/10.**

### C4. Tools suite (`/tools`, 17 tools)
- **What:** 17 lightweight DNA-grounded marketing utilities. Each: validate → `companyContext()` → prompt-registry LLM call → clamped JSON; rate-limited 40/10min (shared bucket); runs logged via `logToolRun()`.
- **Bigger picture:** The "VA does marketing 10× faster" breadth play — wide surface, but every tool is a dead-end (none feeds the Brain).
- **Cluster score: 5/10** — Useful, validated, DNA-aware, admin-tunable prompts; but isolated from the learning loop, single quota bucket (cheap tools starve expensive ones), no per-tool quality measurement, no cross-tool coherence.
- **Per-tool snapshot** (all share the cluster's strengths/limits):

  | Tool | Purpose | Score |
  |---|---|:--:|
  | ad-copy | Platform ad variants (Google/Meta) | 6 |
  | hooks | Scroll-stopping opening hooks | 5 |
  | hashtags | Hashtag sets | 5 |
  | carousel | Multi-slide carousel copy | 5 |
  | repurposer | One asset → many formats | 6 |
  | follow-up | Follow-up message sequences | 5 |
  | reply-assistant | Drafted replies | 5 |
  | reply-classifier | Categorize inbound replies | 6 |
  | meta | SEO title/description | 6 |
  | keyword-brief | SEO keyword brief | 6 |
  | gbp | Google Business Profile posts | 5 |
  | newsletter | Newsletter copy | 5 |
  | personalisation | Personalize at scale | 5 |
  | spintax | Spintax variations | 4 |
  | content-auditor | Audit existing content | 6 |
  | calendar | Content calendar planning | 5 |
  | fetch-url | Pull URL content for other tools | 6 |

- **Actions (lift the whole cluster):** Per-tool quotas; log outcome/copy-rate and feed distillation; cross-tool brand-consistency; promote the 4–5 highest-value tools, retire low-use ones.
- **Predicted cluster: 7/10.**

### C5. My Job (`/my-job` + contract/days/leave/issues/self-report + documents: certificate/invoice/tax)
- **What:** VA employment hub — 1:1 contract terms, logged work days/hours, leave requests (annual/sick/unpaid/personal) with approval audit, support issues, monthly self-report, generated documents (certificate/invoice/tax).
- **Bigger picture:** The VA's "employer of record" experience — pay, leave, paperwork; a retention/trust surface and a differentiator vs a bare task tool. Pay math is unit-tested (`my-job-pay.test.ts`).
- **Score: 7/10** — Leave→client-admin notification, approval audit trail (reviewed_by/at), read-only contract, document generation present, pay tested.
- **Gaps:** No leave-balance/accrual (quota−taken), days hours unvalidated (0–24), issues have no priority enum, self-report body unvalidated, contract-doc upload/retrieval partly stubbed.
- **Actions:** Add leave-balance accounting; validate hours/self-report; priority on issues; finish contract-doc storage.
- **Predicted: 8.5/10.**

### C6. Daily Log (`/daily-log`, `/daily-log/analytics`)
- **What:** VA daily mood (5-pt) + 5 text sections (done/wins/blockers/goals/tomorrow), debounced autosave, admin backfill, read-only analytics trends; separate VA notes.
- **Bigger picture:** The wellbeing + accountability heartbeat that feeds Supervision, My Team, and Admin Daily-Logs.
- **Score: 7/10** — 800ms debounce, dirty-field diffing, optimistic state, upsert on (user, date), mood history for analytics.
- **Gaps:** Client clock-skew can misdate "today" permanently (VAs can't backfill), notes delete fire-and-forget, analytics has no error boundary, save-confirmation is fleeting.
- **Actions:** Server-derive "today"; persistent saved indicator; harden notes; analytics error/empty states.
- **Predicted: 8/10.**

### C7. Notifications (`/api/notifications`, `NotificationsBell`)
- **What:** In-app inbox (task assigned, leave approved, review ready…), GET 30 + unread count, type-scoped mark-read.
- **Bigger picture:** The cross-feature attention router; also currently the de-facto unread store for Messages.
- **Score: 7/10** — Type-scoped read (opening Messages clears message notifs), separate unread count query, Zod PATCH.
- **Gaps:** No DELETE/purge (unbounded growth), no per-type mute/preferences, fire-and-forget `notify()` calls, no email digests.
- **Actions:** Retention/purge job; notification preferences; harden notify writes; optional email digest.
- **Predicted: 8/10.**

### C8. Time entries (`/api/time-entries`)
- **What:** VA logs work segments (start/end, work|break, date, notes, category) via upsert (id present = close/update).
- **Bigger picture:** Granular hours feeding Supervision/Team/Reports hour totals.
- **Score: 6/10** — Zod, user-scoped, upsert handles create + close.
- **Gaps:** No end≥start check, no overlap detection, category is open-ended (no enum), no idle auto-stop, no approval trail.
- **Actions:** Validate ordering + overlaps; constrain categories; idle-timeout safety; optional approval.
- **Predicted: 7.5/10.**

---

# PART D — THE MOAT (cross-feature, examined on its own)

The Vault→Brain loop spans B5/B6/B9/B10/B11/C2 and is the strategic heart, so it earns a combined verdict. **Design is excellent; outcomes are unproven.**

- **What works:** feedback (👍/👎, approvals, edit-distance) → `brain_signals` → distillation into `brain_memory` with embeddings, **conflict routing to `proposed`**, reinforcement of repeats, **time-decay** of stale lessons → re-injected via `buildBrainContext`. Honest, provisional Brain Score. Most competitors don't have this.
- **What's missing (the gap that caps every AI score):** no eval/regression harness (retrieval recall, chunk relevance, multi-query lift all unmeasured); generic `gte-small` embeddings gating dedup/conflict decisions without brand-semantic validation; no A/B (Brain-v1 vs v2); several signal captures are best-effort (silent rot); no grounding/hallucination check on Ask.
- **Combined moat score: 6.2/10. Ceiling with evidence: 8.5–9.**

---

# PART E — CROSS-CUTTING PLATFORM (scored as features)

### E1. Auth & tenant isolation — **7/10**
App-layer is the *only* boundary (service-role bypasses RLS except Notebook); `assertClientAccess` is unit-tested (`api-auth.test.ts`, `roles.test.ts`), `getCurrentUserAndClient` is `React.cache`-deduped. **Gap:** one missing check = silent cross-tenant leak with no DB backstop. **Action:** defense-in-depth RLS pass on the hottest tables; move role/client into JWT claims. **Predicted: 8.5.**

### E2. Error tracking infra — **7/10** (see A14 for the UI). **Action:** fingerprint dedup + spike alerting. **Predicted: 8.**

### E3. Testing — **4/10.** 28 files, strong on *logic* (metrics, recurrence, crypto, brain-pure, RLS integration) but **near-zero feature/E2E** — no "create VA → assign task → complete → report shows it." **Action:** add E2E on the money paths before enforcing the 70% gate. **Predicted: 7.**

### E4. Data layer — **5/10.** Two paradigms coexist (SSR+admin client vs React-Query/`useResource`); no cache coordination → stale-after-edit when navigating SSR pages. `useResource`/`useCrudDialog` are tested and good but only back 4–5 admin tables. **Action:** standardize on React-Query as transport; coordinate invalidation. **Predicted: 7.**

### E5. API caching/security headers — **5/10.** `Cache-Control: public` on **all** `/api/*` (flagged in `AUDIT-2026-06.md` #1) risks cross-user cache exposure. **Action:** default `private, no-store`, opt-in per route. **Predicted: 8.**

---

# PART F — RANKING, ROADMAP & PREDICTED TRAJECTORY

### Full leaderboard (by current score)

**9 —** All Users, Admin Overview, Access (credential vault)
**8 —** Health, Clients, Leads, Placements, AI Prompts, Ask the Vault, Tasks, SOPs (VA), Guide
**7 —** Expenses, SOP Library, Errors, Cron, Migrations, Impersonation, Dashboard, Supervision, My Team, Vault, Notebook, Notifications, CRM, Daily Log, My Job, Auth, Error-infra
**6 —** Client Vaults oversight, Reports, Company Brain, Brain Analytics, Company Report, Company DNA, Content Studio, Profile, Time entries
**5 —** Ask-as-Client, Daily-Logs review, Issues, Messages, Knowledge Base, Tools (cluster), Data layer, Cache headers
**4 —** Compose, Testing

### Where to spend — biggest lift per effort

**P0 — fix the embarrassing gap & the risk**
1. Finish **Messages** (B14, 5→8) — ship the send endpoint. 1–2 days, removes a credibility hole.
2. Confirm/patch the **blanket API cache header** (E5, 5→8).

**P1 — turn the moat from asserted to proven** *(highest strategic value)*
3. **Retrieval + Brain eval harness** (Part D, 6.2→8): golden-question set per client scored each deploy, A/B Brain-on/off, grounding tracking. This is what makes "gets smarter from use" defensible.
4. **Grounding/self-critique pass on Ask** (B10, 8→9) + replace best-effort signal captures with retry+alert so learning data stops rotting.
5. **Wire Tools into the Brain** (C4, 5→7): outcome logging + per-tool quotas → 17 dead-ends become compounding assets.

**P2 — make the client tier *act*, not just observe**
6. **Intervention layer** on Supervision/Reports (B2 7→8.5, B4 6→8): low-mood/overdue escalation, MoM trends, PDF/scheduled export.
7. **Issues & Daily-Logs workflow** (A13 5→7, A12 5→7): assignment, SLA, search, mood alerts.

**P3 — durability & compliance**
8. **Feature/E2E tests** (E3 4→7) on money paths.
9. **Resolve dual data layer** (E4 5→7).
10. **Audit logs** for Impersonation (A4) and credential Reveals (B13) — compliance.

### Predicted trajectory

| Tier | Now | After P0–P1 | After P0–P3 |
|---|:--:|:--:|:--:|
| Admin / back-office | 7.3 | 7.5 | 8.4 |
| Client | 6.5 | 7.4 | 8.2 |
| VA | 6.5 | 7.2 | 8.1 |
| AI / moat | 6.2 | 7.6 | 8.5 |
| Platform | 6.0 | 7.0 | 8.0 |
| **Overall** | **6.6** | **7.5** | **8.3** |

**Bottom line:** the build quality is real and the surface is broad. The fastest credibility win is finishing Messages; the highest strategic return is the evaluation harness that converts the Brain from a great story into a measurable moat. Resist adding feature #50 until the learning loop can prove it improves.
