-- ============================================================
-- 133_role_aware_coach_context.sql
-- Version the official Brain resolver after adding authenticated role,
-- visibility and role-scoped operational evidence to every Coach snapshot.
-- ============================================================

ALTER TABLE brain_context_snapshots
  DROP CONSTRAINT IF EXISTS brain_context_snapshots_resolver_version_check;

ALTER TABLE brain_context_snapshots
  ADD CONSTRAINT brain_context_snapshots_resolver_version_check
  CHECK (
    resolver_version IN (
      'resolver-v1',
      'resolver-v2-task-memory',
      'resolver-v3-business-library',
      'resolver-v4-library-availability',
      'resolver-v5-role-aware-coach'
    )
  );

INSERT INTO schema_migrations (version)
VALUES ('133_role_aware_coach_context.sql')
ON CONFLICT DO NOTHING;
