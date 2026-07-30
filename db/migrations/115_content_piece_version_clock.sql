-- ============================================================
-- 115_content_piece_version_clock.sql
-- Make content_pieces.updated_at a database-enforced version clock so any
-- writer, including service-role maintenance code, invalidates stale validation.
-- ============================================================

CREATE OR REPLACE FUNCTION touch_content_piece_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.title IS DISTINCT FROM OLD.title
     OR NEW.body IS DISTINCT FROM OLD.body
     OR NEW.content_type IS DISTINCT FROM OLD.content_type
     OR NEW.content_brief IS DISTINCT FROM OLD.content_brief
     OR NEW.source_references IS DISTINCT FROM OLD.source_references
     OR NEW.style_snapshot IS DISTINCT FROM OLD.style_snapshot THEN
    NEW.updated_at := clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS content_pieces_touch_updated_at ON content_pieces;
CREATE TRIGGER content_pieces_touch_updated_at
BEFORE UPDATE ON content_pieces
FOR EACH ROW
EXECUTE FUNCTION touch_content_piece_updated_at();

REVOKE ALL ON FUNCTION touch_content_piece_updated_at()
  FROM PUBLIC, anon, authenticated;

INSERT INTO schema_migrations (version)
VALUES ('115_content_piece_version_clock.sql')
ON CONFLICT DO NOTHING;
