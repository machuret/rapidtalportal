-- ============================================================
-- 143_private_coach_usage_metrics.sql
-- Count-only Coach usage for readiness and product health. No question,
-- answer, source excerpt or user identity is stored in this aggregate.
-- ============================================================

CREATE TABLE IF NOT EXISTS coach_question_metrics_daily (
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL,
  coach_role TEXT NOT NULL CHECK (coach_role IN ('client','va')),
  answer_mode TEXT NOT NULL CHECK (answer_mode IN ('concise','deep')),
  answered BOOLEAN NOT NULL,
  question_count INTEGER NOT NULL DEFAULT 0 CHECK (question_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (client_id, metric_date, coach_role, answer_mode, answered)
);

CREATE INDEX IF NOT EXISTS coach_question_metrics_client_date
  ON coach_question_metrics_daily (client_id, metric_date DESC);

ALTER TABLE coach_question_metrics_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE coach_question_metrics_daily FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE coach_question_metrics_daily FROM service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE coach_question_metrics_daily TO service_role;

CREATE OR REPLACE FUNCTION record_coach_question_metric(
  p_client_id UUID,
  p_coach_role TEXT,
  p_answer_mode TEXT,
  p_answered BOOLEAN,
  p_timezone TEXT DEFAULT 'UTC'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_timezone TEXT;
  v_metric_date DATE;
BEGIN
  IF p_coach_role NOT IN ('client','va') OR p_answer_mode NOT IN ('concise','deep') THEN
    RAISE EXCEPTION 'Invalid Coach metric dimensions.' USING ERRCODE = '22023';
  END IF;
  SELECT name INTO v_timezone FROM pg_timezone_names WHERE name = p_timezone;
  v_timezone := coalesce(v_timezone, 'UTC');
  v_metric_date := (clock_timestamp() AT TIME ZONE v_timezone)::DATE;

  INSERT INTO coach_question_metrics_daily (
    client_id, metric_date, coach_role, answer_mode, answered, question_count, updated_at
  ) VALUES (
    p_client_id, v_metric_date, p_coach_role, p_answer_mode, p_answered, 1, clock_timestamp()
  )
  ON CONFLICT (client_id, metric_date, coach_role, answer_mode, answered)
  DO UPDATE SET
    question_count = coach_question_metrics_daily.question_count + 1,
    updated_at = clock_timestamp();
END;
$$;

REVOKE ALL ON FUNCTION record_coach_question_metric(UUID, TEXT, TEXT, BOOLEAN, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_coach_question_metric(UUID, TEXT, TEXT, BOOLEAN, TEXT)
  TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('143_private_coach_usage_metrics.sql')
ON CONFLICT DO NOTHING;
