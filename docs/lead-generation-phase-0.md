# Lead Generation — Phase 0 Actor Lab

## Purpose

Phase 0 validates external lead providers before any provider is allowed to write to RapidTal CRM. The customer-facing Lead Generation product starts in Phase 1.

## Provider contract

Every Actor must pass the same boundary:

1. Validate a bounded campaign request.
2. Translate it into provider-specific input.
3. Start an asynchronous run with `maxItems` and `maxTotalChargeUsd` limits.
4. Retain the run ID, dataset ID, Actor ID, Actor build and adapter version.
5. Normalize provider output into a company or person prospect.
6. Deduplicate before persistence.
7. Preserve the raw row and field-level source metadata for diagnostics.
8. Require deliberate promotion into CRM; raw provider rows never become CRM contacts automatically.

## Phase 0 candidates

| Source | Actor | Initial use | Status |
| --- | --- | --- | --- |
| Google Maps | `compass/crawler-google-places` | Australian local-business discovery | Approved for capped lab runs |
| Google Search | `apify/google-search-scraper` | Website/company discovery and coverage fallback | Approved for capped lab runs |
| LinkedIn profiles | `harvestapi/linkedin-profile-search` | Named decision-maker discovery | Approved for capped lab runs; Phase 3 product activation |

The registry is deliberately small. A new Actor cannot enter production by being referenced directly from a route; it must receive an adapter version, fixtures and contract tests.

## Lab sample matrix

Run 10–25 results per cell, with a maximum charge configured on every run.

| Industry | Location | Google Maps | Google Search | LinkedIn profiles |
| --- | --- | --- | --- | --- |
| Mortgage brokers | Sydney | Required | Required | Finance director / broker owner |
| Accountants | Melbourne | Required | Required | Partner / managing director |
| Commercial construction | Brisbane | Required | Required | Operations / finance director |

Record for each run:

- requested versus returned rows;
- usable company/person records;
- website, phone, email and LinkedIn coverage;
- duplicates within the run and across sources;
- location precision;
- elapsed time and actual provider charge;
- missing, renamed or unexpectedly typed fields;
- failed-run and empty-result behaviour.

## Selection gates

An Actor is eligible for a customer workflow only when:

- it returns usable results in at least two Australian industries;
- the adapter survives malformed and missing optional fields;
- cost and result count remain inside the configured cap;
- duplicates are deterministically recognized;
- a provider failure leaves a recoverable run rather than partial CRM data;
- its fixture and adapter contract tests pass;
- licensing and platform usage remain acceptable for the intended workflow.

## Live Actor Lab results — 3 August 2026

No lead values were written to the repository or printed by the lab. Costs below are the `usageTotalUsd` values reported by Apify for the completed runs.

| Source | Query | Location | Requested / usable | Coverage | Time | Reported cost |
| --- | --- | --- | --- | --- | ---: | ---: |
| Google Maps | Mortgage broker | Sydney | 5 / 5 | Website 100%, phone 100%, location 100% | 27.4s | $0.0202 |
| Google Maps | Accountant | Melbourne | 5 / 5 | Website 100%, phone 100%, location 100% | 17.5s | $0.0002 |
| Google Search | Commercial mortgage broker | Sydney | 10 / 9 | Title 100%, URL 100%; no phone/email | 10.9s | $0.0010 |
| Google Search | Commercial construction company | Brisbane | 10 / 11 raw | Title 100%, URL 100%; no phone/email | 8.3s | $0.0000 |
| LinkedIn profiles | Finance Director | Sydney, Australia | 5 / 0 | The broad location string produced an empty successful run | 11.4s | $0.0000 |
| LinkedIn profiles | Finance Director | Sydney | 5 / 5 | Person, company, LinkedIn and location 100% | 12.8s | $0.0000 |
| LinkedIn profiles | Managing Director | Melbourne | 5 / 5 | Person, company, LinkedIn and location 100% | 10.6s | $0.0000 |

Total provider-reported usage for the lab was **$0.0214**.

### Findings that changed the implementation

- Apify requires `maxTotalChargeUsd` to be at least USD $0.50 for the selected Maps and Search Actors. This is a ceiling, not the observed charge.
- Google Search returns one dataset row per SERP page, with leads nested in `organicResults`. Run-level `maxItems` therefore limits pages rather than normalized leads. RapidTal now applies the exact campaign limit after flattening and deduplication.
- The LinkedIn Actor returns employment in `currentPositions[]`, not a singular `currentPosition`. The adapter supports the live schema.
- LinkedIn location matching is sensitive to wording. The product should resolve a selected place to the Actor-compatible city label and show an actionable empty-result message.
- Maps provides strong company, website, phone and location coverage but no email or LinkedIn in these samples.
- LinkedIn Short mode provides strong person/company/profile coverage but no email or phone. Email discovery remains an explicit enrichment action, never an automatic part of discovery.
- Actor build IDs and adapter versions are part of output provenance; production jobs must retain them with the run and dataset IDs.

## Provider decision

| Source | Decision | Product role |
| --- | --- | --- |
| Google Maps | **Approved for Phase 1** | Primary Australian company discovery |
| Google Search | **Approved with exact post-normalization limit** | Website discovery and fallback coverage |
| LinkedIn profiles | **Adapter approved; activate in Phase 3** | Decision-maker discovery after company selection |

No all-in-one email enrichment Actor is approved yet. Provider discovery and enrichment remain separate so users can review company fit before paying for person-level data.

## Current implementation

- A typed provider registry for Maps, Search and LinkedIn.
- Versioned adapters and common normalized prospect records.
- Stable deduplication keys and source/run provenance.
- An asynchronous Apify client with spend limits, item limits, timeouts, polling, dataset paging and cancellation.
- Sanitized provider-shape fixtures and contract tests.
- Exact post-normalization result limits and strong provider-identity deduplication across runs.
- Signed provider webhooks reconcile paid runs when the initial response is lost.
- Automatic deduplication uses the strongest provider identity so shared branch domains or phones do not collapse distinct locations.
- Retry attempts are bounded with backoff, users can cancel active runs, and CRM promotion is idempotent for a prospect across campaigns.

Use the deliberately gated lab runner from a secure environment. It will not start without `--confirm-spend`, limits samples to 25 rows and applies Apify's minimum supported USD $0.50 run ceiling:

```bash
pnpm prospecting:actor-lab -- --source=google_maps --query="mortgage broker" --location="Sydney, Australia" --max-items=10 --max-charge-usd=0.50 --confirm-spend
```

The runner reports schema and coverage metrics only. It does not persist or print the collected lead records.
