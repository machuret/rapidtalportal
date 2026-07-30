-- ============================================================
-- 114_content_workflow_validation_integrity.sql
-- Persist successful/failed validation against an exact draft version and
-- enforce the connected editorial state machine in PostgreSQL.
-- ============================================================

CREATE TABLE IF NOT EXISTS content_project_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES content_projects(id) ON DELETE CASCADE,
  piece_id UUID NOT NULL REFERENCES content_pieces(id) ON DELETE CASCADE,
  piece_updated_at TIMESTAMPTZ NOT NULL,
  dna_updated_at TIMESTAMPTZ NOT NULL,
  passed BOOLEAN NOT NULL,
  checks JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(checks) = 'array'),
  validated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  validated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS content_project_validations_latest_idx
  ON content_project_validations(project_id, validated_at DESC);

ALTER TABLE content_project_validations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE content_project_validations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE content_project_validations TO service_role;

CREATE OR REPLACE FUNCTION content_project_validation_is_current(
  p_client_id UUID,
  p_project_id UUID,
  p_piece_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM content_project_validations validation
    JOIN content_pieces piece
      ON piece.id = validation.piece_id
     AND piece.client_id = validation.client_id
    JOIN company_dna dna
      ON dna.client_id = validation.client_id
    WHERE validation.client_id = p_client_id
      AND validation.project_id = p_project_id
      AND validation.piece_id = p_piece_id
      AND validation.passed
      AND validation.piece_updated_at = piece.updated_at
      AND validation.dna_updated_at = dna.updated_at
      AND validation.id = (
        SELECT latest.id
        FROM content_project_validations latest
        WHERE latest.client_id = p_client_id
          AND latest.project_id = p_project_id
          AND latest.piece_id = p_piece_id
        ORDER BY latest.validated_at DESC, latest.id DESC
        LIMIT 1
      )
  );
$$;

REVOKE ALL ON FUNCTION content_project_validation_is_current(UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION content_project_validation_is_current(UUID, UUID, UUID)
  TO service_role;

CREATE OR REPLACE FUNCTION record_content_project_validation(
  p_client_id UUID,
  p_project_id UUID,
  p_piece_id UUID,
  p_actor_id UUID,
  p_expected_piece_updated_at TIMESTAMPTZ,
  p_passed BOOLEAN,
  p_checks JSONB
)
RETURNS SETOF content_project_validations
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_project content_projects%ROWTYPE;
  v_piece content_pieces%ROWTYPE;
  v_dna_updated_at TIMESTAMPTZ;
  v_actor_role TEXT;
  v_actor_client_id UUID;
  v_validation content_project_validations%ROWTYPE;
BEGIN
  SELECT role::TEXT, client_id
    INTO v_actor_role, v_actor_client_id
  FROM users
  WHERE id = p_actor_id;
  IF NOT FOUND OR (v_actor_role <> 'super_admin' AND v_actor_client_id IS DISTINCT FROM p_client_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Forbidden.';
  END IF;
  IF jsonb_typeof(p_checks) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Validation checks must be an array.';
  END IF;

  SELECT *
    INTO v_project
  FROM content_projects
  WHERE id = p_project_id
    AND client_id = p_client_id
  FOR UPDATE;
  IF NOT FOUND OR v_project.current_piece_id IS DISTINCT FROM p_piece_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Connected content project not found.';
  END IF;
  IF v_project.status NOT IN ('active', 'saved') OR v_project.current_step <> 'validate' THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'The project is no longer at the validation step.';
  END IF;

  SELECT *
    INTO v_piece
  FROM content_pieces
  WHERE id = p_piece_id
    AND project_id = p_project_id
    AND client_id = p_client_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Connected draft not found.';
  END IF;
  IF v_piece.updated_at IS DISTINCT FROM p_expected_piece_updated_at THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'The draft changed during validation. Validate the latest version.';
  END IF;

  SELECT updated_at
    INTO v_dna_updated_at
  FROM company_dna
  WHERE client_id = p_client_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Complete Company DNA before validation.';
  END IF;

  INSERT INTO content_project_validations (
    client_id, project_id, piece_id, piece_updated_at, dna_updated_at,
    passed, checks, validated_by
  ) VALUES (
    p_client_id, p_project_id, p_piece_id, v_piece.updated_at, v_dna_updated_at,
    p_passed, p_checks, p_actor_id
  )
  RETURNING * INTO v_validation;

  RETURN NEXT v_validation;
END;
$$;

REVOKE ALL ON FUNCTION record_content_project_validation(
  UUID, UUID, UUID, UUID, TIMESTAMPTZ, BOOLEAN, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_content_project_validation(
  UUID, UUID, UUID, UUID, TIMESTAMPTZ, BOOLEAN, JSONB
) TO service_role;

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

DROP TRIGGER IF EXISTS content_projects_step_guard ON content_projects;
CREATE TRIGGER content_projects_step_guard
BEFORE UPDATE OF current_step, status ON content_projects
FOR EACH ROW
EXECUTE FUNCTION enforce_content_project_step_transition();

REVOKE ALL ON FUNCTION enforce_content_project_step_transition()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION enforce_connected_content_validation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_project content_projects%ROWTYPE;
BEGIN
  IF NEW.status = 'approved'
     AND OLD.status IS DISTINCT FROM 'approved'
     AND NEW.project_id IS NOT NULL THEN
    IF NEW.title IS DISTINCT FROM OLD.title
       OR NEW.body IS DISTINCT FROM OLD.body
       OR NEW.content_type IS DISTINCT FROM OLD.content_type THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'Save and validate the latest draft before approval.';
    END IF;

    SELECT *
      INTO v_project
    FROM content_projects
    WHERE id = NEW.project_id
      AND client_id = NEW.client_id
    FOR SHARE;
    IF NOT FOUND
       OR v_project.current_piece_id IS DISTINCT FROM NEW.id
       OR v_project.current_step <> 'approve'
       OR NOT content_project_validation_is_current(NEW.client_id, v_project.id, NEW.id) THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'Validate the latest connected draft successfully before approval.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS content_pieces_connected_validation_guard ON content_pieces;
CREATE TRIGGER content_pieces_connected_validation_guard
BEFORE UPDATE OF status, title, body, content_type ON content_pieces
FOR EACH ROW
EXECUTE FUNCTION enforce_connected_content_validation();

REVOKE ALL ON FUNCTION enforce_connected_content_validation()
  FROM PUBLIC, anon, authenticated;

-- Source settings allow 100 captured items. Feed/sitemap discovery performs up
-- to twelve bounded index reads, while LinkedIn may add one feed discovery
-- request. Accept the resulting reservation instead of rejecting a valid UI
-- configuration before collection starts.
CREATE OR REPLACE FUNCTION create_competitor_crawl_job(
  p_source_id UUID,
  p_competitor_id UUID,
  p_client_id UUID,
  p_created_by UUID,
  p_pages_requested INT,
  p_daily_crawl_limit INT DEFAULT 20,
  p_daily_page_limit INT DEFAULT 500
)
RETURNS SETOF competitor_crawl_jobs
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_usage competitor_crawl_usage%ROWTYPE;
BEGIN
  IF p_pages_requested < 1 OR p_pages_requested > 112 THEN
    RAISE EXCEPTION 'Invalid page budget.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO competitor_crawl_usage (client_id, usage_date)
  VALUES (p_client_id, CURRENT_DATE)
  ON CONFLICT (client_id, usage_date) DO NOTHING;

  SELECT * INTO v_usage
  FROM competitor_crawl_usage
  WHERE client_id = p_client_id AND usage_date = CURRENT_DATE
  FOR UPDATE;

  IF v_usage.crawls_started + 1 > greatest(1, p_daily_crawl_limit)
     OR v_usage.pages_reserved + p_pages_requested > greatest(1, p_daily_page_limit) THEN
    RAISE EXCEPTION 'Daily competitor collection budget reached.'
      USING ERRCODE = 'P0001', HINT = 'Try again after the daily budget resets.';
  END IF;

  UPDATE competitor_crawl_usage
  SET
    crawls_started = crawls_started + 1,
    pages_reserved = pages_reserved + p_pages_requested,
    updated_at = clock_timestamp()
  WHERE client_id = p_client_id AND usage_date = CURRENT_DATE;

  RETURN QUERY
  INSERT INTO competitor_crawl_jobs (
    source_id, competitor_id, client_id, status, created_by
  ) VALUES (
    p_source_id, p_competitor_id, p_client_id, 'queued', p_created_by
  )
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION create_competitor_crawl_job(
  UUID, UUID, UUID, UUID, INT, INT, INT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_competitor_crawl_job(
  UUID, UUID, UUID, UUID, INT, INT, INT
) TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('114_content_workflow_validation_integrity.sql')
ON CONFLICT DO NOTHING;
