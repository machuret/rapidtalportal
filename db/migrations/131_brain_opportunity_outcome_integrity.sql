-- ============================================================
-- 131_brain_opportunity_outcome_integrity.sql
-- Preserve completion evidence when later effectiveness measurements are
-- recorded. Measuring augments the outcome instead of replacing it.
-- ============================================================

CREATE OR REPLACE FUNCTION transition_brain_opportunity(
  p_opportunity_id UUID,
  p_client_id UUID,
  p_action TEXT,
  p_actor_id UUID,
  p_outcome JSONB DEFAULT '{}'::JSONB
)
RETURNS brain_opportunities
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_row brain_opportunities%ROWTYPE;
  previous_status TEXT;
  next_status TEXT;
  event_name TEXT;
  requested_effectiveness TEXT;
BEGIN
  SELECT *
  INTO current_row
  FROM brain_opportunities
  WHERE id = p_opportunity_id
    AND client_id = p_client_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Opportunity not found.';
  END IF;
  previous_status := current_row.status;

  IF p_action = 'approve' AND current_row.status = 'suggested' THEN
    next_status := 'approved';
    event_name := 'approved';
  ELSIF p_action = 'dismiss'
    AND current_row.status IN ('suggested', 'approved') THEN
    next_status := 'dismissed';
    event_name := 'dismissed';
  ELSIF p_action = 'start' AND current_row.status = 'approved' THEN
    next_status := 'in_progress';
    event_name := 'started';
  ELSIF p_action = 'complete'
    AND current_row.status IN ('approved', 'in_progress') THEN
    next_status := 'completed';
    event_name := 'completed';
  ELSIF p_action = 'reopen'
    AND current_row.status IN ('dismissed', 'completed') THEN
    next_status := 'suggested';
    event_name := 'reopened';
  ELSIF p_action = 'measure' AND current_row.status = 'completed' THEN
    next_status := 'completed';
    event_name := 'measured';
  ELSE
    RAISE EXCEPTION 'Invalid opportunity transition from % using %.',
      current_row.status, p_action;
  END IF;

  requested_effectiveness := coalesce(p_outcome->>'effectivenessStatus', '');
  IF requested_effectiveness <> ''
    AND requested_effectiveness NOT IN (
      'unmeasured', 'measuring', 'effective', 'mixed', 'ineffective'
    ) THEN
    RAISE EXCEPTION 'Invalid effectiveness status.';
  END IF;

  UPDATE brain_opportunities
  SET
    status = next_status,
    approved_by = CASE WHEN p_action = 'approve' THEN p_actor_id ELSE approved_by END,
    approved_at = CASE WHEN p_action = 'approve' THEN now() ELSE approved_at END,
    dismissed_by = CASE WHEN p_action = 'dismiss' THEN p_actor_id ELSE dismissed_by END,
    dismissed_at = CASE WHEN p_action = 'dismiss' THEN now() ELSE dismissed_at END,
    started_at = CASE WHEN p_action = 'start' THEN now() ELSE started_at END,
    completed_by = CASE WHEN p_action = 'complete' THEN p_actor_id ELSE completed_by END,
    completed_at = CASE WHEN p_action = 'complete' THEN now() ELSE completed_at END,
    outcome = CASE
      WHEN p_action = 'complete' THEN coalesce(p_outcome, '{}'::JSONB)
      WHEN p_action = 'measure'
        THEN current_row.outcome || coalesce(p_outcome, '{}'::JSONB)
      WHEN p_action = 'reopen' THEN '{}'::JSONB
      ELSE outcome
    END,
    effectiveness_status = CASE
      WHEN p_action IN ('complete', 'measure') AND requested_effectiveness <> ''
        THEN requested_effectiveness
      WHEN p_action = 'complete' THEN 'measuring'
      WHEN p_action = 'reopen' THEN 'unmeasured'
      ELSE effectiveness_status
    END,
    measured_at = CASE
      WHEN p_action = 'measure' THEN now()
      WHEN p_action = 'reopen' THEN NULL
      ELSE measured_at
    END,
    updated_at = now()
  WHERE id = current_row.id
  RETURNING * INTO current_row;

  INSERT INTO brain_opportunity_events (
    opportunity_id, client_id, event_kind,
    from_status, to_status, metadata, actor_id
  )
  VALUES (
    current_row.id, current_row.client_id, event_name,
    previous_status,
    next_status,
    coalesce(p_outcome, '{}'::JSONB),
    p_actor_id
  );

  RETURN current_row;
END;
$$;

REVOKE ALL ON FUNCTION transition_brain_opportunity(UUID, UUID, TEXT, UUID, JSONB)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION transition_brain_opportunity(UUID, UUID, TEXT, UUID, JSONB)
TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('131_brain_opportunity_outcome_integrity.sql')
ON CONFLICT DO NOTHING;
