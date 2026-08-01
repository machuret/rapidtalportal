-- ============================================================
-- 138_coach_goals_and_commitments.sql
-- Phase 3: explicit, owner-private coaching goals, commitments and leased
-- check-ins. Coaching state survives individual conversations and is only
-- changed after an authenticated user confirms it.
-- ============================================================

ALTER TABLE brain_context_snapshots
  DROP CONSTRAINT IF EXISTS brain_context_snapshots_resolver_version_check;
ALTER TABLE brain_context_snapshots
  ADD CONSTRAINT brain_context_snapshots_resolver_version_check
  CHECK (resolver_version IN (
    'resolver-v1','resolver-v2-task-memory','resolver-v3-business-library',
    'resolver-v4-library-availability','resolver-v5-role-aware-coach',
    'resolver-v6-coach-operations','resolver-v7-coach-progress'
  ));

CREATE TABLE IF NOT EXISTS coach_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 300),
  outcome TEXT NOT NULL DEFAULT '' CHECK (length(outcome) <= 4000),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','paused','achieved','abandoned')),
  progress SMALLINT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  target_date DATE,
  source_turn_id UUID REFERENCES coach_turns(id) ON DELETE SET NULL,
  achieved_at TIMESTAMPTZ,
  retention_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, client_id, owner_id),
  CHECK ((status = 'achieved' AND progress = 100 AND achieved_at IS NOT NULL)
    OR status <> 'achieved')
);

CREATE INDEX IF NOT EXISTS coach_goals_owner_status
  ON coach_goals (owner_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS coach_goals_retention
  ON coach_goals (retention_until) WHERE retention_until IS NOT NULL;

CREATE TABLE IF NOT EXISTS coach_commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id UUID,
  commitment TEXT NOT NULL CHECK (length(btrim(commitment)) BETWEEN 1 AND 1000),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','completed','snoozed','dismissed')),
  due_date DATE,
  next_check_in_at TIMESTAMPTZ,
  last_check_in_at TIMESTAMPTZ,
  check_in_claim_token UUID,
  check_in_claimed_until TIMESTAMPTZ,
  reminder_count SMALLINT NOT NULL DEFAULT 0 CHECK (reminder_count BETWEEN 0 AND 100),
  source_turn_id UUID REFERENCES coach_turns(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  retention_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT coach_commitments_goal_owner_fkey
    FOREIGN KEY (goal_id, client_id, owner_id)
    REFERENCES coach_goals(id, client_id, owner_id) ON DELETE SET NULL (goal_id),
  CHECK ((status = 'completed' AND completed_at IS NOT NULL) OR status <> 'completed')
);

CREATE INDEX IF NOT EXISTS coach_commitments_owner_status
  ON coach_commitments (owner_id, status, due_date, updated_at DESC);
CREATE INDEX IF NOT EXISTS coach_commitments_due_check_in
  ON coach_commitments (next_check_in_at)
  WHERE status IN ('open','snoozed') AND next_check_in_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS coach_commitments_retention
  ON coach_commitments (retention_until) WHERE retention_until IS NOT NULL;

CREATE TABLE IF NOT EXISTS coach_progress_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id UUID REFERENCES coach_goals(id) ON DELETE CASCADE,
  commitment_id UUID REFERENCES coach_commitments(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'goal_created','goal_updated','goal_achieved','goal_paused','goal_abandoned',
    'commitment_created','commitment_completed','commitment_snoozed',
    'commitment_dismissed','commitment_reopened','check_in_sent'
  )),
  detail JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(detail) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK ((goal_id IS NOT NULL)::INT + (commitment_id IS NOT NULL)::INT >= 1)
);

CREATE INDEX IF NOT EXISTS coach_progress_events_owner_time
  ON coach_progress_events (owner_id, created_at DESC);

ALTER TABLE coach_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_progress_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coach_goals_owner_select ON coach_goals;
CREATE POLICY coach_goals_owner_select ON coach_goals FOR SELECT
  USING (owner_id = auth.uid() AND client_id = current_user_client_id());
DROP POLICY IF EXISTS coach_commitments_owner_select ON coach_commitments;
CREATE POLICY coach_commitments_owner_select ON coach_commitments FOR SELECT
  USING (owner_id = auth.uid() AND client_id = current_user_client_id());
DROP POLICY IF EXISTS coach_progress_events_owner_select ON coach_progress_events;
CREATE POLICY coach_progress_events_owner_select ON coach_progress_events FOR SELECT
  USING (owner_id = auth.uid() AND client_id = current_user_client_id());

REVOKE INSERT, UPDATE, DELETE ON coach_goals FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON coach_commitments FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON coach_progress_events FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION create_coach_goal(
  p_client_id UUID, p_owner_id UUID, p_title TEXT, p_outcome TEXT DEFAULT '',
  p_target_date DATE DEFAULT NULL, p_source_turn_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_goal coach_goals%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_owner_id AND client_id = p_client_id) THEN
    RAISE EXCEPTION 'coach_owner_forbidden';
  END IF;
  IF nullif(btrim(p_title), '') IS NULL THEN RAISE EXCEPTION 'coach_goal_invalid'; END IF;
  IF p_source_turn_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM coach_turns WHERE id = p_source_turn_id
      AND client_id = p_client_id AND owner_id = p_owner_id
  ) THEN RAISE EXCEPTION 'coach_turn_mismatch'; END IF;
  INSERT INTO coach_goals (client_id, owner_id, title, outcome, target_date, source_turn_id)
  VALUES (p_client_id, p_owner_id, left(btrim(p_title), 300),
    left(coalesce(btrim(p_outcome), ''), 4000), p_target_date, p_source_turn_id)
  RETURNING * INTO v_goal;
  INSERT INTO coach_progress_events (client_id, owner_id, goal_id, event_type, detail)
  VALUES (p_client_id, p_owner_id, v_goal.id, 'goal_created',
    jsonb_build_object('title', v_goal.title, 'targetDate', v_goal.target_date));
  RETURN to_jsonb(v_goal);
END;
$$;

CREATE OR REPLACE FUNCTION update_coach_goal(
  p_client_id UUID, p_owner_id UUID, p_goal_id UUID, p_status TEXT,
  p_progress SMALLINT, p_target_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_goal coach_goals%ROWTYPE; v_event TEXT;
BEGIN
  SELECT * INTO v_goal FROM coach_goals
  WHERE id = p_goal_id AND client_id = p_client_id AND owner_id = p_owner_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'coach_goal_not_found'; END IF;
  IF p_status NOT IN ('active','paused','achieved','abandoned') OR p_progress NOT BETWEEN 0 AND 100 THEN
    RAISE EXCEPTION 'coach_goal_invalid';
  END IF;
  IF p_status = 'achieved' THEN p_progress := 100; END IF;
  UPDATE coach_goals SET status = p_status, progress = p_progress,
    target_date = p_target_date, achieved_at = CASE WHEN p_status = 'achieved'
      THEN coalesce(achieved_at, clock_timestamp()) ELSE NULL END,
    retention_until = CASE WHEN p_status IN ('achieved','abandoned')
      THEN clock_timestamp() + interval '365 days' ELSE NULL END,
    updated_at = clock_timestamp()
  WHERE id = p_goal_id RETURNING * INTO v_goal;
  v_event := CASE p_status WHEN 'achieved' THEN 'goal_achieved'
    WHEN 'paused' THEN 'goal_paused' WHEN 'abandoned' THEN 'goal_abandoned'
    ELSE 'goal_updated' END;
  INSERT INTO coach_progress_events (client_id, owner_id, goal_id, event_type, detail)
  VALUES (p_client_id, p_owner_id, v_goal.id, v_event,
    jsonb_build_object('progress', v_goal.progress, 'targetDate', v_goal.target_date));
  RETURN to_jsonb(v_goal);
END;
$$;

CREATE OR REPLACE FUNCTION create_coach_commitment(
  p_client_id UUID, p_owner_id UUID, p_commitment TEXT, p_goal_id UUID DEFAULT NULL,
  p_due_date DATE DEFAULT NULL, p_check_in_date DATE DEFAULT NULL,
  p_source_turn_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_commitment coach_commitments%ROWTYPE; v_timezone TEXT; v_next_check_in_at TIMESTAMPTZ;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_owner_id AND client_id = p_client_id) THEN
    RAISE EXCEPTION 'coach_owner_forbidden';
  END IF;
  IF nullif(btrim(p_commitment), '') IS NULL THEN RAISE EXCEPTION 'coach_commitment_invalid'; END IF;
  IF p_goal_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM coach_goals WHERE id = p_goal_id
      AND client_id = p_client_id AND owner_id = p_owner_id AND status IN ('active','paused')
  ) THEN RAISE EXCEPTION 'coach_goal_not_found'; END IF;
  IF p_source_turn_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM coach_turns WHERE id = p_source_turn_id
      AND client_id = p_client_id AND owner_id = p_owner_id
  ) THEN RAISE EXCEPTION 'coach_turn_mismatch'; END IF;
  SELECT coalesce((SELECT name FROM pg_timezone_names WHERE name = users.timezone), 'UTC')
    INTO v_timezone FROM users WHERE id = p_owner_id;
  v_next_check_in_at := CASE WHEN p_check_in_date IS NULL THEN NULL
    ELSE (p_check_in_date + time '09:00') AT TIME ZONE v_timezone END;
  INSERT INTO coach_commitments (
    client_id, owner_id, goal_id, commitment, due_date, next_check_in_at, source_turn_id
  ) VALUES (
    p_client_id, p_owner_id, p_goal_id, left(btrim(p_commitment), 1000),
    p_due_date, v_next_check_in_at, p_source_turn_id
  ) RETURNING * INTO v_commitment;
  INSERT INTO coach_progress_events (client_id, owner_id, commitment_id, goal_id, event_type, detail)
  VALUES (p_client_id, p_owner_id, v_commitment.id, v_commitment.goal_id,
    'commitment_created', jsonb_build_object('dueDate', v_commitment.due_date,
      'nextCheckInAt', v_commitment.next_check_in_at));
  RETURN to_jsonb(v_commitment);
END;
$$;

CREATE OR REPLACE FUNCTION update_coach_commitment(
  p_client_id UUID, p_owner_id UUID, p_commitment_id UUID, p_status TEXT,
  p_due_date DATE DEFAULT NULL, p_check_in_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_commitment coach_commitments%ROWTYPE; v_event TEXT; v_timezone TEXT; v_next_check_in_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_commitment FROM coach_commitments
  WHERE id = p_commitment_id AND client_id = p_client_id AND owner_id = p_owner_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'coach_commitment_not_found'; END IF;
  IF p_status NOT IN ('open','completed','snoozed','dismissed') THEN
    RAISE EXCEPTION 'coach_commitment_invalid';
  END IF;
  SELECT coalesce((SELECT name FROM pg_timezone_names WHERE name = users.timezone), 'UTC')
    INTO v_timezone FROM users WHERE id = p_owner_id;
  v_next_check_in_at := CASE WHEN p_check_in_date IS NULL THEN NULL
    ELSE (p_check_in_date + time '09:00') AT TIME ZONE v_timezone END;
  UPDATE coach_commitments SET status = p_status, due_date = p_due_date,
    next_check_in_at = CASE WHEN p_status IN ('completed','dismissed') THEN NULL
      ELSE v_next_check_in_at END,
    completed_at = CASE WHEN p_status = 'completed'
      THEN coalesce(completed_at, clock_timestamp()) ELSE NULL END,
    retention_until = CASE WHEN p_status IN ('completed','dismissed')
      THEN clock_timestamp() + interval '365 days' ELSE NULL END,
    check_in_claim_token = NULL, check_in_claimed_until = NULL,
    updated_at = clock_timestamp()
  WHERE id = p_commitment_id RETURNING * INTO v_commitment;
  v_event := CASE p_status WHEN 'completed' THEN 'commitment_completed'
    WHEN 'snoozed' THEN 'commitment_snoozed' WHEN 'dismissed' THEN 'commitment_dismissed'
    ELSE 'commitment_reopened' END;
  INSERT INTO coach_progress_events (client_id, owner_id, commitment_id, goal_id, event_type, detail)
  VALUES (p_client_id, p_owner_id, v_commitment.id, v_commitment.goal_id, v_event,
    jsonb_build_object('dueDate', v_commitment.due_date,
      'nextCheckInAt', v_commitment.next_check_in_at));
  RETURN to_jsonb(v_commitment);
END;
$$;

CREATE OR REPLACE FUNCTION claim_due_coach_check_ins(p_limit INT DEFAULT 100)
RETURNS SETOF coach_commitments
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_token UUID := gen_random_uuid();
BEGIN
  RETURN QUERY
  WITH due AS MATERIALIZED (
    SELECT id FROM coach_commitments
    WHERE status IN ('open','snoozed') AND next_check_in_at <= clock_timestamp()
      AND (check_in_claimed_until IS NULL OR check_in_claimed_until <= clock_timestamp())
    ORDER BY next_check_in_at ASC FOR UPDATE SKIP LOCKED
    LIMIT greatest(1, least(coalesce(p_limit, 100), 500))
  )
  UPDATE coach_commitments commitment_row
  SET check_in_claim_token = v_token,
      check_in_claimed_until = clock_timestamp() + interval '10 minutes'
  FROM due WHERE commitment_row.id = due.id RETURNING commitment_row.*;
END;
$$;

CREATE OR REPLACE FUNCTION complete_coach_check_in(
  p_commitment_id UUID, p_claim_token UUID, p_delivered BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row coach_commitments%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM coach_commitments WHERE id = p_commitment_id
    AND check_in_claim_token = p_claim_token FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_delivered THEN
    UPDATE coach_commitments SET last_check_in_at = clock_timestamp(), next_check_in_at = NULL,
      reminder_count = least(100, reminder_count + 1), status = 'open',
      check_in_claim_token = NULL, check_in_claimed_until = NULL, updated_at = clock_timestamp()
    WHERE id = p_commitment_id;
    INSERT INTO coach_progress_events (client_id, owner_id, commitment_id, goal_id, event_type, detail)
    VALUES (v_row.client_id, v_row.owner_id, v_row.id, v_row.goal_id, 'check_in_sent',
      jsonb_build_object('scheduledFor', v_row.next_check_in_at));
  ELSE
    UPDATE coach_commitments SET check_in_claim_token = NULL, check_in_claimed_until = NULL
    WHERE id = p_commitment_id;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION deliver_coach_check_in(
  p_commitment_id UUID, p_claim_token UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row coach_commitments%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM coach_commitments WHERE id = p_commitment_id
    AND check_in_claim_token = p_claim_token
    AND check_in_claimed_until > clock_timestamp() FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO notifications (user_id, client_id, type, title, body, href)
  VALUES (v_row.owner_id, v_row.client_id, 'coach_check_in',
    'Coach check-in', left(v_row.commitment, 1000), '/ask');
  UPDATE coach_commitments SET last_check_in_at = clock_timestamp(), next_check_in_at = NULL,
    reminder_count = least(100, reminder_count + 1), status = 'open',
    check_in_claim_token = NULL, check_in_claimed_until = NULL, updated_at = clock_timestamp()
  WHERE id = p_commitment_id;
  INSERT INTO coach_progress_events (client_id, owner_id, commitment_id, goal_id, event_type, detail)
  VALUES (v_row.client_id, v_row.owner_id, v_row.id, v_row.goal_id, 'check_in_sent',
    jsonb_build_object('scheduledFor', v_row.next_check_in_at));
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION create_coach_goal(UUID,UUID,TEXT,TEXT,DATE,UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION update_coach_goal(UUID,UUID,UUID,TEXT,SMALLINT,DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION create_coach_commitment(UUID,UUID,TEXT,UUID,DATE,DATE,UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION update_coach_commitment(UUID,UUID,UUID,TEXT,DATE,DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION claim_due_coach_check_ins(INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION complete_coach_check_in(UUID,UUID,BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION deliver_coach_check_in(UUID,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_coach_goal(UUID,UUID,TEXT,TEXT,DATE,UUID) TO service_role;
GRANT EXECUTE ON FUNCTION update_coach_goal(UUID,UUID,UUID,TEXT,SMALLINT,DATE) TO service_role;
GRANT EXECUTE ON FUNCTION create_coach_commitment(UUID,UUID,TEXT,UUID,DATE,DATE,UUID) TO service_role;
GRANT EXECUTE ON FUNCTION update_coach_commitment(UUID,UUID,UUID,TEXT,DATE,DATE) TO service_role;
GRANT EXECUTE ON FUNCTION claim_due_coach_check_ins(INT) TO service_role;
GRANT EXECUTE ON FUNCTION complete_coach_check_in(UUID,UUID,BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION deliver_coach_check_in(UUID,UUID) TO service_role;

CREATE OR REPLACE FUNCTION purge_expired_coach_private_data()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_deleted INTEGER := 0; v_rows INTEGER := 0;
BEGIN
  DELETE FROM vault_queries WHERE visibility = 'private_coach'
    AND retention_until IS NOT NULL AND retention_until <= clock_timestamp();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  DELETE FROM coach_turns turn_row USING coach_threads thread_row
  WHERE turn_row.thread_id = thread_row.id
    AND turn_row.created_at < clock_timestamp() - make_interval(days => thread_row.retention_days);
  GET DIAGNOSTICS v_rows = ROW_COUNT; v_deleted := v_deleted + v_rows;
  DELETE FROM coach_action_previews WHERE expires_at <= clock_timestamp()
    AND status IN ('draft','failed');
  GET DIAGNOSTICS v_rows = ROW_COUNT; v_deleted := v_deleted + v_rows;
  DELETE FROM coach_commitments WHERE retention_until IS NOT NULL
    AND retention_until <= clock_timestamp();
  GET DIAGNOSTICS v_rows = ROW_COUNT; v_deleted := v_deleted + v_rows;
  DELETE FROM coach_goals WHERE retention_until IS NOT NULL
    AND retention_until <= clock_timestamp();
  GET DIAGNOSTICS v_rows = ROW_COUNT; v_deleted := v_deleted + v_rows;
  RETURN v_deleted;
END;
$$;
REVOKE ALL ON FUNCTION purge_expired_coach_private_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION purge_expired_coach_private_data() TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('138_coach_goals_and_commitments.sql')
ON CONFLICT DO NOTHING;
