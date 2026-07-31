# Brain 3.0 Phase 1 — unified context

Phase 1 replaces surface-specific prompt assembly with one structured resolver
shared by Next.js routes and Supabase Edge Functions.

## Runtime flow

1. Authenticate the user and fix the tenant boundary.
2. Build a `brain-context-v1` request for the current surface.
3. Resolve Company DNA, relevant factual Vault passages, approved channel style,
   structured hard rules, applicable Brain Memory and optional market
   intelligence.
4. Validate the object in Next.js runtimes and render labelled prompt sections.
5. Store the immutable snapshot and generated SHA-256 hash.
6. Generate the answer, idea, draft or tool output.
7. Link the saved artifact to the snapshot where the artifact is durable.

## Retrieval behaviour

- Ask and Content use gte-small semantic retrieval plus a deterministic lexical
  fallback.
- Ideas and Tools use deterministic lexical retrieval in Node. The existing
  OpenAI embeddings are deliberately not sent to `match_vault_chunks`, because
  they are not in the Vault's 384-dimension gte-small vector space.
- Explicit Content evidence is treated as an allow-list. An editor selecting
  zero sources receives zero factual Vault passages; the resolver does not
  silently add documents.
- Every selected item and chunk is recorded in `provenance`.

## Context boundaries

- Company DNA is company identity and declared positioning.
- Factual Vault items are company knowledge.
- Approved owned style analysis and Company DNA style fields are writing
  instructions, not factual sources.
- Structured hard rules remain separate for deterministic enforcement.
- Brain Memory is scoped to the current surface.
- Competitor intelligence is rendered only as market inspiration and is never
  merged into company facts or owned style.

## Style authority

The resolver records the first applicable source in this order:

1. frozen project snapshot;
2. approved channel analysis;
3. Company DNA channel style;
4. Company DNA global style;
5. generic professional fallback.

Style-analysis rows receive stable per-client, per-channel version numbers from
migration 121.

## Rollout and rollback

`brain_context_feature_flags` independently controls:

- Ask;
- Content drafts;
- Ideas;
- Tools.

Once migration 121 exists, a missing client flag row means Phase 1 is enabled.
Setting a surface flag to `false` immediately restores that surface's legacy
context path without redeploying.

## Provenance continuity

- generated ideas return a snapshot ID;
- saving an idea stores the ID on `content_topics`;
- promoting that idea copies it to the project and freezes it in the idea
  snapshot;
- draft generation creates a fresh context snapshot, includes it in the style
  snapshot and links the project/piece;
- tool runs link their exact snapshot;
- Ask returns the snapshot ID in JSON or the
  `X-Brain-Context-Snapshot` streaming header.
