-- ============================================================
-- 091_disable_content_performance_learning.sql
--
-- Content performance is not a Brain learning source. Preserve deliberate
-- manual feedback on content_draft, but reject automatic approval-similarity
-- and win/miss outcome signals even if an older web deployment emits them.
-- ============================================================

CREATE OR REPLACE FUNCTION reject_content_performance_signal()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.surface = 'content_outcome'
     OR (
       NEW.surface = 'content_draft'
       AND coalesce(NEW.context->>'event', '') = 'approval'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Content performance signals are not part of the Brain learning model.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS brain_signals_no_content_performance ON brain_signals;
CREATE TRIGGER brain_signals_no_content_performance
BEFORE INSERT OR UPDATE ON brain_signals
FOR EACH ROW
EXECUTE FUNCTION reject_content_performance_signal();

REVOKE ALL ON FUNCTION reject_content_performance_signal() FROM PUBLIC, anon, authenticated;

INSERT INTO schema_migrations (version)
VALUES ('091_disable_content_performance_learning.sql')
ON CONFLICT DO NOTHING;
