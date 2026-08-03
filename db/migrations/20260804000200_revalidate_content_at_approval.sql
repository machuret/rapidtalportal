-- Re-run deterministic validation against the exact saved revision on the
-- approval screen. Older projects can legitimately already be at `approve`,
-- and an editor may have changed the connected draft after the original
-- validation. The approval screen therefore needs to record a fresh verdict
-- without forcing an artificial step change first.

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
  IF v_project.status NOT IN ('active', 'saved') OR v_project.current_step NOT IN ('validate', 'approve') THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'The project is no longer at a validation or approval step.';
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

INSERT INTO schema_migrations (version)
VALUES ('20260804000200_revalidate_content_at_approval.sql')
ON CONFLICT DO NOTHING;
