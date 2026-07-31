# Brain 3.0 Phase 2 — task-aware memory

Phase 2 makes learned editorial guidance narrower, reviewable and traceable.

## Scope

New lessons use a structured scope with:

- surface: Ask, Content, Compose or Tool;
- channel: LinkedIn, Facebook, Instagram, email, blog or newsletter;
- content type;
- audience;
- objective;
- an explicit global flag.

Legacy flat scopes remain readable, but the distiller no longer emits them.
Scope expansion returns a lesson to review instead of silently changing
production behavior.

## Semantic ranking and prompt budget

`match_brain_memories` is service-role only and always filters by `client_id`
inside PostgreSQL. Its deterministic ranking is:

- 35% semantic relevance;
- 25% scope specificity;
- 15% pinned priority;
- 15% confidence;
- 10% independent reinforcement and freshness.

Applicable hard rules bypass the ordinary ranking limit. Runtime context then
caps memory at two pinned preferences, three other preferences, three
anti-patterns and one unresolved conflict warning.

## Approval and evidence

Every new lesson is `proposed`. The database activation guard requires:

- at least one exact linked signal;
- an approving user;
- an approval timestamp;
- no unresolved contradiction.

`brain_memory_sources` stores each supporting or contradicting signal, its exact
feedback excerpt and a SHA-256 hash. `source_count` is trigger-derived from
distinct supporting signals; the distillation batch size is never used.

## Conflicts and decay

Conflicting lessons enter `review_required` and are excluded from generated
context. Client admins and super admins can keep the existing lesson, replace
it, merge both, narrow their scopes or keep both under distinct scopes.

Decay considers time since confirmation, newer contradicting signals, style
profile changes and pinned status. Pinned hard rules never decay automatically.

## Deployment verification

Migration 122 was executed against Portal and verified with:

- execution privilege checks (`anon=false`, `authenticated=false`,
  `service_role=true`);
- two simultaneous lease workers claiming disjoint signal sets;
- a transactional commit producing one proposed lesson with three exact
  lineage links and `source_count=3`;
- cleanup of the isolated test tenant and all cascaded rows.
