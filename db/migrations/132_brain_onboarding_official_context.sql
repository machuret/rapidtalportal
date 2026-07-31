-- ============================================================
-- 132_brain_onboarding_official_context.sql
-- Make Company DNA drafting an official Brain Context surface. Onboarding
-- drafts now carry the same immutable provenance boundary as every other
-- Brain answer.
-- ============================================================

ALTER TABLE brain_context_snapshots
  DROP CONSTRAINT IF EXISTS brain_context_snapshots_surface_check;

ALTER TABLE brain_context_snapshots
  ADD CONSTRAINT brain_context_snapshots_surface_check
  CHECK (
    surface IN ('ask', 'content', 'compose', 'tool', 'diagnostic', 'onboard')
  );

ALTER TABLE brain_context_snapshots
  DROP CONSTRAINT IF EXISTS brain_context_snapshots_artifact_kind_check;

ALTER TABLE brain_context_snapshots
  ADD CONSTRAINT brain_context_snapshots_artifact_kind_check
  CHECK (
    artifact_kind IS NULL OR artifact_kind IN (
      'vault_answer', 'content_topic', 'content_project',
      'content_piece', 'tool_run', 'compose',
      'brain_diagnostic_run', 'brain_opportunity',
      'brain_onboarding_draft'
    )
  );

INSERT INTO schema_migrations (version)
VALUES ('132_brain_onboarding_official_context.sql')
ON CONFLICT DO NOTHING;
