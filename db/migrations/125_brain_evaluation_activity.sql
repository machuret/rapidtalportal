-- ============================================================
-- 125_brain_evaluation_activity.sql
-- Add honest blind voice-evaluation outcomes to meaningful Brain activity.
-- The hidden assignment determines whether the conditioned draft actually won.
-- ============================================================

CREATE OR REPLACE FUNCTION capture_brain_voice_evaluation_activity()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'reviewed'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'reviewed') THEN
    PERFORM record_meaningful_brain_event(
      NEW.client_id,
      CASE
        WHEN NEW.preferred_variant IN ('a','b')
          AND NEW.assignment->>NEW.preferred_variant = 'conditioned'
          THEN 'evaluation_improved'
        ELSE 'evaluation_reviewed'
      END,
      CASE
        WHEN NEW.preferred_variant = 'tie'
          THEN initcap(NEW.channel) || ' blind voice review ended in a tie.'
        WHEN NEW.preferred_variant IN ('a','b')
          AND NEW.assignment->>NEW.preferred_variant = 'conditioned'
          THEN initcap(NEW.channel) || ' style-conditioned draft won a blind review.'
        ELSE initcap(NEW.channel) || ' blind voice review preferred the baseline.'
      END,
      jsonb_build_object('preferredVariant', NEW.preferred_variant),
      NEW.channel, NEW.id, 'voice-evaluation:' || NEW.id::TEXT
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS brain_activity_voice_evaluation ON content_voice_evaluations;
CREATE TRIGGER brain_activity_voice_evaluation
AFTER INSERT OR UPDATE OF status ON content_voice_evaluations
FOR EACH ROW EXECUTE FUNCTION capture_brain_voice_evaluation_activity();

REVOKE ALL ON FUNCTION capture_brain_voice_evaluation_activity()
  FROM PUBLIC, anon, authenticated;

INSERT INTO schema_migrations (version)
VALUES ('125_brain_evaluation_activity.sql')
ON CONFLICT DO NOTHING;
