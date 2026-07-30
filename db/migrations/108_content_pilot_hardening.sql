-- ============================================================
-- 108_content_pilot_hardening.sql
-- Pilot cohort, durable analysis attempts, workflow telemetry and
-- explicit reviewer feedback. All access is through tenant-checked APIs.
-- ============================================================

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS content_pilot_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS content_pilot_started_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS content_analysis_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  analysis_kind TEXT NOT NULL CHECK (analysis_kind IN (
    'competitor_intelligence',
    'style_analysis',
    'content_generation',
    'voice_evaluation'
  )),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed')),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  related_id UUID,
  provider TEXT,
  model TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  estimated_cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0 CHECK (estimated_cost_usd >= 0),
  input_summary JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(input_summary) = 'object'),
  result_summary JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(result_summary) = 'object'),
  error_code TEXT,
  error_message TEXT CHECK (length(error_message) <= 4000),
  lease_token UUID NOT NULL DEFAULT gen_random_uuid(),
  lease_until TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '15 minutes'),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_analysis_attempts_client_time
  ON content_analysis_attempts (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS content_analysis_attempts_recovery
  ON content_analysis_attempts (status, lease_until)
  WHERE status = 'running';

ALTER TABLE content_analysis_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE content_analysis_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE content_analysis_attempts TO service_role;

CREATE TABLE IF NOT EXISTS content_workflow_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  project_id UUID REFERENCES content_projects(id) ON DELETE SET NULL,
  piece_id UUID REFERENCES content_pieces(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'idea_promoted',
    'brief_completed',
    'draft_generated',
    'draft_revised',
    'draft_approved',
    'validation_failed',
    'analysis_started',
    'analysis_succeeded',
    'analysis_failed'
  )),
  workflow_stage TEXT CHECK (workflow_stage IN (
    'discover', 'idea', 'brief', 'evidence', 'generate', 'edit',
    'validate', 'approve', 'complete'
  )),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_workflow_events_client_time
  ON content_workflow_events (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS content_workflow_events_project
  ON content_workflow_events (project_id, created_at);

ALTER TABLE content_workflow_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE content_workflow_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE content_workflow_events TO service_role;

CREATE TABLE IF NOT EXISTS content_pilot_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES content_projects(id) ON DELETE CASCADE,
  piece_id UUID REFERENCES content_pieces(id) ON DELETE SET NULL,
  reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  voice_accuracy SMALLINT NOT NULL CHECK (voice_accuracy BETWEEN 1 AND 5),
  idea_usefulness SMALLINT NOT NULL CHECK (idea_usefulness BETWEEN 1 AND 5),
  differentiation_quality SMALLINT NOT NULL CHECK (differentiation_quality BETWEEN 1 AND 5),
  source_trust SMALLINT NOT NULL CHECK (source_trust BETWEEN 1 AND 5),
  workflow_ease SMALLINT NOT NULL CHECK (workflow_ease BETWEEN 1 AND 5),
  notes TEXT CHECK (length(notes) <= 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS content_pilot_feedback_client_time
  ON content_pilot_feedback (client_id, updated_at DESC);

ALTER TABLE content_pilot_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE content_pilot_feedback FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE content_pilot_feedback TO service_role;

CREATE OR REPLACE FUNCTION finish_content_analysis_attempt(
  p_attempt_id UUID,
  p_lease_token UUID,
  p_status TEXT,
  p_related_id UUID DEFAULT NULL,
  p_provider TEXT DEFAULT NULL,
  p_model TEXT DEFAULT NULL,
  p_input_tokens INTEGER DEFAULT 0,
  p_output_tokens INTEGER DEFAULT 0,
  p_estimated_cost_usd NUMERIC DEFAULT 0,
  p_result_summary JSONB DEFAULT '{}'::jsonb,
  p_error_code TEXT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS content_analysis_attempts
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_attempt content_analysis_attempts;
BEGIN
  IF p_status NOT IN ('succeeded', 'failed') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid terminal analysis status.';
  END IF;

  UPDATE content_analysis_attempts
  SET
    status = p_status,
    related_id = COALESCE(p_related_id, related_id),
    provider = COALESCE(p_provider, provider),
    model = COALESCE(p_model, model),
    input_tokens = GREATEST(COALESCE(p_input_tokens, 0), 0),
    output_tokens = GREATEST(COALESCE(p_output_tokens, 0), 0),
    estimated_cost_usd = GREATEST(COALESCE(p_estimated_cost_usd, 0), 0),
    result_summary = COALESCE(p_result_summary, '{}'::jsonb),
    error_code = p_error_code,
    error_message = left(p_error_message, 4000),
    completed_at = clock_timestamp(),
    updated_at = clock_timestamp()
  WHERE id = p_attempt_id
    AND lease_token = p_lease_token
    AND status = 'running'
  RETURNING * INTO v_attempt;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Analysis attempt lease is stale or already completed.';
  END IF;
  RETURN v_attempt;
END;
$$;

REVOKE ALL ON FUNCTION finish_content_analysis_attempt(
  UUID, UUID, TEXT, UUID, TEXT, TEXT, INTEGER, INTEGER, NUMERIC, JSONB, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION finish_content_analysis_attempt(
  UUID, UUID, TEXT, UUID, TEXT, TEXT, INTEGER, INTEGER, NUMERIC, JSONB, TEXT, TEXT
) TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('108_content_pilot_hardening.sql')
ON CONFLICT DO NOTHING;
