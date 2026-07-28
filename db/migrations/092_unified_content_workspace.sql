-- ============================================================
-- 092_unified_content_workspace.sql – Phase 2/3 content model
-- ============================================================

ALTER TABLE content_pieces
  ADD COLUMN IF NOT EXISTS content_brief JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS source_references JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS parent_piece_id UUID REFERENCES content_pieces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS generation_kind TEXT NOT NULL DEFAULT 'original',
  ADD COLUMN IF NOT EXISTS revision_reason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_pieces_generation_kind_check'
  ) THEN
    ALTER TABLE content_pieces
      ADD CONSTRAINT content_pieces_generation_kind_check
      CHECK (generation_kind IN ('original', 'reply', 'rewrite', 'duplicate', 'adaptation', 'manual'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS content_pieces_parent_idx
  ON content_pieces(parent_piece_id)
  WHERE parent_piece_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS content_piece_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  piece_id UUID NOT NULL REFERENCES content_pieces(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  revision_number INT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  content_type TEXT NOT NULL,
  content_brief JSONB NOT NULL DEFAULT '{}'::jsonb,
  style_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_references JSONB NOT NULL DEFAULT '[]'::jsonb,
  reason TEXT NOT NULL DEFAULT 'edit',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (piece_id, revision_number)
);

CREATE INDEX IF NOT EXISTS content_piece_revisions_piece_idx
  ON content_piece_revisions(piece_id, revision_number DESC);

ALTER TABLE content_piece_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "content_revisions_super_admin_all" ON content_piece_revisions;
CREATE POLICY "content_revisions_super_admin_all"
  ON content_piece_revisions FOR ALL
  USING (current_user_role() = 'super_admin')
  WITH CHECK (current_user_role() = 'super_admin');

DROP POLICY IF EXISTS "content_revisions_own_client_select" ON content_piece_revisions;
CREATE POLICY "content_revisions_own_client_select"
  ON content_piece_revisions FOR SELECT
  USING (client_id = current_user_client_id());

CREATE OR REPLACE FUNCTION capture_content_piece_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next INT;
  v_actor UUID;
BEGIN
  IF NEW.title IS NOT DISTINCT FROM OLD.title
     AND NEW.body IS NOT DISTINCT FROM OLD.body
     AND NEW.content_type IS NOT DISTINCT FROM OLD.content_type
     AND NEW.content_brief IS NOT DISTINCT FROM OLD.content_brief THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(max(revision_number), 0) + 1
    INTO v_next
  FROM content_piece_revisions
  WHERE piece_id = OLD.id;

  BEGIN
    v_actor := nullif(current_setting('request.jwt.claim.sub', true), '')::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    v_actor := NULL;
  END;

  INSERT INTO content_piece_revisions (
    piece_id, client_id, revision_number, title, body, content_type,
    content_brief, style_snapshot, source_references, reason, created_by
  ) VALUES (
    OLD.id, OLD.client_id, v_next, OLD.title, OLD.body, OLD.content_type,
    OLD.content_brief, OLD.style_snapshot, OLD.source_references,
    coalesce(nullif(NEW.revision_reason, ''), 'edit'),
    coalesce(v_actor, OLD.created_by)
  );

  -- revision_reason is a one-update label, not persistent piece state.
  NEW.revision_reason := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS content_pieces_revision_history ON content_pieces;
CREATE TRIGGER content_pieces_revision_history
BEFORE UPDATE ON content_pieces
FOR EACH ROW
EXECUTE FUNCTION capture_content_piece_revision();

REVOKE ALL ON FUNCTION capture_content_piece_revision() FROM PUBLIC, anon, authenticated;

INSERT INTO schema_migrations (version)
VALUES ('092_unified_content_workspace.sql')
ON CONFLICT DO NOTHING;
