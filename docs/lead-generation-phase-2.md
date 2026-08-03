# Lead Generation — Phase 2 Qualification and Company Enrichment

## Product boundary

Phase 2 helps a VA or client decide which discovered companies are worth pursuing before paying for person-level or email discovery. It does not activate the LinkedIn decision-maker adapter and it never pushes scraped rows into CRM automatically.

## Workflow

1. Describe the company type and location as before.
2. Optionally add an ideal-customer profile: required, preferred and excluded terms; minimum public rating/review count; and whether a website is required.
3. Review a transparent fit score for every result. The five dimensions are relevance, location, business proof, contactability and completeness.
4. Explicitly enrich a selected company's website. RapidTal crawls at most five same-domain pages through `apify/website-content-crawler`.
5. Review refreshed details and score, then shortlist, dismiss or deliberately add the company to CRM.

## Scoring contract

The score is deterministic and versioned as `prospecting-fit-v1`. A result cannot gain points from opaque model prose.

- Relevance: 35 points.
- Location: 20 points.
- Business proof: 15 points.
- Contactability: 15 points.
- Completeness: 15 points.
- An excluded term caps the score at 25.
- A missing required term caps the score at 49.
- A required-but-missing website caps the score at 35.

The complete dimension breakdown and a plain-language explanation are persisted with the campaign lead.

## Enrichment contract

- Enrichment is opt-in per lead and has a separate daily limit and spend ceiling.
- The existing leased Apify job system provides retry, cancellation, webhook reconciliation and recovery after navigation.
- Only same-domain pages are accepted.
- Full provider pages are not retained. RapidTal stores bounded excerpts, contact fields, page URLs, provenance and an immutable SHA-256 capture hash.
- A single lead cannot have two concurrent enrichment jobs.
- Enrichment snapshots are immutable, tenant-scoped and never become Vault or Company DNA material.

## Deferred to Phase 3

- Named decision-maker discovery using the already lab-tested LinkedIn profile adapter.
- Person-level enrichment and verified work-email discovery.
- Any bulk enrichment action that could spend across an entire lead list.
