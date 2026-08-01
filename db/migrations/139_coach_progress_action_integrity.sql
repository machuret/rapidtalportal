-- ============================================================
-- 139_coach_progress_action_integrity.sql
-- Phase 3 audit repair: structured, editable and idempotent private goal and
-- commitment previews. Migration 138 is already live and remains immutable.
-- ============================================================

ALTER TABLE coach_turns
  DROP CONSTRAINT IF EXISTS coach_turns_coach_mode_check;
ALTER TABLE coach_turns
  ADD CONSTRAINT coach_turns_coach_mode_check CHECK (coach_mode IN (
    'private','message_client','message_va_team','create_task','update_task',
    'submit_review','review_task','create_goal','create_commitment'
  ));

ALTER TABLE coach_action_previews
  DROP CONSTRAINT IF EXISTS coach_action_previews_action_type_check;
ALTER TABLE coach_action_previews
  ADD CONSTRAINT coach_action_previews_action_type_check CHECK (action_type IN (
    'create_task','send_message','update_task','submit_review','review_task',
    'create_goal','create_commitment'
  ));

ALTER TABLE coach_action_receipts
  DROP CONSTRAINT IF EXISTS coach_action_receipts_action_type_check;
ALTER TABLE coach_action_receipts
  ADD CONSTRAINT coach_action_receipts_action_type_check CHECK (action_type IN (
    'create_task','send_message','update_task','submit_review','review_task',
    'create_goal','create_commitment'
  ));

CREATE OR REPLACE FUNCTION execute_coach_progress_action(
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
  v_result JSONB;
BEGIN
  IF jsonb_typeof(coalesce(p_action, 'null'::JSONB)) <> 'object'
    OR v_action_type NOT IN ('create_goal','create_commitment') THEN
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
    SELECT 1 FROM coach_turns WHERE id = p_turn_id AND owner_id = p_owner_id
      AND client_id = p_client_id AND brain_context_snapshot_id = p_snapshot_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'errorCode', 'coach_turn_mismatch');
  END IF;
  SELECT role INTO v_role FROM users
  WHERE id = p_owner_id AND client_id = p_client_id AND role IN ('client_admin','va');
  IF v_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'errorCode', 'coaching_progress_forbidden');
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
    UPDATE coach_action_receipts SET status = 'processing', error_code = NULL,
      updated_at = v_now WHERE id = v_receipt.id;
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
    IF v_action_type = 'create_goal' THEN
      IF nullif(btrim(p_action->>'title'), '') IS NULL THEN
        RAISE EXCEPTION 'coach_goal_invalid';
      END IF;
      SELECT create_coach_goal(
        p_client_id, p_owner_id, p_action->>'title', coalesce(p_action->>'outcome', ''),
        nullif(p_action->>'targetDate', '')::DATE, p_turn_id
      ) INTO v_result;
    ELSE
      IF nullif(btrim(p_action->>'commitment'), '') IS NULL THEN
        RAISE EXCEPTION 'coach_commitment_invalid';
      END IF;
      SELECT create_coach_commitment(
        p_client_id, p_owner_id, p_action->>'commitment',
        nullif(p_action->>'goalId', '')::UUID,
        nullif(p_action->>'dueDate', '')::DATE,
        nullif(p_action->>'checkInDate', '')::DATE,
        p_turn_id
      ) INTO v_result;
    END IF;

    UPDATE coach_action_receipts SET status = 'completed', result = v_result,
      error_code = NULL, completed_at = v_now, updated_at = v_now
    WHERE id = v_receipt.id;
    UPDATE coach_action_previews SET status = 'completed', completed_at = v_now,
      updated_at = v_now WHERE id = v_preview.id;
    UPDATE coach_turns SET action_status = 'completed', action_completed_at = v_now
    WHERE id = p_turn_id AND owner_id = p_owner_id;
    RETURN jsonb_build_object('ok', true, 'replayed', false, 'result', v_result);
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

REVOKE ALL ON FUNCTION execute_coach_progress_action(UUID,UUID,UUID,UUID,UUID,JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION execute_coach_progress_action(UUID,UUID,UUID,UUID,UUID,JSONB)
  TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('139_coach_progress_action_integrity.sql')
ON CONFLICT DO NOTHING;
