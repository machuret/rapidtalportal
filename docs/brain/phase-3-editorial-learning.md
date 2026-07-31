# Phase 3 — Editorial learning

Phase 3 teaches the Brain only from deliberate human feedback and editorial
changes. Publishing, approval and content performance are retained as workflow
lineage but never become learning signals.

## Editorial lineage

`content_editorial_events` keeps the generated draft, manual revisions, AI
rewrites, submitted version and approved version. Before/after text is tenant
isolated. Database triggers capture edits in the same transaction as the draft
update, and identify AI rewrites from the rewrite operation marker.

`editorial_learning_suggestions` stores meaningful change analysis separately
from the immutable event. Minor edits and one-off wording changes create no
suggestion.

## Change classification

The deterministic analyser considers hooks, length, vocabulary, voice,
promotional intensity, CTA, paragraph and sentence length, headings, lists,
emoji, point of view and claims.

It routes suggestions to one of:

- Brain preference or anti-pattern
- Company DNA correction
- Channel-style update
- Vault correction
- No reusable learning

Factual changes never become writing-style lessons.

## Explicit teaching

After a meaningful manual edit, the editor chooses:

- Use only for this draft
- Remember for the channel
- Remember for the content type
- Review the suggested lesson or correction
- Dismiss

The first action creates no signal. Remember/review actions create exact,
dimension-specific evidence but do not activate memory. A client administrator
or super administrator must approve permanent learning in the Brain learning
inbox. VA feedback can enter the inbox but cannot activate a lesson.

## Structured feedback

All Brain feedback uses visible reason controls and optional commentary. Signals
store their dimensions, channel, content type and explicit learning intent.
Distillation can create a lesson only in dimensions shared by its supporting
signals.

## Safety invariants

- Approval is workflow lineage, not positive feedback.
- Publishing and performance events are rejected by database trigger.
- Permanent editorial memory requires exact signal lineage and human approval.
- Original and edited text is protected by tenant RLS.
- Suggested DNA, style and Vault corrections are routed to their system of
  record instead of becoming prose memory.
