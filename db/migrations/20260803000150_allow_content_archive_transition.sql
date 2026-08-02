-- Archiving a connected piece is an explicit lifecycle action, not a normal
-- editorial step change. The piece->project sync trigger moves any archived
-- piece to the terminal project state, so the workflow guard must allow that
-- transition from edit/validate/approve as well as from complete.
CREATE OR REPLACE FUNCTION enforce_content_project_step_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_allowed BOOLEAN := FALSE;
BEGIN
  IF NEW.current_step IS NOT DISTINCT FROM OLD.current_step THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'rejected' AND NEW.current_step = 'complete' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'archived' AND NEW.current_step = 'complete' THEN
    RETURN NEW;
  END IF;

  v_allowed := CASE OLD.current_step
    WHEN 'idea' THEN NEW.current_step IN ('brief')
    WHEN 'brief' THEN NEW.current_step IN ('idea', 'evidence')
    WHEN 'evidence' THEN NEW.current_step IN ('brief', 'generate')
    WHEN 'generate' THEN NEW.current_step IN ('evidence', 'edit')
    WHEN 'edit' THEN NEW.current_step IN ('generate', 'validate')
    WHEN 'validate' THEN NEW.current_step IN ('edit', 'approve')
    WHEN 'approve' THEN NEW.current_step IN ('validate', 'complete')
    WHEN 'complete' THEN NEW.current_step IN ('edit')
    ELSE FALSE
  END;
  IF NOT v_allowed THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = format('Invalid content workflow transition from %s to %s.', OLD.current_step, NEW.current_step);
  END IF;

  IF NEW.current_step = 'approve' AND (
    NEW.current_piece_id IS NULL OR NOT content_project_validation_is_current(
      NEW.client_id,
      NEW.id,
      NEW.current_piece_id
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Validate the latest draft successfully before approval.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION enforce_content_project_step_transition()
  FROM PUBLIC, anon, authenticated;

INSERT INTO schema_migrations (version)
VALUES ('20260803000150_allow_content_archive_transition.sql')
ON CONFLICT DO NOTHING;
