-- ============================================================
-- 126_brain_context_snapshot_compatibility.sql
-- Keep immutable Brain provenance compatible with the task-aware resolver.
--
-- Migration 120 pinned resolver_version to resolver-v1. The task-aware runtime
-- now writes resolver-v2-task-memory snapshots, so the old constraint rejects
-- every new snapshot and can block content idea generation.
-- ============================================================

ALTER TABLE brain_context_snapshots
  DROP CONSTRAINT IF EXISTS brain_context_snapshots_resolver_version_check;

ALTER TABLE brain_context_snapshots
  ADD CONSTRAINT brain_context_snapshots_resolver_version_check
  CHECK (
    resolver_version IN (
      'resolver-v1',
      'resolver-v2-task-memory'
    )
  );

INSERT INTO schema_migrations (version)
VALUES ('126_brain_context_snapshot_compatibility.sql')
ON CONFLICT DO NOTHING;
