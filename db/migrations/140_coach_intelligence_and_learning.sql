-- ============================================================
-- 140_coach_intelligence_and_learning.sql
-- Phase 4: semantic Business Library retrieval, explicit owner-private Coach
-- memory, consented Library-gap suggestions and quality observability.
-- ============================================================

ALTER TABLE brain_context_snapshots
  DROP CONSTRAINT IF EXISTS brain_context_snapshots_resolver_version_check;
ALTER TABLE brain_context_snapshots
  ADD CONSTRAINT brain_context_snapshots_resolver_version_check CHECK (
    resolver_version IN (
      'resolver-v1','resolver-v2-task-memory','resolver-v3-business-library',
      'resolver-v4-library-availability','resolver-v5-role-aware-coach',
      'resolver-v6-coach-operations','resolver-v7-coach-progress',
      'resolver-v8-coach-intelligence'
    )
  );

ALTER TABLE brain_evaluation_cases
  DROP CONSTRAINT IF EXISTS brain_evaluation_cases_case_type_check;
ALTER TABLE brain_evaluation_cases
  ADD CONSTRAINT brain_evaluation_cases_case_type_check CHECK (
    case_type IN ('ask','coach_client','coach_va','content_idea','content_draft','tool')
  );

-- The platform standard is Supabase gte-small (384 dimensions). The original
-- Library table was created at 1536 dimensions but never had an official
-- indexer, so reset that unused column before the first governed index run.
DROP INDEX IF EXISTS business_library_chunks_embedding_idx;
ALTER TABLE business_library_chunks
  ALTER COLUMN embedding TYPE VECTOR(384) USING NULL::VECTOR(384),
  ADD COLUMN IF NOT EXISTS embedding_model TEXT,
  ADD COLUMN IF NOT EXISTS embedded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS embedding_error TEXT,
  ADD COLUMN IF NOT EXISTS embedding_attempts SMALLINT NOT NULL DEFAULT 0
    CHECK (embedding_attempts BETWEEN 0 AND 100);
CREATE INDEX business_library_chunks_embedding_idx
  ON business_library_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS business_library_chunks_unembedded_idx
  ON business_library_chunks (created_at, id) WHERE embedding IS NULL;

CREATE OR REPLACE FUNCTION match_business_library_chunks_hybrid(
  p_query_embedding VECTOR(384),
  p_query TEXT,
  p_match_count INTEGER DEFAULT 8,
  p_channel TEXT DEFAULT NULL,
  p_audience TEXT DEFAULT NULL,
  p_coach_role TEXT DEFAULT NULL
)
RETURNS TABLE (
  entry_id UUID, version_id UUID, chunk_id UUID, version_number INTEGER,
  title TEXT, summary TEXT, content TEXT, category TEXT, source_url TEXT,
  tags TEXT[], rank REAL, retrieval_method TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH search AS (
    SELECT CASE WHEN length(btrim(coalesce(p_query, ''))) > 0
      THEN websearch_to_tsquery('english', left(btrim(p_query), 4000))
      ELSE NULL END AS query
  ), candidates AS (
    SELECT e.id AS entry_id, v.id AS version_id, c.id AS chunk_id,
      v.version_number, v.title, v.summary, c.content,
      category.name AS category, v.source_url, v.tags, v.published_at,
      CASE WHEN p_query_embedding IS NOT NULL AND c.embedding IS NOT NULL
        THEN greatest(0, 1 - (c.embedding <=> p_query_embedding)) ELSE 0 END AS semantic_score,
      CASE WHEN search.query IS NOT NULL AND c.search_vector @@ search.query
        THEN ts_rank_cd(c.search_vector, search.query, 32) ELSE 0 END AS lexical_score,
      CASE
        WHEN p_channel IS NOT NULL AND p_channel = ANY(v.channels) THEN 0.05
        ELSE 0 END
      + CASE WHEN p_audience IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(v.audiences) audience
          WHERE lower(p_audience) LIKE '%' || lower(audience) || '%'
             OR lower(audience) LIKE '%' || lower(p_audience) || '%'
        ) THEN 0.05 ELSE 0 END
      + CASE
          WHEN p_coach_role = 'client' AND EXISTS (
            SELECT 1 FROM unnest(v.audiences) audience
            WHERE lower(audience) ~ '(client|owner|founder|director|business)'
          ) THEN 0.06
          WHEN p_coach_role = 'va' AND EXISTS (
            SELECT 1 FROM unnest(v.audiences) audience
            WHERE lower(audience) ~ '(va|assistant|operator|team|specialist)'
          ) THEN 0.06
          ELSE 0 END AS context_boost
    FROM search
    JOIN business_library_chunks c ON true
    JOIN business_library_versions v ON v.id = c.version_id
    JOIN business_library_entries e ON e.id = v.entry_id AND e.current_version_id = v.id
    JOIN business_library_categories category ON category.id = v.category_id AND category.is_active
    WHERE v.status = 'published' AND e.retired_at IS NULL
      AND (v.valid_from IS NULL OR v.valid_from <= current_date)
      AND (v.valid_until IS NULL OR v.valid_until >= current_date)
      AND (v.review_due_at IS NULL OR v.review_due_at > clock_timestamp())
      AND (p_channel IS NULL OR cardinality(v.channels) = 0 OR p_channel = ANY(v.channels))
      AND (
        (p_query_embedding IS NOT NULL AND c.embedding IS NOT NULL)
        OR (search.query IS NOT NULL AND c.search_vector @@ search.query)
      )
  )
  SELECT entry_id, version_id, chunk_id, version_number, title, summary,
    content, category, source_url, tags,
    least(1.0, semantic_score * 0.72 + least(lexical_score, 1) * 0.22 + context_boost)::REAL,
    CASE WHEN semantic_score > 0 AND lexical_score > 0 THEN 'hybrid'
         WHEN semantic_score > 0 THEN 'semantic' ELSE 'full_text' END
  FROM candidates
  WHERE semantic_score >= 0.28 OR lexical_score > 0
  ORDER BY (semantic_score * 0.72 + least(lexical_score, 1) * 0.22 + context_boost) DESC,
    published_at DESC, chunk_id
  LIMIT greatest(1, least(coalesce(p_match_count, 8), 30));
$$;
REVOKE ALL ON FUNCTION match_business_library_chunks_hybrid(VECTOR,TEXT,INTEGER,TEXT,TEXT,TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION match_business_library_chunks_hybrid(VECTOR,TEXT,INTEGER,TEXT,TEXT,TEXT)
  TO service_role;

CREATE TABLE IF NOT EXISTS coach_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('preference','decision','context','challenge')),
  content TEXT NOT NULL CHECK (length(btrim(content)) BETWEEN 3 AND 2000),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','muted')),
  source_turn_id UUID REFERENCES coach_turns(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, client_id, owner_id)
);
CREATE INDEX IF NOT EXISTS coach_memories_owner_status
  ON coach_memories (owner_id, status, updated_at DESC);
ALTER TABLE coach_memories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS coach_memories_owner_select ON coach_memories;
CREATE POLICY coach_memories_owner_select ON coach_memories FOR SELECT
  USING (owner_id = auth.uid() AND client_id = current_user_client_id());
REVOKE INSERT, UPDATE, DELETE ON coach_memories FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION create_coach_memory(
  p_client_id UUID, p_owner_id UUID, p_kind TEXT, p_content TEXT,
  p_source_turn_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_memory coach_memories%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_owner_id AND client_id = p_client_id
    AND role IN ('client_admin','va')) THEN RAISE EXCEPTION 'coach_owner_forbidden'; END IF;
  IF p_kind NOT IN ('preference','decision','context','challenge')
    OR length(btrim(coalesce(p_content, ''))) < 3 THEN
    RAISE EXCEPTION 'coach_memory_invalid';
  END IF;
  IF p_source_turn_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM coach_turns WHERE id = p_source_turn_id
      AND client_id = p_client_id AND owner_id = p_owner_id
  ) THEN RAISE EXCEPTION 'coach_turn_mismatch'; END IF;
  INSERT INTO coach_memories (client_id, owner_id, kind, content, source_turn_id)
  VALUES (p_client_id, p_owner_id, p_kind, left(btrim(p_content), 2000), p_source_turn_id)
  RETURNING * INTO v_memory;
  RETURN to_jsonb(v_memory);
END;
$$;
REVOKE ALL ON FUNCTION create_coach_memory(UUID,UUID,TEXT,TEXT,UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_coach_memory(UUID,UUID,TEXT,TEXT,UUID) TO service_role;

CREATE TABLE IF NOT EXISTS business_library_gap_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  brain_context_snapshot_id UUID REFERENCES brain_context_snapshots(id) ON DELETE SET NULL,
  coach_role TEXT NOT NULL CHECK (coach_role IN ('client','va')),
  topic TEXT NOT NULL CHECK (length(btrim(topic)) BETWEEN 3 AND 500),
  detail TEXT NOT NULL DEFAULT '' CHECK (length(detail) <= 2000),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','planned','published','dismissed')),
  consented_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS business_library_gap_suggestions_status
  ON business_library_gap_suggestions (status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS business_library_gap_suggestions_snapshot_owner
  ON business_library_gap_suggestions (brain_context_snapshot_id, owner_id)
  WHERE brain_context_snapshot_id IS NOT NULL AND owner_id IS NOT NULL;
ALTER TABLE business_library_gap_suggestions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON business_library_gap_suggestions FROM PUBLIC, anon, authenticated;
GRANT ALL ON business_library_gap_suggestions TO service_role;

ALTER TABLE coach_turns DROP CONSTRAINT IF EXISTS coach_turns_coach_mode_check;
ALTER TABLE coach_turns ADD CONSTRAINT coach_turns_coach_mode_check CHECK (coach_mode IN (
  'private','message_client','message_va_team','create_task','update_task',
  'submit_review','review_task','create_goal','create_commitment','create_memory'
));
ALTER TABLE coach_action_previews DROP CONSTRAINT IF EXISTS coach_action_previews_action_type_check;
ALTER TABLE coach_action_previews ADD CONSTRAINT coach_action_previews_action_type_check CHECK (action_type IN (
  'create_task','send_message','update_task','submit_review','review_task',
  'create_goal','create_commitment','create_memory'
));
ALTER TABLE coach_action_receipts DROP CONSTRAINT IF EXISTS coach_action_receipts_action_type_check;
ALTER TABLE coach_action_receipts ADD CONSTRAINT coach_action_receipts_action_type_check CHECK (action_type IN (
  'create_task','send_message','update_task','submit_review','review_task',
  'create_goal','create_commitment','create_memory'
));

CREATE OR REPLACE FUNCTION execute_coach_memory_action(
  p_idempotency_key UUID, p_turn_id UUID, p_client_id UUID, p_owner_id UUID,
  p_snapshot_id UUID, p_action JSONB
)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp(); v_preview coach_action_previews%ROWTYPE;
  v_receipt coach_action_receipts%ROWTYPE; v_payload_hash TEXT; v_result JSONB;
BEGIN
  IF jsonb_typeof(coalesce(p_action, 'null'::JSONB)) <> 'object'
    OR p_action->>'type' <> 'create_memory' THEN
    RETURN jsonb_build_object('ok', false, 'errorCode', 'coach_action_invalid');
  END IF;
  IF p_action->>'idempotencyKey' IS DISTINCT FROM p_idempotency_key::TEXT THEN
    RETURN jsonb_build_object('ok', false, 'errorCode', 'coach_idempotency_mismatch');
  END IF;
  SELECT * INTO v_preview FROM coach_action_previews
    WHERE idempotency_key = p_idempotency_key FOR UPDATE;
  IF NOT FOUND OR v_preview.client_id <> p_client_id OR v_preview.owner_id <> p_owner_id
    OR v_preview.brain_context_snapshot_id <> p_snapshot_id
    OR v_preview.action_type <> 'create_memory' THEN
    RETURN jsonb_build_object('ok', false, 'errorCode', 'coach_preview_mismatch');
  END IF;
  IF v_preview.expires_at <= v_now AND v_preview.status <> 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'errorCode', 'coach_preview_expired');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM coach_turns WHERE id = p_turn_id
    AND owner_id = p_owner_id AND client_id = p_client_id
    AND brain_context_snapshot_id = p_snapshot_id) THEN
    RETURN jsonb_build_object('ok', false, 'errorCode', 'coach_turn_mismatch');
  END IF;
  v_payload_hash := encode(extensions.digest(convert_to(p_action::TEXT, 'UTF8'), 'sha256'), 'hex');
  SELECT * INTO v_receipt FROM coach_action_receipts WHERE idempotency_key = p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_receipt.owner_id <> p_owner_id OR v_receipt.client_id <> p_client_id
      OR v_receipt.turn_id <> p_turn_id OR v_receipt.action_type <> 'create_memory'
      OR v_receipt.payload_hash <> v_payload_hash THEN
      RETURN jsonb_build_object('ok', false, 'errorCode', 'coach_replay_mismatch');
    END IF;
    IF v_receipt.status = 'completed' THEN
      RETURN jsonb_build_object('ok', true, 'replayed', true, 'result', v_receipt.result);
    END IF;
    IF v_receipt.status = 'processing' AND v_receipt.updated_at > v_now - interval '2 minutes' THEN
      RETURN jsonb_build_object('ok', false, 'errorCode', 'coach_action_processing');
    END IF;
    UPDATE coach_action_receipts SET status = 'processing', error_code = NULL, updated_at = v_now
      WHERE id = v_receipt.id;
  ELSE
    INSERT INTO coach_action_receipts (idempotency_key,turn_id,client_id,owner_id,action_type,payload,payload_hash,status,updated_at)
    VALUES (p_idempotency_key,p_turn_id,p_client_id,p_owner_id,'create_memory',p_action,v_payload_hash,'processing',v_now)
    RETURNING * INTO v_receipt;
  END IF;
  UPDATE coach_action_previews SET status = 'processing', updated_at = v_now WHERE id = v_preview.id;
  UPDATE coach_turns SET action_status = 'processing' WHERE id = p_turn_id AND owner_id = p_owner_id;
  BEGIN
    SELECT create_coach_memory(p_client_id,p_owner_id,p_action->>'kind',p_action->>'content',p_turn_id)
      INTO v_result;
    UPDATE coach_action_receipts SET status='completed',result=v_result,error_code=NULL,
      completed_at=v_now,updated_at=v_now WHERE id=v_receipt.id;
    UPDATE coach_action_previews SET status='completed',completed_at=v_now,updated_at=v_now WHERE id=v_preview.id;
    UPDATE coach_turns SET action_status='completed',action_completed_at=v_now WHERE id=p_turn_id AND owner_id=p_owner_id;
    RETURN jsonb_build_object('ok',true,'replayed',false,'result',v_result);
  EXCEPTION WHEN OTHERS THEN
    UPDATE coach_action_receipts SET status='failed',error_code=left(SQLERRM,200),updated_at=clock_timestamp()
      WHERE id=v_receipt.id;
    UPDATE coach_action_previews SET status='failed',updated_at=clock_timestamp() WHERE id=v_preview.id;
    UPDATE coach_turns SET action_status='failed' WHERE id=p_turn_id AND owner_id=p_owner_id;
    RETURN jsonb_build_object('ok',false,'errorCode',left(SQLERRM,200));
  END;
END;
$$;
REVOKE ALL ON FUNCTION execute_coach_memory_action(UUID,UUID,UUID,UUID,UUID,JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION execute_coach_memory_action(UUID,UUID,UUID,UUID,UUID,JSONB)
  TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('140_coach_intelligence_and_learning.sql') ON CONFLICT DO NOTHING;
