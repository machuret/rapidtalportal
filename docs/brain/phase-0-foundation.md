# Brain 3.0 Phase 0 foundation

Phase 0 defines the contract and baseline storage used by the later Brain
migration. It does not change the context supplied to any production model.

## Canonical data boundaries

| Information | System of record | Brain Context section |
| --- | --- | --- |
| Company identity, audience and goals | `company_dna` | `company` |
| Company knowledge | `vault_items` | `knowledge` |
| Approved owned writing style | `content_style_analyses` | `style` |
| Structured editorial rules | `company_dna.hard_rules` | `style.hardRules` |
| Approved editorial lessons | `brain_memory` | `memories` |
| Competitor and market synthesis | `competitor_intelligence_runs` | `market` |
| Explicit user feedback | `brain_signals` | Distillation input only |
| Published performance | `content_outcomes` | Reporting only |

These boundaries are also represented as code in
`lib/brain/data-boundaries.ts`. Production-performance data must not reinforce
Brain Memory, and competitor material must not become company knowledge or
owned style.

## Versioned context

`brain-context-v1` is a structured object, validated by
`lib/brain/context-contract.ts`. It contains:

- the task request;
- selected Company DNA fields;
- selected Vault passages;
- the resolved style and enforceable hard rules;
- selected Brain memories;
- optional market-intelligence insights;
- warnings;
- exact provenance.

The database stores the complete immutable snapshot and a generated SHA-256
hash in `brain_context_snapshots`. Later phases can link a snapshot to an Ask
answer, content topic, project, piece, Compose response or tool run.

## Baseline evaluation library

`brain_evaluation_cases` stores cases for:

- Ask questions;
- content ideas;
- content drafts;
- tools.

For each participating client, Phase 0 should record at least:

- five representative Ask questions;
- five content-idea requests;
- two briefs for every actively used content channel;
- two representative tool requests.

Every case records the input, expected context, current baseline output, model,
prompt version and optional context snapshot. Real client material must only be
captured where the client has approved its use for evaluation.

## Phase 1 compatibility

Phase 1 must adopt the contract behind independent feature flags. Until then:

- existing prompt builders continue unchanged;
- no context snapshots are written automatically;
- no current response shape changes;
- the evaluation tables are service-role only.
