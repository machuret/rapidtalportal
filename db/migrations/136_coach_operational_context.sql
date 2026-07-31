-- ============================================================
-- 136_coach_operational_context.sql
-- Admit the official resolver version that freezes authorised task history,
-- daily logs, deliverables and recipient-scoped communications.
-- ============================================================

ALTER TABLE brain_context_snapshots
  DROP CONSTRAINT IF EXISTS brain_context_snapshots_resolver_version_check;
ALTER TABLE brain_context_snapshots
  ADD CONSTRAINT brain_context_snapshots_resolver_version_check
  CHECK (resolver_version IN (
    'resolver-v1',
    'resolver-v2-task-memory',
    'resolver-v3-business-library',
    'resolver-v4-library-availability',
    'resolver-v5-role-aware-coach',
    'resolver-v6-coach-operations'
  ));

INSERT INTO schema_migrations (version)
VALUES ('136_coach_operational_context.sql')
ON CONFLICT DO NOTHING;
