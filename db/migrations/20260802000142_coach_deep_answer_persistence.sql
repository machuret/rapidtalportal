-- ============================================================
-- 20260802000142_coach_deep_answer_persistence.sql
-- Preserve the expensive, separately-grounded "Go deeper" answer on its
-- original private Coach turn so refresh never discards it.
-- ============================================================

ALTER TABLE coach_turns
  ADD COLUMN IF NOT EXISTS deep_answer TEXT,
  ADD COLUMN IF NOT EXISTS deep_brain_context_snapshot_id UUID,
  ADD COLUMN IF NOT EXISTS deep_sources JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS deep_suggestions JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS deep_library_availability TEXT NOT NULL DEFAULT 'not_requested',
  ADD COLUMN IF NOT EXISTS deep_warnings JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS deep_updated_at TIMESTAMPTZ;

ALTER TABLE coach_turns
  DROP CONSTRAINT IF EXISTS coach_turns_deep_answer_length,
  ADD CONSTRAINT coach_turns_deep_answer_length CHECK (
    deep_answer IS NULL OR length(btrim(deep_answer)) BETWEEN 1 AND 60000
  ),
  DROP CONSTRAINT IF EXISTS coach_turns_deep_sources_array,
  ADD CONSTRAINT coach_turns_deep_sources_array CHECK (jsonb_typeof(deep_sources) = 'array'),
  DROP CONSTRAINT IF EXISTS coach_turns_deep_suggestions_array,
  ADD CONSTRAINT coach_turns_deep_suggestions_array CHECK (jsonb_typeof(deep_suggestions) = 'array'),
  DROP CONSTRAINT IF EXISTS coach_turns_deep_warnings_array,
  ADD CONSTRAINT coach_turns_deep_warnings_array CHECK (jsonb_typeof(deep_warnings) = 'array'),
  DROP CONSTRAINT IF EXISTS coach_turns_deep_library_availability_check,
  ADD CONSTRAINT coach_turns_deep_library_availability_check CHECK (
    deep_library_availability IN ('available','degraded','unavailable','not_requested')
  ),
  DROP CONSTRAINT IF EXISTS coach_turns_deep_complete_check,
  ADD CONSTRAINT coach_turns_deep_complete_check CHECK (
    (deep_answer IS NULL AND deep_brain_context_snapshot_id IS NULL AND deep_updated_at IS NULL)
    OR
    (deep_answer IS NOT NULL AND deep_brain_context_snapshot_id IS NOT NULL AND deep_updated_at IS NOT NULL)
  );

ALTER TABLE coach_turns
  DROP CONSTRAINT IF EXISTS coach_turns_deep_snapshot_tenant_fkey;
ALTER TABLE coach_turns
  ADD CONSTRAINT coach_turns_deep_snapshot_tenant_fkey
  FOREIGN KEY (deep_brain_context_snapshot_id, client_id)
  REFERENCES brain_context_snapshots(id, client_id)
  ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS coach_turns_owner_deep_snapshot_unique
  ON coach_turns (owner_id, deep_brain_context_snapshot_id)
  WHERE deep_brain_context_snapshot_id IS NOT NULL;

INSERT INTO schema_migrations (version)
VALUES ('142_coach_deep_answer_persistence.sql')
ON CONFLICT DO NOTHING;
