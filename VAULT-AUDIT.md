# Vault Audit — "The Company Brain" (June 2026)

**Goal of this audit:** assess the Vault against the intended vision —
*a company brain that ingests everything you know about a business and turns it into a
living report the VA can use: who we are, our services, contacts, flows/processes, policies…
and the more you add, the more it understands.*

**Verdict (short version):** Today the Vault is a **document store with per-document AI
tagging + a manual batch FAQ generator**. It is **not yet a "brain"**: there is no semantic
index, no continuous/incremental learning, no synthesized company report, and several
ingestion paths don't index at all. It works as a "feed documents → click Regenerate →
get a flat Q&A list," but it does not *understand and report on the company* the way the
vision describes. The good news: the foundations (categorisation, Company DNA, generation
plumbing) are a reasonable base to build the brain on.

---

## 1. How it works today (verified from code)

### 1.1 Data model
`vault_items` (`db/migrations/001`, `011`, `015`):

| Column | Purpose |
|---|---|
| `source_type` | `pdf` \| `docx` \| `text` \| `url` |
| `raw_content` | **the entire document as one text blob** (no chunking) |
| `status` | `pending` \| `processing` \| `ready` \| `error` |
| `category` | AI-assigned, **one of 6**: process, policy, service, contact, reference, general |
| `tags` | AI-assigned keyword array |
| `ai_summary` | AI 2–3 sentence summary |
| `content_hash` | SHA-256 of text, for **exact** dedup |

Related: `company_dna` (structured company profile, 1 per client), `kb_entries`
(generated Q&A), `kb_generation_runs` (audit of generations).

### 1.2 Ingestion paths
| Path | Route | Parses | Computes hash? | Auto-indexes (summary/category/tags)? |
|---|---|---|---|---|
| File upload | `/api/vault/upload` | pdf-parse / mammoth / utf8 | ✅ | Tries to (fire-and-forget trigger — **see 3.1**) |
| URL | `/api/vault/url` | (server) | — | Tries to (same trigger) |
| Paste text | `/api/vault/text` | n/a | ❌ | **❌ never** — stored raw, no metadata |
| Crawl | `/api/vault/crawl` → `vault-crawl` edge fn | Firecrawl **single-page** `/scrape` | — | ✅ computed inline on insert |

### 1.3 "Indexing" = LLM metadata tagging (`vault-process` edge fn)
For one item: send `raw_content.slice(0, 15000)` to `gpt-4o-mini`, get back
`{ai_summary, category, tags}`, store on the row. **That is the entire index.**
There is **no embedding, no vector store, no chunk index, no full-text index** — confirmed:
a repo-wide search for `embedding|pgvector|vector(|similarity|text-embedding` returns nothing.

### 1.4 "Learning" = manual batch regeneration (`kb-generate` edge fn)
On clicking **Regenerate** (admin only):
1. Fetch **≤ 50** `ready` vault items + Company DNA.
2. Concatenate into one big prompt, grouped by category, truncated to ~240k chars.
3. One `gpt-4o-mini` call → 25–60 Q&A pairs.
4. **Insert new entries, then delete all previous ones** (wholesale replace).

### 1.5 Retrieval / how the VA consumes it
- **Knowledge Base page** = a flat list of the last-generated Q&A entries.
- **Content generator** (`content-generate`) pulls ≤30 items → top 15 by category → uses
  `ai_summary` + `raw_content.slice(0,1500–3000)` in one prompt.
- The VA can open individual vault items and read them.
- There is **no "ask the vault" search** and **no company report/overview** screen.

```
ADD                INDEX (per-doc)        LEARN (manual, batch)      VA SEES
upload/url ─┐      gpt-4o-mini:           gpt-4o-mini over ≤50       • flat Q&A list
text ───────┼────► summary+category+tags  docs → 25-60 Q&A,          • raw documents
crawl ──────┘      (text path: skipped)   WIPE + REPLACE KB          • (no search, no report)
```

---

## 2. Measured against the "company brain" vision

| Vision | Today | Gap |
|---|---|---|
| A **living report** of the company | A flat Q&A list, regenerated manually | **No report view**; no narrative of "how the company works" |
| **What we know / services / contacts / flows** as organised knowledge | 6 coarse categories on raw docs; no per-area rollup | No consolidated **Service catalog**, **Contact directory**, **Process/flow playbook** |
| **"The more we add, the more it understands"** | Adding does nothing until a manual, admin-only Regenerate | **No incremental learning**; growth is invisible until a wipe-and-replace run |
| Ask the brain a question | — | **No semantic search / Q&A over the corpus** |
| Scales with the business | Hard caps: 50 docs, 15k-char processing window, ~240k-char KB context | **Silently drops content** past the cap; large docs truncated |

**Bottom line:** the pieces that would make it a brain — semantic retrieval, continuous
ingestion-to-knowledge, and a synthesized report — are the ones that don't exist yet.

---

## 3. Findings (bugs & limitations)

| # | Severity | Finding |
|---|---|---|
| 3.1 | **High** | **Auto-indexing is likely broken.** `lib/vault-process-trigger.ts` calls the `vault-process` edge function with the **service-role key as the user Bearer**, but `vault-process` authenticates via `supabase.auth.getUser(jwt)`, which expects a *user* token. A service-role key has no user identity → `getUser()` returns no user → **401**. Since the trigger is fire-and-forget (errors only `console.warn`'d), uploaded/URL items may **never get `ai_summary`/`category`/`tags` automatically** — they only get indexed if someone manually hits "reprocess." *Verify in logs; if confirmed, this quietly starves every downstream feature.* |
| 3.2 | **High** | **Paste-text items are never indexed** (`/api/vault/text` doesn't call the trigger and doesn't compute `content_hash`). They sit at `category = null`, no summary, no dedup — and `null` category is lumped into "general" during generation. |
| 3.3 | **High** | **Regeneration destroys manual edits.** `kb-generate` deletes all prior `kb_entries` and inserts fresh ones. Any human-curated/edited answer (the `/api/kb/entries/[id]` edit feature) is wiped on the next run. This is the opposite of "learning." |
| 3.4 | **Med** | **Hard scaling ceilings, silent.** KB caps at 50 items (sorted by "has summary," then recency); content at 15; per-doc processing reads only the first 15k chars; KB context truncated at ~240k chars. A growing vault **silently** stops contributing — directly contradicting "the more we add, the more it understands." |
| 3.5 | **Med** | **No semantic retrieval (no RAG).** Everything is "dump top-N rows into one prompt." Without embeddings, the system can't find the *relevant* documents for a question/task — it just sends the most recent ones and hopes they fit. |
| 3.6 | **Med** | **"Crawl" is single-page.** `vault-crawl` and `company-dna-scrape` call Firecrawl `/scrape` (one page, `onlyMainContent`), not a site crawl — so "crawl a website into the vault" really ingests one URL. |
| 3.7 | **Med** | **No incremental/freshness model.** No "last indexed," no "stale since you added X," no re-summarise on content change beyond manual reprocess. KB `generated_at` is the only freshness signal and it's all-or-nothing. |
| 3.8 | **Low** | **Dedup is exact-match only** (SHA-256). Near-duplicates (same doc re-exported, lightly edited) create redundant context that eats the token budget. |
| 3.9 | **Low** | **6 fixed categories** are coarse for a "brain." There's no sub-structure (e.g., a contact's role/company, a service's price), so the report can't be richer than the categories. |

---

## 4. Recommended path to a real "Company Brain"

Ordered by leverage. Each step moves toward *understand → report → serve the VA*.

### Phase 1 — Make ingestion actually index (fixes, not features)
1. **Fix auto-processing (3.1).** Either (a) have the trigger mint a real user/service JWT the edge fn accepts, or (b) drop the HTTP hop and run the same metadata extraction inline in the route (like `vault-crawl` already does). Make failures visible (set `status='error'`), not silent.
2. **Index paste-text (3.2):** call the same extraction + compute `content_hash` in `/api/vault/text`.
3. **Stop wiping curated knowledge (3.3):** mark human-edited `kb_entries` as `pinned`/`edited` and **preserve them** across regeneration (regenerate only the auto rows; upsert by question similarity).

### Phase 2 — Give it memory that scales (the "brain")
4. **Add embeddings + `pgvector`.** Chunk `raw_content` (e.g. ~800-token chunks with overlap), embed each (`text-embedding-3-small`), store in a `vault_chunks` table with an IVFFlat/HNSW index. This removes the 50-item/240k-char cliff and is the foundation for everything below.
5. **Retrieval-augmented generation.** KB/content/“ask” all switch from "dump newest N" to "embed the query → fetch top-k relevant chunks → generate." Now relevance scales with corpus size instead of degrading.
6. **Incremental processing.** On every add/edit, chunk + embed just that item. Knowledge grows the moment something is added — literally "the more we add, the more it understands."

### Phase 3 — The report + the VA experience (the vision)
7. **"Company Report" / Brain view** — a synthesized, auto-updating overview the VA opens, generated from DNA + vault, organised as the user described:
   - **Identity** — who we are, mission, values (from DNA + reference docs)
   - **Services & Products** — a consolidated catalog (roll up all `service` items)
   - **Contacts directory** — people/suppliers/clients (roll up all `contact` items)
   - **Processes & Flows** — a playbook of how things are done (roll up all `process` items)
   - **Policies** — rules & guidelines (roll up all `policy` items)
   Each section cites its source vault items and shows "last updated."
8. **Completeness / coverage meter.** Score how well-known the company is and surface **gaps** ("No refund policy on file," "No onboarding process documented"). This makes the "more you add → more it knows" loop *visible* and tells admins/VAs exactly what to feed the brain next.
9. **"Ask the Vault."** A natural-language box (RAG over chunks) so a VA can ask *"what's our turnaround time for X?"* and get a cited answer — instead of scrolling a static FAQ.
10. **Auto-refresh the report/KB** on a schedule or on N new items, instead of a manual admin-only button.

### Phase 4 — Richer understanding (optional, later)
11. **Entity extraction** into structured tables (contacts, services with prices, tools) so the report can be precise and filterable, not just prose.
12. **Multi-page crawl** (Firecrawl `/crawl`) so "import our website" ingests the whole site.
13. **Semantic dedup** (embedding similarity) to collapse near-duplicates.

---

## 5. TL;DR for the team
- **What we have:** upload docs → AI tags each one → click Regenerate → get a flat FAQ. Plus a manual Company DNA form. No search, no report, no auto-learning, several inputs not indexed.
- **What's broken first (do now):** auto-indexing trigger (3.1), paste-text not indexed (3.2), regeneration wiping edits (3.3).
- **What makes it a brain (do next):** embeddings + chunking + RAG (Phase 2), then the synthesized **Company Report** with a coverage meter and an **Ask-the-Vault** box (Phase 3). That's the version that literally gets smarter every time the VA adds something — which is the vision.
