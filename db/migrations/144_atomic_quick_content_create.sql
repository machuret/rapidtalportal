-- One idempotent transaction prepares Quick Create from idea to generation.
ALTER TABLE content_projects
  ADD COLUMN IF NOT EXISTS quick_create_key UUID,
  ADD COLUMN IF NOT EXISTS quick_create_request_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS content_projects_quick_create_key_unique
  ON content_projects (client_id, created_by, quick_create_key)
  WHERE quick_create_key IS NOT NULL;

ALTER TABLE content_projects
  DROP CONSTRAINT IF EXISTS content_projects_quick_create_hash_check,
  ADD CONSTRAINT content_projects_quick_create_hash_check CHECK (
    (quick_create_key IS NULL AND quick_create_request_hash IS NULL)
    OR (quick_create_key IS NOT NULL AND quick_create_request_hash ~ '^[0-9a-f]{64}$')
  );

CREATE OR REPLACE FUNCTION prepare_quick_content_project(
  p_client_id UUID,
  p_actor_id UUID,
  p_idempotency_key UUID,
  p_request_hash TEXT,
  p_title TEXT,
  p_idea JSONB,
  p_content_brief JSONB,
  p_vault_source_ids UUID[],
  p_vault_source_references JSONB,
  p_style_snapshot JSONB
)
RETURNS SETOF content_projects
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_actor_role TEXT;
  v_actor_client_id UUID;
  v_project content_projects%ROWTYPE;
  v_source JSONB;
  v_source_id UUID;
  v_valid_source_count INTEGER;
BEGIN
  SELECT role::TEXT, client_id INTO v_actor_role, v_actor_client_id
  FROM users WHERE id = p_actor_id;
  IF NOT FOUND OR (v_actor_role <> 'super_admin' AND v_actor_client_id IS DISTINCT FROM p_client_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Forbidden.';
  END IF;
  IF p_idempotency_key IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid Quick Create identity.';
  END IF;

  SELECT * INTO v_project FROM content_projects
  WHERE client_id = p_client_id AND created_by = p_actor_id
    AND quick_create_key = p_idempotency_key;
  IF FOUND THEN
    IF v_project.quick_create_request_hash IS DISTINCT FROM p_request_hash THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'This Quick Create key belongs to a different request.';
    END IF;
    RETURN NEXT v_project;
    RETURN;
  END IF;

  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 1 AND 300
     OR jsonb_typeof(p_idea) <> 'object'
     OR jsonb_typeof(p_content_brief) <> 'object'
     OR length(btrim(coalesce(p_content_brief ->> 'objective', ''))) = 0
     OR jsonb_typeof(p_vault_source_references) <> 'array'
     OR jsonb_typeof(p_style_snapshot) <> 'object'
     OR coalesce(cardinality(p_vault_source_ids), 0) > 20 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid Quick Create project.';
  END IF;

  SELECT count(*) INTO v_valid_source_count FROM vault_items
  WHERE client_id = p_client_id
    AND id = ANY(coalesce(p_vault_source_ids, '{}'::UUID[]))
    AND status = 'ready' AND evidence_role = 'factual'
    AND knowledge_status = 'active' AND NOT has_conflict
    AND (valid_from IS NULL OR valid_from <= current_date)
    AND (valid_until IS NULL OR valid_until >= current_date)
    AND (review_due_at IS NULL OR review_due_at > current_date);
  IF v_valid_source_count <> coalesce(cardinality(p_vault_source_ids), 0) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Quick Create contains unavailable Vault evidence.';
  END IF;

  FOR v_source IN SELECT value FROM jsonb_array_elements(p_vault_source_references)
  LOOP
    BEGIN
      v_source_id := (v_source ->> 'itemId')::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid Quick Create source reference.';
    END;
    IF v_source_id IS NULL OR NOT (v_source_id = ANY(coalesce(p_vault_source_ids, '{}'::UUID[]))) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Quick Create source provenance does not match its evidence.';
    END IF;
  END LOOP;

  BEGIN
    INSERT INTO content_projects (
      client_id, title, status, current_step, idea_snapshot, content_brief,
      vault_source_ids, vault_source_references, style_snapshot, created_by,
      quick_create_key, quick_create_request_hash
    ) VALUES (
      p_client_id, btrim(p_title), 'active', 'idea', p_idea, '{}'::jsonb,
      '{}'::UUID[], '[]'::jsonb, '{}'::jsonb, p_actor_id,
      p_idempotency_key, p_request_hash
    ) RETURNING * INTO v_project;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_project FROM content_projects
    WHERE client_id = p_client_id AND created_by = p_actor_id
      AND quick_create_key = p_idempotency_key;
    IF NOT FOUND OR v_project.quick_create_request_hash IS DISTINCT FROM p_request_hash THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Quick Create request conflict.';
    END IF;
    RETURN NEXT v_project;
    RETURN;
  END;

  -- Satisfy the database state machine while committing all preparation once.
  UPDATE content_projects SET content_brief = p_content_brief,
    style_snapshot = p_style_snapshot, current_step = 'brief'
  WHERE id = v_project.id;
  UPDATE content_projects SET current_step = 'evidence' WHERE id = v_project.id;
  UPDATE content_projects SET vault_source_ids = coalesce(p_vault_source_ids, '{}'::UUID[]),
    vault_source_references = p_vault_source_references, current_step = 'generate'
  WHERE id = v_project.id RETURNING * INTO v_project;

  RETURN NEXT v_project;
END;
$$;

REVOKE ALL ON FUNCTION prepare_quick_content_project(
  UUID, UUID, UUID, TEXT, TEXT, JSONB, JSONB, UUID[], JSONB, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION prepare_quick_content_project(
  UUID, UUID, UUID, TEXT, TEXT, JSONB, JSONB, UUID[], JSONB, JSONB
) TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('144_atomic_quick_content_create.sql')
ON CONFLICT (version) DO NOTHING;
