-- ============================================================
-- 105_connected_editorial_projects.sql
-- Durable spine for Discover -> Brief -> Evidence -> Draft -> Approval.
-- Requires PostgreSQL 15+ for composite ON DELETE SET NULL column lists.
-- Portal currently runs PostgreSQL 17; fail explicitly on older targets.
-- ============================================================

DO $$
BEGIN
  IF current_setting('server_version_num')::INTEGER < 150000 THEN
    RAISE EXCEPTION 'Migration 105 requires PostgreSQL 15 or newer.';
  END IF;
END;
$$;

CREATE TABLE content_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'saved', 'rejected', 'approved', 'archived')),
  current_step TEXT NOT NULL DEFAULT 'idea'
    CHECK (current_step IN (
      'idea', 'brief', 'evidence', 'generate', 'edit', 'validate', 'approve', 'complete'
    )),
  idea_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  content_brief JSONB NOT NULL DEFAULT '{}'::jsonb,
  vault_source_ids UUID[] NOT NULL DEFAULT '{}',
  vault_source_references JSONB NOT NULL DEFAULT '[]'::jsonb,
  competitor_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  style_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_piece_id UUID,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, client_id),
  CHECK (jsonb_typeof(idea_snapshot) = 'object'),
  CHECK (jsonb_typeof(content_brief) = 'object'),
  CHECK (jsonb_typeof(vault_source_references) = 'array'),
  CHECK (jsonb_typeof(competitor_signals) = 'array'),
  CHECK (jsonb_typeof(style_snapshot) = 'object')
);

CREATE INDEX content_projects_client_updated_idx
  ON content_projects(client_id, updated_at DESC);
CREATE INDEX content_projects_continue_idx
  ON content_projects(client_id, status, updated_at DESC)
  WHERE status IN ('active', 'saved');

ALTER TABLE content_pieces
  ADD COLUMN project_id UUID;

ALTER TABLE content_pieces
  ADD CONSTRAINT content_pieces_id_client_unique UNIQUE (id, client_id),
  ADD CONSTRAINT content_pieces_project_client_fkey
    FOREIGN KEY (project_id, client_id)
    REFERENCES content_projects(id, client_id)
    ON DELETE SET NULL (project_id)
    NOT VALID;

ALTER TABLE content_pieces
  VALIDATE CONSTRAINT content_pieces_project_client_fkey;

ALTER TABLE content_projects
  ADD CONSTRAINT content_projects_current_piece_client_fkey
    FOREIGN KEY (current_piece_id, client_id)
    REFERENCES content_pieces(id, client_id)
    ON DELETE SET NULL (current_piece_id)
    NOT VALID;

ALTER TABLE content_projects
  VALIDATE CONSTRAINT content_projects_current_piece_client_fkey;

CREATE INDEX content_pieces_project_idx
  ON content_pieces(project_id, created_at DESC)
  WHERE project_id IS NOT NULL;

ALTER TABLE content_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_projects_super_admin_all"
  ON content_projects FOR ALL
  USING (current_user_role() = 'super_admin')
  WITH CHECK (current_user_role() = 'super_admin');

CREATE POLICY "content_projects_own_client_select"
  ON content_projects FOR SELECT
  USING (client_id = current_user_client_id());

-- Tenant members read their projects through RLS. Mutations deliberately flow
-- through authenticated API routes so transition, provenance and optimistic
-- concurrency checks cannot be bypassed with a direct PostgREST update.

CREATE OR REPLACE FUNCTION touch_content_project_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER content_projects_touch_updated_at
BEFORE UPDATE ON content_projects
FOR EACH ROW
EXECUTE FUNCTION touch_content_project_updated_at();

REVOKE ALL ON FUNCTION touch_content_project_updated_at() FROM PUBLIC, anon, authenticated;

-- Phase 3 originally captured content edits. The connected journey also treats
-- evidence and resolved style as immutable editorial provenance, so a change to
-- either receives its own revision before the piece is updated.
CREATE OR REPLACE FUNCTION capture_content_piece_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next INT;
  v_actor UUID;
  v_provenance_only BOOLEAN;
BEGIN
  IF NEW.title IS NOT DISTINCT FROM OLD.title
     AND NEW.body IS NOT DISTINCT FROM OLD.body
     AND NEW.content_type IS NOT DISTINCT FROM OLD.content_type
     AND NEW.content_brief IS NOT DISTINCT FROM OLD.content_brief
     AND NEW.style_snapshot IS NOT DISTINCT FROM OLD.style_snapshot
     AND NEW.source_references IS NOT DISTINCT FROM OLD.source_references THEN
    RETURN NEW;
  END IF;

  v_provenance_only :=
    NEW.title IS NOT DISTINCT FROM OLD.title
    AND NEW.body IS NOT DISTINCT FROM OLD.body
    AND NEW.content_type IS NOT DISTINCT FROM OLD.content_type
    AND NEW.content_brief IS NOT DISTINCT FROM OLD.content_brief;

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
    CASE
      WHEN v_provenance_only THEN 'provenance_refresh'
      ELSE coalesce(nullif(NEW.revision_reason, ''), 'edit')
    END,
    coalesce(v_actor, OLD.created_by)
  );

  NEW.revision_reason := NULL;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION capture_content_piece_revision() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION sync_content_project_from_piece()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.project_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE content_projects
  SET
    current_piece_id = NEW.id,
    content_brief = NEW.content_brief,
    vault_source_references = NEW.source_references,
    style_snapshot = NEW.style_snapshot,
    status = CASE
      WHEN NEW.status = 'approved' THEN 'approved'
      WHEN NEW.status = 'archived' THEN 'archived'
      WHEN content_projects.status IN ('approved', 'archived') AND NEW.status = 'draft' THEN 'active'
      ELSE content_projects.status
    END,
    current_step = CASE
      WHEN NEW.status = 'approved' THEN 'complete'
      WHEN NEW.status = 'archived' THEN 'complete'
      WHEN NEW.status = 'draft' AND content_projects.current_step = 'complete' THEN 'edit'
      ELSE content_projects.current_step
    END
  WHERE id = NEW.project_id
    AND client_id = NEW.client_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER content_pieces_sync_project
AFTER UPDATE OF status ON content_pieces
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION sync_content_project_from_piece();

REVOKE ALL ON FUNCTION sync_content_project_from_piece() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION create_content_project_draft(
  p_client_id UUID,
  p_project_id UUID,
  p_actor_id UUID,
  p_content_type TEXT,
  p_title TEXT,
  p_body TEXT,
  p_content_brief JSONB,
  p_source_references JSONB,
  p_style_snapshot JSONB,
  p_generation_kind TEXT DEFAULT 'original',
  p_parent_piece_id UUID DEFAULT NULL
)
RETURNS SETOF content_pieces
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_project content_projects%ROWTYPE;
  v_actor_role TEXT;
  v_actor_client_id UUID;
  v_piece content_pieces%ROWTYPE;
  v_source JSONB;
  v_item_id UUID;
BEGIN
  SELECT role::TEXT, client_id
    INTO v_actor_role, v_actor_client_id
  FROM users
  WHERE id = p_actor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Content actor not found.';
  END IF;
  IF v_actor_role <> 'super_admin' AND v_actor_client_id IS DISTINCT FROM p_client_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Forbidden.';
  END IF;

  SELECT *
    INTO v_project
  FROM content_projects
  WHERE id = p_project_id
    AND client_id = p_client_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Content project not found.';
  END IF;
  IF v_project.status IN ('rejected', 'approved', 'archived') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'This content project cannot generate a new draft.';
  END IF;
  IF jsonb_typeof(p_content_brief) <> 'object'
     OR jsonb_typeof(p_source_references) <> 'array'
     OR jsonb_typeof(p_style_snapshot) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid content provenance.';
  END IF;
  IF p_content_brief IS DISTINCT FROM v_project.content_brief THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'The project brief changed before generation completed.';
  END IF;

  -- Only the project's explicitly selected factual Vault IDs can be persisted
  -- as factual evidence. Competitor captures live in competitor_signals instead.
  FOR v_source IN SELECT value FROM jsonb_array_elements(p_source_references)
  LOOP
    BEGIN
      v_item_id := (v_source ->> 'itemId')::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid factual source reference.';
    END;
    IF v_item_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid factual source reference.';
    END IF;
    IF NOT (v_item_id = ANY(v_project.vault_source_ids)) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A generated source was not selected as factual Vault evidence.';
    END IF;
  END LOOP;

  INSERT INTO content_pieces (
    client_id, project_id, content_type, title, brief, body, status,
    content_brief, source_references, style_snapshot, generation_kind,
    parent_piece_id, created_by
  ) VALUES (
    p_client_id, p_project_id, p_content_type, btrim(p_title),
    p_content_brief ->> 'objective', p_body, 'draft',
    p_content_brief, p_source_references, p_style_snapshot, p_generation_kind,
    p_parent_piece_id, p_actor_id
  )
  RETURNING * INTO v_piece;

  UPDATE content_projects
  SET
    current_piece_id = v_piece.id,
    current_step = 'edit',
    status = 'active',
    vault_source_references = p_source_references,
    style_snapshot = p_style_snapshot
  WHERE id = p_project_id
    AND client_id = p_client_id;

  RETURN NEXT v_piece;
END;
$$;

REVOKE ALL ON FUNCTION create_content_project_draft(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT, UUID
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION create_content_project_draft(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT, UUID
) TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('105_connected_editorial_projects.sql')
ON CONFLICT DO NOTHING;
