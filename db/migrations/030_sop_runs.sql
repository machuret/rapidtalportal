-- ============================================================
-- 030_sop_runs.sql – Track SOP usage (which SOPs VAs actually run/complete)
-- Run in Supabase SQL Editor after 029_seed_global_sops.sql
--
-- Lets the admin see adoption of the SOP library — runs, completions, distinct
-- VAs, last used — so effort on great SOPs is measurable, and supervision sees
-- what VAs are doing. One row per run session. Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS sop_runs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_id      UUID NOT NULL REFERENCES sops(id) ON DELETE CASCADE,
  client_id   UUID REFERENCES clients(id) ON DELETE SET NULL,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'completed')),
  steps_total INT NOT NULL DEFAULT 0,
  steps_done  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sop_runs_sop_idx    ON sop_runs (sop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sop_runs_client_idx ON sop_runs (client_id, created_at DESC);

ALTER TABLE sop_runs ENABLE ROW LEVEL SECURITY;

-- super_admin sees all; client members see their own client's runs.
DROP POLICY IF EXISTS "sop_runs_select" ON sop_runs;
CREATE POLICY "sop_runs_select"
  ON sop_runs FOR SELECT
  USING (current_user_role() = 'super_admin' OR client_id = current_user_client_id());
