-- ============================================================
-- 135_coach_structured_actions.sql
-- Schema-backed Coach previews and exactly-once action receipts.
-- ============================================================

ALTER TABLE coach_turns
  ADD COLUMN IF NOT EXISTS action_draft JSONB
    CHECK (action_draft IS NULL OR jsonb_typeof(action_draft) = 'object'),
  ADD COLUMN IF NOT EXISTS action_status TEXT NOT NULL DEFAULT 'none'
    CHECK (action_status IN ('none','draft','processing','completed','failed')),
  ADD COLUMN IF NOT EXISTS action_completed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS coach_action_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key UUID NOT NULL UNIQUE,
  turn_id UUID NOT NULL REFERENCES coach_turns(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'create_task','send_message','update_task','submit_review','review_task'
  )),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','completed','failed')),
  result JSONB CHECK (result IS NULL OR jsonb_typeof(result) = 'object'),
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS coach_action_receipts_owner_time
  ON coach_action_receipts (owner_id, created_at DESC);

ALTER TABLE coach_action_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS coach_action_receipts_owner_select ON coach_action_receipts;
CREATE POLICY coach_action_receipts_owner_select ON coach_action_receipts
  FOR SELECT USING (owner_id = auth.uid() AND client_id = current_user_client_id());

INSERT INTO schema_migrations (version)
VALUES ('135_coach_structured_actions.sql')
ON CONFLICT DO NOTHING;
