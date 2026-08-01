-- ============================================================
-- 143_coach_checkin_messages.sql
-- Check-ins become generated, contextual follow-ups instead of a bare
-- restatement of the commitment. The cron composes a short message and passes
-- it as p_message; when p_message is NULL (generation skipped or failed) the
-- notification body is byte-identical to the previous behaviour (the
-- commitment text), so delivery never depends on generation.
-- ============================================================

-- The new parameter has a default, but Postgres prefers an exact-arity match
-- when both signatures exist, so the old two-arg form must be dropped first.
DROP FUNCTION IF EXISTS deliver_coach_check_in(UUID, UUID);

CREATE OR REPLACE FUNCTION deliver_coach_check_in(
  p_commitment_id UUID, p_claim_token UUID, p_message TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row coach_commitments%ROWTYPE; v_timezone TEXT; v_next_check_in_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_row FROM coach_commitments WHERE id = p_commitment_id
    AND check_in_claim_token = p_claim_token
    AND check_in_claimed_until > clock_timestamp() FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT coalesce((SELECT name FROM pg_timezone_names WHERE name = users.timezone), 'UTC')
    INTO v_timezone FROM users WHERE id = v_row.owner_id;
  v_next_check_in_at := CASE WHEN v_row.check_in_interval_days IS NULL THEN NULL ELSE
    (((clock_timestamp() AT TIME ZONE v_timezone)::DATE + v_row.check_in_interval_days) + time '09:00')
      AT TIME ZONE v_timezone END;
  INSERT INTO notifications (user_id, client_id, type, title, body, href)
  VALUES (v_row.owner_id, v_row.client_id, 'coach_check_in',
    'Coach check-in',
    left(coalesce(nullif(btrim(p_message), ''), v_row.commitment), 1000), '/ask');
  UPDATE coach_commitments SET last_check_in_at = clock_timestamp(),
    next_check_in_at = v_next_check_in_at,
    reminder_count = least(100, reminder_count + 1), status = 'open',
    check_in_claim_token = NULL, check_in_claimed_until = NULL, updated_at = clock_timestamp()
  WHERE id = p_commitment_id;
  INSERT INTO coach_progress_events (client_id, owner_id, commitment_id, goal_id, event_type, detail)
  VALUES (v_row.client_id, v_row.owner_id, v_row.id, v_row.goal_id, 'check_in_sent',
    jsonb_build_object('scheduledFor', v_row.next_check_in_at, 'nextCheckInAt', v_next_check_in_at));
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION deliver_coach_check_in(UUID,UUID,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION deliver_coach_check_in(UUID,UUID,TEXT) TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('143_coach_checkin_messages.sql')
ON CONFLICT DO NOTHING;
