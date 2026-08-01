-- ============================================================
-- 137_coach_action_integrity.sql
-- Coach hardening: immutable server previews, transactional/idempotent
-- execution, owner-read-only history, private-learning isolation.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS coach_action_previews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key UUID NOT NULL UNIQUE,
  brain_context_snapshot_id UUID NOT NULL
    REFERENCES brain_context_snapshots(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'create_task','send_message','update_task','submit_review','review_task'
  )),
  generated_payload JSONB NOT NULL CHECK (jsonb_typeof(generated_payload) = 'object'),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','processing','completed','failed')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (clock_timestamp() + interval '24 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS coach_action_previews_owner_time
  ON coach_action_previews (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS coach_action_previews_expiry
  ON coach_action_previews (expires_at) WHERE status IN ('draft','failed');

ALTER TABLE coach_action_previews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS coach_action_previews_owner_select ON coach_action_previews;
CREATE POLICY coach_action_previews_owner_select ON coach_action_previews
  FOR SELECT USING (owner_id = auth.uid() AND client_id = current_user_client_id());
REVOKE INSERT, UPDATE, DELETE ON coach_action_previews FROM PUBLIC, anon, authenticated;

-- Browser sessions may read their own Coach records, but all writes must pass
-- through authenticated server routes. This prevents direct history/action
-- mutation with a user's Supabase token.
DROP POLICY IF EXISTS coach_threads_owner_all ON coach_threads;
DROP POLICY IF EXISTS coach_threads_owner_select ON coach_threads;
CREATE POLICY coach_threads_owner_select ON coach_threads
  FOR SELECT USING (owner_id = auth.uid() AND client_id = current_user_client_id());
DROP POLICY IF EXISTS coach_turns_owner_all ON coach_turns;
DROP POLICY IF EXISTS coach_turns_owner_select ON coach_turns;
CREATE POLICY coach_turns_owner_select ON coach_turns
  FOR SELECT USING (owner_id = auth.uid() AND client_id = current_user_client_id());
REVOKE INSERT, UPDATE, DELETE ON coach_threads FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON coach_turns FROM PUBLIC, anon, authenticated;

ALTER TABLE coach_action_receipts
  ADD COLUMN IF NOT EXISTS payload_hash TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp();

UPDATE coach_action_receipts
SET payload_hash = encode(
  extensions.digest(convert_to(payload::TEXT, 'UTF8'), 'sha256'), 'hex'
)
WHERE payload_hash IS NULL;

ALTER TABLE coach_action_receipts
  ALTER COLUMN payload_hash SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'coach_action_receipts_payload_hash_valid'
  ) THEN
    ALTER TABLE coach_action_receipts
      ADD CONSTRAINT coach_action_receipts_payload_hash_valid
      CHECK (payload_hash ~ '^[0-9a-f]{64}$');
  END IF;
END $$;

-- Executes the confirmed payload and its receipt in one database transaction.
-- A failed inner block rolls back every task/message/event write, then records a
-- retryable failure. Replays require the exact same canonical JSON payload.
CREATE OR REPLACE FUNCTION execute_coach_action(
  p_idempotency_key UUID,
  p_turn_id UUID,
  p_client_id UUID,
  p_owner_id UUID,
  p_snapshot_id UUID,
  p_action JSONB
)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_preview coach_action_previews%ROWTYPE;
  v_receipt coach_action_receipts%ROWTYPE;
  v_role TEXT;
  v_action_type TEXT := p_action->>'type';
  v_payload_hash TEXT;
  v_task RECORD;
  v_assignee UUID;
  v_sender RECORD;
  v_result JSONB;
  v_notification JSONB := NULL;
  v_note TEXT;
  v_status TEXT;
BEGIN
  IF jsonb_typeof(coalesce(p_action, 'null'::JSONB)) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'errorCode', 'coach_action_invalid');
  END IF;
  IF p_action->>'idempotencyKey' IS DISTINCT FROM p_idempotency_key::TEXT THEN
    RETURN jsonb_build_object('ok', false, 'errorCode', 'coach_idempotency_mismatch');
  END IF;

  SELECT * INTO v_preview FROM coach_action_previews
  WHERE idempotency_key = p_idempotency_key FOR UPDATE;
  IF NOT FOUND
    OR v_preview.client_id <> p_client_id
    OR v_preview.owner_id <> p_owner_id
    OR v_preview.brain_context_snapshot_id <> p_snapshot_id
    OR v_preview.action_type <> v_action_type THEN
    RETURN jsonb_build_object('ok', false, 'errorCode', 'coach_preview_mismatch');
  END IF;
  IF v_preview.expires_at <= v_now AND v_preview.status <> 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'errorCode', 'coach_preview_expired');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM coach_turns
    WHERE id = p_turn_id AND owner_id = p_owner_id AND client_id = p_client_id
      AND brain_context_snapshot_id = p_snapshot_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'errorCode', 'coach_turn_mismatch');
  END IF;
  SELECT role INTO v_role FROM users
  WHERE id = p_owner_id AND (client_id = p_client_id OR role = 'super_admin');
  IF v_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'errorCode', 'coach_owner_forbidden');
  END IF;

  v_payload_hash := encode(
    extensions.digest(convert_to(p_action::TEXT, 'UTF8'), 'sha256'), 'hex'
  );
  SELECT * INTO v_receipt FROM coach_action_receipts
  WHERE idempotency_key = p_idempotency_key FOR UPDATE;

  IF FOUND THEN
    IF v_receipt.owner_id <> p_owner_id OR v_receipt.client_id <> p_client_id
      OR v_receipt.turn_id <> p_turn_id OR v_receipt.action_type <> v_action_type
      OR v_receipt.payload_hash <> v_payload_hash THEN
      RETURN jsonb_build_object('ok', false, 'errorCode', 'coach_replay_mismatch');
    END IF;
    IF v_receipt.status = 'completed' THEN
      RETURN jsonb_build_object('ok', true, 'replayed', true, 'result', v_receipt.result);
    END IF;
    IF v_receipt.status = 'processing'
      AND v_receipt.updated_at > v_now - interval '2 minutes' THEN
      RETURN jsonb_build_object('ok', false, 'errorCode', 'coach_action_processing');
    END IF;
    UPDATE coach_action_receipts SET
      status = 'processing', error_code = NULL, updated_at = v_now
    WHERE id = v_receipt.id;
  ELSE
    INSERT INTO coach_action_receipts (
      idempotency_key, turn_id, client_id, owner_id, action_type, payload,
      payload_hash, status, updated_at
    ) VALUES (
      p_idempotency_key, p_turn_id, p_client_id, p_owner_id, v_action_type,
      p_action, v_payload_hash, 'processing', v_now
    ) RETURNING * INTO v_receipt;
  END IF;

  UPDATE coach_action_previews SET status = 'processing', updated_at = v_now
  WHERE id = v_preview.id;
  UPDATE coach_turns SET action_status = 'processing'
  WHERE id = p_turn_id AND owner_id = p_owner_id;

  BEGIN
    IF v_action_type = 'create_task' THEN
      IF v_role <> 'client_admin' THEN RAISE EXCEPTION 'coach_role_forbidden'; END IF;
      IF nullif(btrim(p_action->>'title'), '') IS NULL
        OR nullif(btrim(p_action->>'brief'), '') IS NULL THEN
        RAISE EXCEPTION 'coach_action_invalid';
      END IF;
      v_assignee := nullif(p_action->>'assigneeId', '')::UUID;
      IF v_assignee IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM users WHERE id = v_assignee AND client_id = p_client_id AND role = 'va'
      ) THEN RAISE EXCEPTION 'coach_assignee_invalid'; END IF;

      INSERT INTO tasks (
        client_id, created_by, assigned_to, title, description, status,
        priority, due_date, updated_at
      ) VALUES (
        p_client_id, p_owner_id, v_assignee, left(btrim(p_action->>'title'), 300),
        left(btrim(p_action->>'brief'), 10000), 'todo',
        (p_action->>'priority')::SMALLINT, nullif(p_action->>'dueDate', '')::DATE, v_now
      ) RETURNING id, title INTO v_task;
      INSERT INTO task_events (task_id, client_id, user_id, kind, body)
      VALUES (v_task.id, p_client_id, p_owner_id, 'activity',
        'created this task with RapidTal Coach');
      v_result := jsonb_build_object('taskId', v_task.id, 'title', v_task.title);
      IF v_assignee IS NOT NULL THEN
        v_notification := jsonb_build_object(
          'recipientIds', jsonb_build_array(v_assignee), 'type', 'task_assigned',
          'title', left('New task: ' || v_task.title, 120),
          'body', left(btrim(p_action->>'brief'), 200), 'href', '/tasks'
        );
      END IF;

    ELSIF v_action_type = 'send_message' THEN
      IF NOT (
        (v_role = 'va' AND p_action->>'audience' = 'client') OR
        (v_role = 'client_admin' AND p_action->>'audience' = 'va_team')
      ) THEN RAISE EXCEPTION 'coach_audience_forbidden'; END IF;
      IF nullif(btrim(p_action->>'message'), '') IS NULL THEN
        RAISE EXCEPTION 'coach_action_invalid';
      END IF;
      SELECT full_name, email INTO v_sender FROM users WHERE id = p_owner_id;
      INSERT INTO messages (
        client_id, sender_id, sender_name, sender_role, body, audience, read_by
      ) VALUES (
        p_client_id, p_owner_id, coalesce(nullif(v_sender.full_name, ''), v_sender.email),
        v_role, left(btrim(p_action->>'message'), 4000), p_action->>'audience', ARRAY[p_owner_id]
      ) RETURNING id, audience INTO v_task;
      v_result := jsonb_build_object('messageId', v_task.id, 'audience', v_task.audience);
      SELECT jsonb_build_object(
        'recipientIds', coalesce(jsonb_agg(id), '[]'::JSONB), 'type', 'message',
        'title', left('New message from ' || coalesce(nullif(v_sender.full_name, ''), v_sender.email), 120),
        'body', left(btrim(p_action->>'message'), 200), 'href', '/messages'
      ) INTO v_notification
      FROM users WHERE client_id = p_client_id AND id <> p_owner_id
        AND role = CASE WHEN p_action->>'audience' = 'client' THEN 'client_admin' ELSE 'va' END;

    ELSIF v_action_type IN ('update_task','submit_review','review_task') THEN
      SELECT id, assigned_to, title, status INTO v_task FROM tasks
      WHERE id = (p_action->>'taskId')::UUID AND client_id = p_client_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'coach_task_not_found'; END IF;
      v_note := left(coalesce(btrim(p_action->>'note'), ''), 2000);

      IF v_action_type = 'update_task' THEN
        IF v_role = 'va' THEN
          IF v_task.assigned_to IS DISTINCT FROM p_owner_id THEN RAISE EXCEPTION 'coach_task_forbidden'; END IF;
          IF p_action->>'status' NOT IN ('todo','in_progress') THEN RAISE EXCEPTION 'coach_va_terminal_status_forbidden'; END IF;
        ELSIF v_role <> 'client_admin' THEN
          RAISE EXCEPTION 'coach_role_forbidden';
        END IF;
        v_status := p_action->>'status';
        IF v_status NOT IN ('todo','in_progress','review','done') THEN RAISE EXCEPTION 'coach_action_invalid'; END IF;
        UPDATE tasks SET status = v_status, priority = (p_action->>'priority')::SMALLINT,
          due_date = nullif(p_action->>'dueDate', '')::DATE, updated_at = v_now,
          completed_at = CASE WHEN v_status = 'done' THEN v_now ELSE NULL END
        WHERE id = v_task.id;
        INSERT INTO task_events (task_id, client_id, user_id, kind, body)
        VALUES (v_task.id, p_client_id, p_owner_id, 'activity',
          'updated this task with RapidTal Coach (status: ' || v_status || ')');

      ELSIF v_action_type = 'submit_review' THEN
        IF v_role <> 'va' OR v_task.assigned_to IS DISTINCT FROM p_owner_id THEN
          RAISE EXCEPTION 'coach_task_forbidden';
        END IF;
        IF v_task.status NOT IN ('todo','in_progress') THEN RAISE EXCEPTION 'coach_task_not_submittable'; END IF;
        v_status := 'review';
        UPDATE tasks SET status = v_status, updated_at = v_now WHERE id = v_task.id;
        INSERT INTO task_events (task_id, client_id, user_id, kind, body)
        VALUES (v_task.id, p_client_id, p_owner_id, 'activity',
          'submitted this task for review with RapidTal Coach');
        SELECT jsonb_build_object(
          'recipientIds', coalesce(jsonb_agg(id), '[]'::JSONB), 'type', 'task_review',
          'title', left('Ready for review: ' || v_task.title, 120),
          'body', left(v_note, 200), 'href', '/tasks'
        ) INTO v_notification FROM users
        WHERE client_id = p_client_id AND role = 'client_admin';

      ELSE
        IF v_role <> 'client_admin' THEN RAISE EXCEPTION 'coach_role_forbidden'; END IF;
        IF v_task.status <> 'review' THEN RAISE EXCEPTION 'coach_task_not_reviewable'; END IF;
        IF p_action->>'decision' = 'approve' THEN
          v_status := 'done';
          UPDATE tasks SET status = v_status, completed_at = v_now, updated_at = v_now WHERE id = v_task.id;
        ELSIF p_action->>'decision' = 'changes' THEN
          v_status := 'in_progress';
          UPDATE tasks SET status = v_status, completed_at = NULL, updated_at = v_now WHERE id = v_task.id;
        ELSE RAISE EXCEPTION 'coach_action_invalid'; END IF;
        INSERT INTO task_events (task_id, client_id, user_id, kind, body)
        VALUES (v_task.id, p_client_id, p_owner_id, 'activity',
          CASE WHEN v_status = 'done' THEN 'approved this task with RapidTal Coach'
               ELSE 'requested changes with RapidTal Coach' END);
        IF v_task.assigned_to IS NOT NULL THEN
          v_notification := jsonb_build_object(
            'recipientIds', jsonb_build_array(v_task.assigned_to),
            'type', CASE WHEN v_status = 'done' THEN 'task_approved' ELSE 'task_changes' END,
            'title', left(CASE WHEN v_status = 'done' THEN 'Approved: ' ELSE 'Changes requested: ' END || v_task.title, 120),
            'body', left(v_note, 200), 'href', '/tasks'
          );
        END IF;
      END IF;

      IF v_note <> '' THEN
        INSERT INTO task_events (task_id, client_id, user_id, kind, body)
        VALUES (v_task.id, p_client_id, p_owner_id, 'comment', v_note);
      END IF;
      v_result := jsonb_build_object('taskId', v_task.id, 'status', v_status);
    ELSE
      RAISE EXCEPTION 'coach_action_invalid';
    END IF;

    UPDATE coach_action_receipts SET status = 'completed', result = v_result,
      error_code = NULL, completed_at = v_now, updated_at = v_now
    WHERE id = v_receipt.id;
    UPDATE coach_action_previews SET status = 'completed', completed_at = v_now, updated_at = v_now
    WHERE id = v_preview.id;
    UPDATE coach_turns SET action_status = 'completed', action_completed_at = v_now
    WHERE id = p_turn_id AND owner_id = p_owner_id;
    RETURN jsonb_build_object('ok', true, 'replayed', false, 'result', v_result,
      'notification', v_notification);
  EXCEPTION WHEN OTHERS THEN
    UPDATE coach_action_receipts SET status = 'failed', error_code = left(SQLERRM, 200),
      completed_at = NULL, updated_at = clock_timestamp() WHERE id = v_receipt.id;
    UPDATE coach_action_previews SET status = 'failed', updated_at = clock_timestamp()
      WHERE id = v_preview.id;
    UPDATE coach_turns SET action_status = 'failed'
      WHERE id = p_turn_id AND owner_id = p_owner_id;
    RETURN jsonb_build_object('ok', false, 'errorCode', left(SQLERRM, 200));
  END;
END;
$$;

REVOKE ALL ON FUNCTION execute_coach_action(UUID,UUID,UUID,UUID,UUID,JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION execute_coach_action(UUID,UUID,UUID,UUID,UUID,JSONB)
  TO service_role;

-- Private feedback can be rated and inspected by its owner, but it must never
-- be leased into company-wide Brain Memory distillation.
CREATE OR REPLACE FUNCTION claim_brain_signals(
  p_client_id UUID,
  p_limit INT DEFAULT 60,
  p_min_signals INT DEFAULT 3,
  p_lease_seconds INT DEFAULT 600
)
RETURNS SETOF brain_signals
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_token UUID := gen_random_uuid();
BEGIN
  RETURN QUERY
  WITH candidates AS MATERIALIZED (
    SELECT bs.id
    FROM brain_signals bs
    WHERE bs.client_id = p_client_id
      AND bs.distilled_at IS NULL
      AND coalesce(bs.visibility, 'team_learning') = 'team_learning'
      AND (bs.distill_claim_until IS NULL OR bs.distill_claim_until <= clock_timestamp())
    ORDER BY bs.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT greatest(1, least(coalesce(p_limit, 60), 200))
  ),
  eligible AS (SELECT count(*) AS signal_count FROM candidates)
  UPDATE brain_signals bs
  SET distill_claim_token = v_token,
      distill_claim_until = clock_timestamp() + make_interval(
        secs => greatest(60, least(coalesce(p_lease_seconds, 600), 1800))
      )
  FROM candidates c, eligible e
  WHERE bs.id = c.id
    AND e.signal_count >= greatest(1, least(coalesce(p_min_signals, 3), 200))
  RETURNING bs.*;
END;
$$;

-- Retention also removes expired, unused previews. This function is invoked by
-- an independent daily cron in addition to best-effort Coach traffic cleanup.
CREATE OR REPLACE FUNCTION purge_expired_coach_private_data()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_deleted INTEGER := 0;
  v_rows INTEGER := 0;
BEGIN
  DELETE FROM vault_queries
  WHERE visibility = 'private_coach' AND retention_until IS NOT NULL
    AND retention_until <= clock_timestamp();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  DELETE FROM coach_turns turn_row USING coach_threads thread_row
  WHERE turn_row.thread_id = thread_row.id
    AND turn_row.created_at < clock_timestamp() - make_interval(days => thread_row.retention_days);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_deleted := v_deleted + v_rows;

  DELETE FROM coach_action_previews
  WHERE expires_at <= clock_timestamp() AND status IN ('draft','failed');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_deleted := v_deleted + v_rows;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION purge_expired_coach_private_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION purge_expired_coach_private_data() TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('137_coach_action_integrity.sql')
ON CONFLICT DO NOTHING;
