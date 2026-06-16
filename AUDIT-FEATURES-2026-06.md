# RapidTal Portal — Feature Audit & Product Scorecard (June 2026)

**Lens:** CTO / product-portfolio review — not code style.
**Method:** Full route map (49 pages, ~24 API domains, 77 migrations) + four grounded deep-dives into the code behind every feature.
**Scale (1–10):** 9–10 production-grade & differentiated · 7–8 solid, shippable, minor gaps · 5–6 functional MVP, real gaps · 3–4 half-built/thin · 1–2 stub.

> Companion docs: `AUDIT-2026-06.md` (code quality), `VAULT-AUDIT.md` (RAG internals). This doc is the **feature/business** view those two don't cover.

---

## 1. Executive summary

RapidTal is **unusually broad for its stage** — it is three products fused: (a) a VA/client *collaboration* suite (tasks, daily log, notebook, messages, SOPs), (b) an *AI knowledge & content* engine (Vault/RAG, Brain, Tools, Content), and (c) an internal *ops/agency* back-office (clients, users, leads, expenses, placements, health). The engineering discipline is high: uniform `withSuperAdmin`/`withAuth` guards, Zod everywhere, a real migration ledger, self-owned error tracking, and a genuinely sophisticated observability page (`/admin/health`).

**The portfolio's center of gravity is correct but its weight is misplaced.** The *differentiator* — the Vault→Brain learning loop — is the least validated part (no eval harness, opaque embeddings, best-effort signal capture). Meanwhile a *table-stakes* feature, Messages, is effectively read-only. The agency back-office (the least defensible, most commoditized surface) is the most polished. A CTO's job here is to **rebalance investment toward the moat (provably-improving AI) and close the one embarrassing gap (messaging)**, while resisting the urge to add a 7th marketing tool.

**Overall platform maturity: 6.6 / 10** — "advanced, broad prototype with production-grade plumbing; the moat is asserted, not yet measured."

| Theme | Score | One-liner |
|---|---|---|
| Admin / back-office | **8.0** | Polished, complete, well-guarded — but commoditized |
| Collaboration (VA⇄Client) | **7.0** | Solid, except Messages is unfinished |
| AI / Knowledge (the moat) | **6.2** | Sophisticated design, unvalidated outcomes |
| Platform / observability | **6.8** | Health & migrations strong; tests & alerting thin |

---

## 2. Role × feature access matrix (live, from `Sidebar.tsx`)

| Feature | super_admin | client_admin | va |
|---|:--:|:--:|:--:|
| Overview / Clients / Users / Leads / Expenses / Placements | ✅ | — | — |
| SOP Library / Client Vaults / Ask-as-Client / Daily-Logs / Prompts / Issues / Errors / Health | ✅ | — | — |
| Supervision | ✅ | ✅ | — |
| My Team | — | ✅ | — |
| Reports / Company Brain / Brain Analytics | — | ✅ | — |
| Dashboard / Tasks / Notebook / Messages | — | ✅ | ✅ |
| Ask the Vault / Company Report / CRM / Company DNA / Vault / Access | ✅* | ✅ | ✅ |
| Compose / Tools / My Job / Daily Log / Content / SOPs / Guide / Profile | — | ✅** | ✅ |

\* admin reaches these via Client-Vaults / Ask-as-Client. \*\* client_admin has most VA tools under a "Workspace" group. Net: **a VA's menu = a client's, minus My Team / Reports / Brain and minus approval powers.**

---

## 3. Admin (super_admin) features

| # | Feature | Score | Verdict |
|---|---|:--:|---|
| A1 | All Users (invite, suspend, login-link, reset, impersonate) | **9** | Atomic auth↔public sync, last-admin lockout guards, SMTP-less fallbacks |
| A2 | Access (AES-256-GCM credential vault) | **9** | Versioned envelope, passwords never in list selects, 503 if key missing |
| A3 | Admin Overview | **9** | Postgres RPC aggregation, attention-scored sort, quick actions |
| A4 | Health (drift, indexing, cron, brain) | **8** | Best-in-portal observability; no auto-remediation |
| A5 | Clients (CRUD + onboarding checklist) | **8** | Cascading auth cleanup, slug conflict 409; hard-delete only |
| A6 | Leads (sales kanban) | **8** | Stage-change audit, enum guards; 2000-row cap not pagination |
| A7 | Placements (VA⇄client + notebook seed) | **8** | Status gates RLS access; seed side-effect unguarded |
| A8 | AI Prompts (override + variable validation) | **8** | `[[var]]` validation, cache-bust, version snapshots; no rollback UI |
| A9 | Expenses | **7** | Clean CRUD; no currency conversion |
| A10 | SOP Library (global, adoption stats) | **7** | Usage analytics, category tree; no version lifecycle |
| A11 | Errors monitor | **7** | Self-owned, storm-capped; no dedup/alerting |
| A12 | Cron (tasks / vault-index / brain-distill) | **7** | Heartbeats + self-healing; shallow metrics |
| A13 | Client Vaults oversight | **6** | Reuses VaultClient; no per-client audit log |
| A14 | Daily-Logs review | **5** | Browse-only; no search/mood-alerting |
| A15 | Issues triage | **5** | Status flips only; no assignment/SLA/thread |
| A16 | Ask-as-Client (QA spot-check) | **5** | Works, but spot-checks don't feed the Brain |

**Admin tier avg ≈ 7.3.** This is the strongest, most finished surface — and strategically the *least* defensible (every agency tool has user/billing/CRUD). Don't over-invest. The two worth raising are **A15 Issues** and **A14 Daily-Logs** because they're where human problems surface and currently they're write-only inboxes with no workflow.

---

## 4. Client (client_admin) features

| # | Feature | Score | Verdict |
|---|---|:--:|---|
| C1 | Supervision (VA oversight, 30-day) | **7** | Outcome-first sort, N+1-safe, shared metrics; passive only |
| C2 | My Team (VA profiles, comp, leave) | **7** | Mood strips, contract editor; no comp audit/HR workflow |
| C3 | Company Brain (`/brain`) | **6** | Score + memory panel; lessons unvalidated (see §6) |
| C4 | Brain Analytics | **7** | Multi-source, flag-precision, downvote queue; 30d hardcoded |
| C5 | Reports (monthly) | **6** | Reuses metrics, SSR; no trends/PDF/export |
| C6 | Company Report (knowledge coverage dossier) | **6** | Category coverage + gaps; descriptive, not strategic |

Client-exclusive surfaces are **competent but passive** — they *show* the client what happened; none *act* (no "review these 3 overdue tasks," no low-mood escalation, no month-over-month trend). For the buyer who pays the bill, this is the weakest tier relative to expectation.

---

## 5. VA features (collaboration + AI tools)

| # | Feature | Score | Verdict |
|---|---|:--:|---|
| V1 | Tasks (kanban, recurrences, achieved %) | **8** | Live `postgres_changes` sync, unit-tested recurrence, on-time metrics |
| V2 | Ask the Vault (RAG, concise+deep) | **8** | 4-source resilient retrieval, multi-query rewrite, streaming |
| V3 | SOPs (view/create/run/fork/AI-generate) | **8** | Tight scope auth, versioning, step parser; no fork lineage, hard-delete |
| V4 | Vault (ingest + RAG plumbing) | **7** | Hash-dedup, structure-aware chunking, honest extraction flags |
| V5 | Dashboard | **7** | Parallel SSR queries; no error-boundary per query |
| V6 | Notebook (private, RLS-enforced) | **7** | Real RLS boundary, optimistic-concurrency 409; no merge UI |
| V7 | CRM (contacts/notes/events) | **7** | Status audit, soft-delete; no dedup/search-at-API |
| V8 | Daily Log (+ analytics) | **7** | Debounced autosave, dirty-field diffing; clock-skew risk |
| V9 | My Job (contract/leave/issues/docs) | **7** | Leave→notify workflow, audit trail; no leave-balance, doc upload stubbed |
| V10 | Notifications | **7** | Type-scoped read; no purge/prefs/digests |
| V11 | Content Studio (topics→draft→approve) | **6** | `ai_original` capture for rewrite-distance; binary approve only |
| V12 | Profile | **6** | Zod-validated; avatar is URL-only (SVG risk), birthday unused |
| V13 | Time entries | **6** | Upsert; no end≥start / overlap / range checks |
| V14 | Guide | **8** | Role-aware static help; hardcoded, no search |
| V15 | Tools suite (17 marketing utilities) | **5** | DNA-grounded, rate-limited; isolated from Brain, single quota bucket |
| V16 | Compose (AI email drafting) | **4** | Loads DNA+contacts but generation path thin/unverified |
| V17 | **Messages (client⇄VA)** | **5** | **GET-only — no send endpoint in `/api/messages`; this is the worst gap** |

**VA tier avg ≈ 6.7.** The work-execution core (Tasks, SOPs, Daily Log, Notebook) is genuinely good. The AI tools are a mile wide and an inch deep — **17 tools, none wired to the learning loop**, so they never improve. Messages being read-only is the single most surprising hole in the product.

---

## 6. The moat, examined: Vault → Brain learning loop

This is the strategic heart, so it gets its own section. The design is impressive: feedback (👍/👎, approvals, edit-distance) → `brain_signals` → distillation into `brain_memory` lessons with embeddings, **conflict routing to `proposed`**, reinforcement of repeats, and **time-decay of stale lessons** → injected back via `buildBrainContext`. A 0–100 Brain Score with provisional-until-5-samples honesty. This is a thoughtful, self-correcting system most competitors don't have.

**But it is asserted, not measured.** The critical missing piece: **nothing proves the loop makes answers better over time.**

- No eval/regression harness for retrieval (recall, chunk relevance, multi-query lift all unmeasured).
- Embeddings are generic `gte-small` — never validated against brand/marketing semantics, yet they gate dedup/conflict/reinforce decisions.
- No A/B (Brain-v1 vs v2 on the same topics); the analytics show acceptance *rates* but can't attribute them to the Brain.
- Several signal-capture paths (`ai_original`, KB pinning, tool logging) are best-effort `try/catch` — silent degradation erodes the very data the loop learns from.
- `Ask` has **no hallucination/grounding check** beyond a prompt instruction.

**Brain/Vault composite: 6.2.** The ceiling is high (8–9) and the design is already there — the gap is *evidence*, not architecture.

---

## 7. Cross-cutting platform

| Concern | Score | Note |
|---|:--:|---|
| Auth & tenant isolation | **7** | `assertClientAccess` unit-tested; app-layer is the only boundary (RLS bypassed except Notebook) — one missing check = leak |
| Migrations / drift detection | **7** | 77 numbered migrations, manifest test, health diff; no down-migrations |
| Error tracking | **7** | Self-owned, storm-capped; no dedup, no alerting |
| Observability (Health) | **8** | Genuinely strong single-glance status |
| **Testing** | **4** | ~31 unit files on *logic* (metrics, recurrence, crypto, brain-pure); **near-zero feature/E2E** — no "create VA→assign→complete→report" path |
| Data layer | **5** | Two paradigms coexist (SSR+admin client vs React-Query/useResource); no cache coordination → stale-after-edit |
| Caching header risk | **5** | `Cache-Control: public` on *all* `/api/*` (flagged in `AUDIT-2026-06.md` #1 — cross-user exposure risk; verify if fixed) |

---

## 8. Where to spend (prioritized) — biggest score lift per effort

**P0 — Close the embarrassing gap & the risk**
1. **Finish Messages** (5→8). Add `POST /api/messages/send` + read-waterline + optimistic send. ~1–2 days, removes a credibility hole.
2. **Confirm/​fix the blanket API cache header** (platform 5→7). One-line risk; verify it was patched.

**P1 — Turn the moat from asserted to proven** *(highest strategic value)*
3. **Retrieval + Brain eval harness** (Brain 6.2→8). A golden-question set per client, scored on each deploy; A/B Brain-on/off; track answer-grounding. This is what makes "gets smarter from use" a *defensible claim*.
4. **Add a grounding/self-critique pass to Ask** (V2 8→9) and **replace best-effort signal captures with retry+alert** so the learning data stops silently rotting.
5. **Wire Tools into the Brain** (V15 5→7). Log outcomes, feed distillation, per-tool quotas. Converts 17 dead-end utilities into compounding assets.

**P2 — Make the client tier *act*, not just observe**
6. **Intervention layer on Supervision/Reports** (C1 7→8, C5 6→8): low-mood + overdue-task escalation, month-over-month trends, PDF/scheduled report export. This is what the paying buyer actually feels.
7. **Issues & Daily-Logs workflow** (A15 5→7, A14 5→7): assignment, SLA, search, mood-trend alerts.

**P3 — Durability**
8. **Feature/E2E test coverage** (testing 4→7) on the money paths before raising the coverage gate.
9. **Resolve the dual data layer** (platform 5→7): standardize on React-Query so edits don't leave SSR pages stale.

---

## 9. Predicted scores after the roadmap

| Tier | Now | After P0–P1 | After P0–P3 |
|---|:--:|:--:|:--:|
| Admin / back-office | 8.0 | 8.2 | 8.5 |
| Collaboration | 7.0 | 7.6 | 8.2 |
| AI / Knowledge (moat) | 6.2 | 7.6 | 8.4 |
| Platform / observability | 6.8 | 7.2 | 8.0 |
| **Overall** | **6.6** | **7.5** | **8.3** |

**Bottom line:** the platform is broader and better-engineered than its stage suggests. The fastest credibility win is finishing Messages; the highest *strategic* return is building the evaluation harness that converts the Brain from a great story into a measurable moat. Resist adding feature #50 until the learning loop can prove it improves.
