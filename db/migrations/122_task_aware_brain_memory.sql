-- ============================================================
-- 122_task_aware_brain_memory.sql
-- Semantic, task-scoped Brain memory with exact signal lineage.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE brain_memory
  ADD COLUMN IF NOT EXISTS embedding_vector vector(1536),
  ADD COLUMN IF NOT EXISTS first_observed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contradiction_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS contradicts_memory_id UUID REFERENCES brain_memory(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conflict_summary TEXT,
  ADD COLUMN IF NOT EXISTS conflict_resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS conflict_resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conflict_resolution TEXT,
  ADD COLUMN IF NOT EXISTS style_profile_version_at_confirmation INT,
  ADD COLUMN IF NOT EXISTS lineage_complete BOOLEAN NOT NULL DEFAULT false;

-- Existing Phase 1 OpenAI JSON embeddings are the same 1536-dimensional
-- model. Promote only vectors with the exact expected dimension.
UPDATE brain_memory
SET embedding_vector = embedding::text::vector
WHERE embedding_vector IS NULL
  AND jsonb_typeof(embedding) = 'array'
  AND jsonb_array_length(embedding) = 1536;

UPDATE brain_memory
SET
  first_observed_at = coalesce(first_observed_at, created_at),
  last_confirmed_at = coalesce(last_confirmed_at, last_reinforced_at, created_at)
WHERE first_observed_at IS NULL OR last_confirmed_at IS NULL;

ALTER TABLE brain_memory
  ALTER COLUMN first_observed_at SET DEFAULT now(),
  ALTER COLUMN first_observed_at SET NOT NULL,
  ALTER COLUMN last_confirmed_at SET DEFAULT now(),
  ALTER COLUMN last_confirmed_at SET NOT NULL;

ALTER TABLE brain_memory DROP CONSTRAINT IF EXISTS brain_memory_status_check;
ALTER TABLE brain_memory
  ADD CONSTRAINT brain_memory_status_check
  CHECK (status IN ('proposed', 'active', 'muted', 'review_required'));

ALTER TABLE brain_memory DROP CONSTRAINT IF EXISTS brain_memory_contradiction_status_check;
ALTER TABLE brain_memory
  ADD CONSTRAINT brain_memory_contradiction_status_check
  CHECK (contradiction_status IN ('none', 'open', 'resolved'));

CREATE INDEX IF NOT EXISTS brain_memory_embedding_vector_idx
  ON brain_memory USING ivfflat (embedding_vector vector_cosine_ops)
  WITH (lists = 50);
CREATE INDEX IF NOT EXISTS brain_memory_review_idx
  ON brain_memory (client_id, status, contradiction_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS brain_memory_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  memory_id UUID NOT NULL REFERENCES brain_memory(id) ON DELETE CASCADE,
  signal_id UUID NOT NULL REFERENCES brain_signals(id) ON DELETE RESTRICT,
  contribution TEXT NOT NULL DEFAULT 'support',
  supporting_excerpt TEXT NOT NULL,
  supporting_excerpt_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (memory_id, signal_id, contribution),
  CONSTRAINT brain_memory_sources_contribution_check
    CHECK (contribution IN ('support', 'contradict')),
  CONSTRAINT brain_memory_sources_hash_check
    CHECK (supporting_excerpt_hash ~ '^[a-f0-9]{64}$')
);

CREATE INDEX IF NOT EXISTS brain_memory_sources_memory_idx
  ON brain_memory_sources (memory_id, contribution, created_at);
CREATE INDEX IF NOT EXISTS brain_memory_sources_signal_idx
  ON brain_memory_sources (signal_id);

ALTER TABLE brain_memory_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brain_memory_sources_tenant_select ON brain_memory_sources;
CREATE POLICY brain_memory_sources_tenant_select
  ON brain_memory_sources FOR SELECT
  USING (client_id = current_user_client_id() OR current_user_role() = 'super_admin');

CREATE OR REPLACE FUNCTION validate_brain_memory_source()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_signal brain_signals%ROWTYPE;
  v_memory_client UUID;
BEGIN
  SELECT client_id INTO v_memory_client FROM brain_memory WHERE id = NEW.memory_id;
  SELECT * INTO v_signal FROM brain_signals WHERE id = NEW.signal_id;
  IF v_memory_client IS NULL OR v_signal.id IS NULL
    OR v_memory_client <> NEW.client_id OR v_signal.client_id <> NEW.client_id THEN
    RAISE EXCEPTION 'Memory lineage must stay inside one tenant';
  END IF;
  NEW.supporting_excerpt :=
    left(concat_ws(' — ', nullif(v_signal.reason, ''), v_signal.artifact_text), 2000);
  NEW.supporting_excerpt_hash :=
    encode(extensions.digest(NEW.supporting_excerpt, 'sha256'), 'hex');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS brain_memory_source_validate ON brain_memory_sources;
CREATE TRIGGER brain_memory_source_validate
BEFORE INSERT OR UPDATE ON brain_memory_sources
FOR EACH ROW EXECUTE FUNCTION validate_brain_memory_source();

CREATE OR REPLACE FUNCTION sync_brain_memory_source_count()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_memory_id UUID := coalesce(NEW.memory_id, OLD.memory_id);
BEGIN
  UPDATE brain_memory
  SET
    source_count = (
      SELECT count(DISTINCT signal_id)
      FROM brain_memory_sources
      WHERE memory_id = v_memory_id AND contribution = 'support'
    ),
    lineage_complete = EXISTS (
      SELECT 1 FROM brain_memory_sources
      WHERE memory_id = v_memory_id AND contribution = 'support'
    ),
    updated_at = clock_timestamp()
  WHERE id = v_memory_id;
  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS brain_memory_source_count_sync ON brain_memory_sources;
CREATE TRIGGER brain_memory_source_count_sync
AFTER INSERT OR DELETE OR UPDATE OF memory_id, signal_id, contribution
ON brain_memory_sources
FOR EACH ROW EXECUTE FUNCTION sync_brain_memory_source_count();

CREATE OR REPLACE FUNCTION guard_brain_memory_activation()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'active' AND NEW.active = true
    AND (OLD.status IS DISTINCT FROM 'active' OR OLD.active IS DISTINCT FROM true) THEN
    IF NEW.lineage_complete IS NOT true THEN
      RAISE EXCEPTION 'A lesson requires exact evidence lineage before activation';
    END IF;
    IF NEW.approved_by IS NULL OR NEW.approved_at IS NULL THEN
      RAISE EXCEPTION 'A lesson requires human approval before activation';
    END IF;
    IF NEW.contradiction_status = 'open' THEN
      RAISE EXCEPTION 'A conflicting lesson must be resolved before activation';
    END IF;
  END IF;
  IF NEW.status <> 'active' THEN NEW.active := false; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS brain_memory_activation_guard ON brain_memory;
CREATE TRIGGER brain_memory_activation_guard
BEFORE INSERT OR UPDATE OF status, active, approved_by, approved_at
ON brain_memory FOR EACH ROW EXECUTE FUNCTION guard_brain_memory_activation();

CREATE OR REPLACE FUNCTION brain_memory_scope_matches(
  p_scope JSONB,
  p_surface TEXT,
  p_channel TEXT DEFAULT NULL,
  p_content_type TEXT DEFAULT NULL,
  p_audience TEXT DEFAULT NULL,
  p_objective TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
  WITH scope AS (
    SELECT coalesce(p_scope, '{}'::jsonb) AS value
  ), dimensions AS (
    SELECT
      coalesce(value->>'global', 'false')::boolean
        OR value = '{}'::jsonb
        OR value->'surfaces' ? 'all' AS is_global,
      coalesce(value->'surfaces', '[]'::jsonb) AS surfaces,
      coalesce(value->'channels', '[]'::jsonb) AS channels,
      coalesce(value->'contentTypes', '[]'::jsonb) AS content_types,
      coalesce(value->'audiences', '[]'::jsonb) AS audiences,
      coalesce(value->'objectives', '[]'::jsonb) AS objectives
    FROM scope
  )
  SELECT is_global OR (
    (
      jsonb_array_length(surfaces) = 0
      OR surfaces ? lower(coalesce(p_surface, ''))
      OR (lower(coalesce(p_surface, '')) = 'ask' AND surfaces ?| ARRAY['vault_answer','vault','kb'])
      OR (lower(coalesce(p_surface, '')) = 'content' AND surfaces ?| ARRAY['content_topic','content_draft','content_outcome'])
    )
    AND (
      jsonb_array_length(channels) = 0
      OR channels ? lower(coalesce(p_channel, ''))
      OR (channels ? 'social' AND lower(coalesce(p_channel, '')) IN ('linkedin','facebook','instagram'))
    )
    AND (
      jsonb_array_length(content_types) = 0
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(content_types) value
        WHERE lower(coalesce(p_content_type, '')) = lower(value)
          OR lower(coalesce(p_content_type, '')) LIKE '%' || lower(value) || '%'
          OR lower(value) LIKE '%' || lower(coalesce(p_content_type, '')) || '%'
      )
    )
    AND (
      jsonb_array_length(audiences) = 0
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(audiences) value
        WHERE lower(coalesce(p_audience, '')) LIKE '%' || lower(value) || '%'
          OR lower(value) LIKE '%' || lower(coalesce(p_audience, '')) || '%'
      )
    )
    AND (
      jsonb_array_length(objectives) = 0
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(objectives) value
        WHERE lower(coalesce(p_objective, '')) LIKE '%' || lower(value) || '%'
          OR lower(value) LIKE '%' || lower(coalesce(p_objective, '')) || '%'
      )
    )
  )
  FROM dimensions;
$$;

CREATE OR REPLACE FUNCTION match_brain_memories(
  p_client_id UUID,
  p_query_embedding vector(1536),
  p_surface TEXT,
  p_channel TEXT DEFAULT NULL,
  p_content_type TEXT DEFAULT NULL,
  p_limit INT DEFAULT 12,
  p_audience TEXT DEFAULT NULL,
  p_objective TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  kind TEXT,
  content TEXT,
  confidence SMALLINT,
  source_count INTEGER,
  pinned BOOLEAN,
  scope JSONB,
  semantic_relevance DOUBLE PRECISION,
  scope_specificity DOUBLE PRECISION,
  rank_score DOUBLE PRECISION,
  selection_reason TEXT
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH eligible AS (
    SELECT
      bm.*,
      CASE
        WHEN p_query_embedding IS NULL OR bm.embedding_vector IS NULL THEN 0
        ELSE greatest(0, least(1, 1 - (bm.embedding_vector <=> p_query_embedding)))
      END AS semantic,
      least(1.0,
        0.20
        + CASE WHEN jsonb_array_length(coalesce(bm.scope->'surfaces', '[]'::jsonb)) > 0 THEN 0.16 ELSE 0 END
        + CASE WHEN jsonb_array_length(coalesce(bm.scope->'channels', '[]'::jsonb)) > 0 THEN 0.16 ELSE 0 END
        + CASE WHEN jsonb_array_length(coalesce(bm.scope->'contentTypes', '[]'::jsonb)) > 0 THEN 0.16 ELSE 0 END
        + CASE WHEN jsonb_array_length(coalesce(bm.scope->'audiences', '[]'::jsonb)) > 0 THEN 0.16 ELSE 0 END
        + CASE WHEN jsonb_array_length(coalesce(bm.scope->'objectives', '[]'::jsonb)) > 0 THEN 0.16 ELSE 0 END
      ) AS specificity,
      least(1.0, ln(1 + greatest(bm.source_count, 0)) / ln(6.0)) * 0.6
        + exp(-greatest(0, extract(epoch FROM (clock_timestamp() - bm.last_confirmed_at)) / 86400) / 120.0) * 0.4
        AS reinforcement_freshness
    FROM brain_memory bm
    WHERE bm.client_id = p_client_id
      AND bm.status = 'active'
      AND bm.active = true
      AND bm.contradiction_status <> 'open'
      AND brain_memory_scope_matches(
        bm.scope, p_surface, p_channel, p_content_type, p_audience, p_objective
      )
  ), scored AS (
    SELECT
      e.*,
      (
        0.35 * semantic
        + 0.25 * specificity
        + 0.15 * CASE WHEN pinned THEN 1 ELSE 0 END
        + 0.15 * (confidence::double precision / 100.0)
        + 0.10 * reinforcement_freshness
      ) AS score
    FROM eligible e
  ), ordered AS (
    SELECT
      s.*,
      row_number() OVER (
        PARTITION BY CASE WHEN kind = 'rule' THEN 'rule' ELSE 'ranked' END
        ORDER BY score DESC, pinned DESC, confidence DESC, id
      ) AS kind_rank
    FROM scored s
  )
  SELECT
    o.id,
    o.kind,
    o.content,
    o.confidence,
    o.source_count,
    o.pinned,
    o.scope,
    o.semantic,
    o.specificity,
    o.score,
    CASE
      WHEN o.kind = 'rule' THEN 'Applicable hard rule; included outside the preference budget.'
      WHEN o.pinned THEN 'Pinned and relevant to this task.'
      WHEN o.embedding_vector IS NULL THEN 'Task scope, confidence, and evidence strength match; semantic vector pending.'
      ELSE 'Semantic relevance, task scope, confidence, evidence strength, and freshness match.'
    END
  FROM ordered o
  WHERE (o.kind = 'rule' AND o.kind_rank <= 100)
     OR (o.kind <> 'rule' AND o.kind_rank <= greatest(1, least(coalesce(p_limit, 12), 30)))
  ORDER BY CASE WHEN o.kind = 'rule' THEN 0 ELSE 1 END, o.score DESC, o.id;
$$;

-- Lossless Phase 2 commit. New lessons are always proposed. Approved lessons
-- may be reinforced automatically; every contribution is linked to an exact
-- signal owned by the current lease.
CREATE OR REPLACE FUNCTION commit_brain_distillation(
  p_client_id UUID,
  p_claim_token UUID,
  p_signal_ids UUID[],
  p_operations JSONB
)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_expected INT := coalesce(cardinality(p_signal_ids), 0);
  v_claimed INT;
  v_marked INT;
  v_inserted INT := 0;
  v_reinforced INT := 0;
  v_proposed INT := 0;
  v_conflicts INT := 0;
  v_op JSONB;
  v_memory_id UUID;
  v_conflict_id UUID;
  v_signal_id UUID;
  v_kind TEXT;
  v_confidence INT;
  v_scope JSONB;
  v_surface_count INT;
BEGIN
  IF v_expected = 0 OR (
    SELECT count(DISTINCT signal_id) FROM unnest(p_signal_ids) ids(signal_id)
  ) <> v_expected THEN
    RAISE EXCEPTION 'Distillation requires a non-empty unique signal set';
  END IF;

  SELECT count(*) INTO v_claimed
  FROM brain_signals
  WHERE client_id = p_client_id
    AND id = ANY(p_signal_ids)
    AND distilled_at IS NULL
    AND distill_claim_token = p_claim_token
    AND distill_claim_until > v_now;
  IF v_claimed <> v_expected THEN
    RAISE EXCEPTION 'Distillation claim is missing, stale, or incomplete';
  END IF;
  IF jsonb_typeof(coalesce(p_operations, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Distillation operations must be an object';
  END IF;

  FOR v_op IN SELECT value FROM jsonb_array_elements(coalesce(p_operations->'backfills', '[]'::jsonb))
  LOOP
    v_memory_id := (v_op->>'id')::UUID;
    UPDATE brain_memory SET
      embedding = nullif(v_op->'embedding', 'null'::jsonb),
      embedding_vector = CASE
        WHEN jsonb_typeof(v_op->'embedding') = 'array'
        THEN (v_op->'embedding')::text::vector
        ELSE embedding_vector
      END,
      updated_at = v_now
    WHERE id = v_memory_id AND client_id = p_client_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cannot backfill memory %', v_memory_id; END IF;
  END LOOP;

  FOR v_op IN SELECT value FROM jsonb_array_elements(coalesce(p_operations->'reinforces', '[]'::jsonb))
  LOOP
    v_memory_id := (v_op->>'id')::UUID;
    UPDATE brain_memory SET
      confidence = CASE
        WHEN status = 'active' AND contradiction_status <> 'open'
        THEN least(100, confidence + 8)
        ELSE confidence
      END,
      last_reinforced_at = v_now,
      last_confirmed_at = CASE
        WHEN status = 'active' AND contradiction_status <> 'open'
        THEN v_now
        ELSE last_confirmed_at
      END,
      updated_at = v_now
    WHERE id = v_memory_id
      AND client_id = p_client_id
      AND status IN ('active', 'proposed');
    IF NOT FOUND THEN RAISE EXCEPTION 'Cannot reinforce memory %', v_memory_id; END IF;

    FOR v_signal_id IN
      SELECT value::UUID FROM jsonb_array_elements_text(coalesce(v_op->'signalIds', '[]'::jsonb)) values(value)
    LOOP
      IF NOT (v_signal_id = ANY(p_signal_ids)) THEN
        RAISE EXCEPTION 'Reinforcement signal % is not owned by this claim', v_signal_id;
      END IF;
      INSERT INTO brain_memory_sources (
        client_id, memory_id, signal_id, contribution,
        supporting_excerpt, supporting_excerpt_hash
      )
      SELECT
        p_client_id, v_memory_id, bs.id, 'support',
        left(concat_ws(' — ', nullif(bs.reason, ''), bs.artifact_text), 2000),
        encode(extensions.digest(left(concat_ws(' — ', nullif(bs.reason, ''), bs.artifact_text), 2000), 'sha256'), 'hex')
      FROM brain_signals bs
      WHERE bs.id = v_signal_id AND bs.client_id = p_client_id
      ON CONFLICT (memory_id, signal_id, contribution) DO NOTHING;
    END LOOP;
    v_reinforced := v_reinforced + 1;
  END LOOP;

  FOR v_op IN SELECT value FROM jsonb_array_elements(coalesce(p_operations->'inserts', '[]'::jsonb))
  LOOP
    v_kind := v_op->>'kind';
    v_confidence := (v_op->>'confidence')::INT;
    v_scope := coalesce(v_op->'scope', '{}'::jsonb);
    v_conflict_id := nullif(v_op->>'contradictsMemoryId', '')::UUID;
    IF v_kind NOT IN ('preference', 'anti_pattern', 'rule')
      OR v_confidence NOT BETWEEN 0 AND 100
      OR nullif(trim(v_op->>'content'), '') IS NULL THEN
      RAISE EXCEPTION 'Invalid memory candidate';
    END IF;
    IF jsonb_typeof(v_scope) <> 'object'
      OR (v_scope ? 'surfaces' AND jsonb_typeof(v_scope->'surfaces') <> 'array')
      OR (v_scope ? 'channels' AND jsonb_typeof(v_scope->'channels') <> 'array')
      OR (v_scope ? 'contentTypes' AND jsonb_typeof(v_scope->'contentTypes') <> 'array')
      OR (v_scope ? 'audiences' AND jsonb_typeof(v_scope->'audiences') <> 'array')
      OR (v_scope ? 'objectives' AND jsonb_typeof(v_scope->'objectives') <> 'array')
      OR (v_scope ? 'global' AND jsonb_typeof(v_scope->'global') <> 'boolean') THEN
      RAISE EXCEPTION 'Invalid memory scope shape';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(coalesce(v_scope->'surfaces', '[]'::jsonb)) value
      WHERE value NOT IN ('ask','content','compose','tool')
    ) OR EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(coalesce(v_scope->'channels', '[]'::jsonb)) value
      WHERE value NOT IN ('linkedin','facebook','instagram','email','blog','newsletter')
    ) THEN
      RAISE EXCEPTION 'Invalid memory surface or channel';
    END IF;
    IF coalesce((v_scope->>'global')::boolean, false) = false THEN
      SELECT jsonb_array_length(coalesce(v_scope->'surfaces', '[]'::jsonb))
      INTO v_surface_count;
      IF v_surface_count = 0 THEN
        RAISE EXCEPTION 'New lessons require a surface or explicit global scope';
      END IF;
    END IF;

    IF v_conflict_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM brain_memory WHERE id = v_conflict_id AND client_id = p_client_id
    ) THEN
      RAISE EXCEPTION 'Conflicting memory is outside the client';
    END IF;

    INSERT INTO brain_memory (
      client_id, kind, content, confidence, source_count, status, active,
      scope, embedding, embedding_vector, first_observed_at, last_confirmed_at,
      last_reinforced_at, contradiction_status, contradicts_memory_id,
      conflict_summary, lineage_complete, updated_at
    ) VALUES (
      p_client_id, v_kind, trim(v_op->>'content'), v_confidence, 0,
      CASE WHEN v_conflict_id IS NULL THEN 'proposed' ELSE 'review_required' END,
      false, v_scope, nullif(v_op->'embedding', 'null'::jsonb),
      CASE WHEN jsonb_typeof(v_op->'embedding') = 'array'
        THEN (v_op->'embedding')::text::vector ELSE NULL END,
      v_now, v_now, v_now,
      CASE WHEN v_conflict_id IS NULL THEN 'none' ELSE 'open' END,
      v_conflict_id, nullif(trim(v_op->>'conflictSummary'), ''), false, v_now
    ) RETURNING id INTO v_memory_id;

    FOR v_signal_id IN
      SELECT value::UUID FROM jsonb_array_elements_text(coalesce(v_op->'signalIds', '[]'::jsonb)) values(value)
    LOOP
      IF NOT (v_signal_id = ANY(p_signal_ids)) THEN
        RAISE EXCEPTION 'Candidate signal % is not owned by this claim', v_signal_id;
      END IF;
      INSERT INTO brain_memory_sources (
        client_id, memory_id, signal_id, contribution,
        supporting_excerpt, supporting_excerpt_hash
      )
      SELECT
        p_client_id, v_memory_id, bs.id, 'support',
        left(concat_ws(' — ', nullif(bs.reason, ''), bs.artifact_text), 2000),
        encode(extensions.digest(left(concat_ws(' — ', nullif(bs.reason, ''), bs.artifact_text), 2000), 'sha256'), 'hex')
      FROM brain_signals bs
      WHERE bs.id = v_signal_id AND bs.client_id = p_client_id
      ON CONFLICT (memory_id, signal_id, contribution) DO NOTHING;
    END LOOP;
    IF NOT EXISTS (
      SELECT 1 FROM brain_memory_sources
      WHERE memory_id = v_memory_id AND contribution = 'support'
    ) THEN
      RAISE EXCEPTION 'Every candidate requires at least one exact supporting signal';
    END IF;

    IF v_conflict_id IS NOT NULL THEN
      UPDATE brain_memory
      SET contradiction_status = 'open', updated_at = v_now
      WHERE id = v_conflict_id AND client_id = p_client_id;
      INSERT INTO brain_memory_sources (
        client_id, memory_id, signal_id, contribution,
        supporting_excerpt, supporting_excerpt_hash
      )
      SELECT
        p_client_id, v_conflict_id, bs.id, 'contradict',
        left(concat_ws(' — ', nullif(bs.reason, ''), bs.artifact_text), 2000),
        encode(extensions.digest(left(concat_ws(' — ', nullif(bs.reason, ''), bs.artifact_text), 2000), 'sha256'), 'hex')
      FROM brain_signals bs
      WHERE bs.id = ANY(p_signal_ids) AND bs.client_id = p_client_id
      ON CONFLICT (memory_id, signal_id, contribution) DO NOTHING;
      v_conflicts := v_conflicts + 1;
    ELSE
      v_proposed := v_proposed + 1;
    END IF;
  END LOOP;

  UPDATE brain_signals SET
    distilled_at = v_now,
    distill_claim_token = NULL,
    distill_claim_until = NULL
  WHERE client_id = p_client_id
    AND id = ANY(p_signal_ids)
    AND distilled_at IS NULL
    AND distill_claim_token = p_claim_token;
  GET DIAGNOSTICS v_marked = ROW_COUNT;
  IF v_marked <> v_expected THEN
    RAISE EXCEPTION 'Distillation acknowledgement lost ownership';
  END IF;

  RETURN jsonb_build_object(
    'processedSignals', v_marked,
    'newMemories', v_inserted,
    'reinforced', v_reinforced,
    'proposed', v_proposed,
    'conflicts', v_conflicts
  );
END;
$$;

CREATE OR REPLACE FUNCTION resolve_brain_memory_conflict(
  p_client_id UUID,
  p_memory_id UUID,
  p_action TEXT,
  p_actor_id UUID,
  p_resolution JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_proposed brain_memory%ROWTYPE;
  v_existing brain_memory%ROWTYPE;
BEGIN
  SELECT * INTO v_proposed FROM brain_memory
  WHERE id = p_memory_id AND client_id = p_client_id
  FOR UPDATE;
  IF NOT FOUND OR v_proposed.status <> 'review_required' OR v_proposed.contradicts_memory_id IS NULL THEN
    RAISE EXCEPTION 'Memory is not an open conflict';
  END IF;
  SELECT * INTO v_existing FROM brain_memory
  WHERE id = v_proposed.contradicts_memory_id AND client_id = p_client_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Existing conflicting memory is missing'; END IF;
  IF p_action NOT IN ('keep_existing','replace_existing','merge','narrow','keep_both') THEN
    RAISE EXCEPTION 'Unsupported conflict action';
  END IF;

  IF p_action = 'keep_existing' THEN
    UPDATE brain_memory SET status='muted', active=false, contradiction_status='resolved'
    WHERE id=v_proposed.id;
    UPDATE brain_memory SET contradiction_status='resolved' WHERE id=v_existing.id;
  ELSIF p_action = 'replace_existing' THEN
    UPDATE brain_memory SET status='muted', active=false, contradiction_status='resolved' WHERE id=v_existing.id;
    UPDATE brain_memory SET status='active', active=true, contradiction_status='resolved',
      approved_by=p_actor_id, approved_at=v_now WHERE id=v_proposed.id;
  ELSIF p_action = 'merge' THEN
    IF nullif(trim(p_resolution->>'content'), '') IS NULL THEN RAISE EXCEPTION 'Merge requires content'; END IF;
    INSERT INTO brain_memory_sources (
      client_id, memory_id, signal_id, contribution,
      supporting_excerpt, supporting_excerpt_hash, created_at
    )
    SELECT
      p_client_id, v_existing.id, source.signal_id, 'support',
      source.supporting_excerpt, source.supporting_excerpt_hash, source.created_at
    FROM brain_memory_sources source
    WHERE source.memory_id = v_proposed.id
      AND source.contribution = 'support'
    ON CONFLICT (memory_id, signal_id, contribution) DO NOTHING;
    UPDATE brain_memory SET
      content=trim(p_resolution->>'content'),
      scope=coalesce(p_resolution->'scope', scope),
      contradiction_status='resolved', approved_by=p_actor_id, approved_at=v_now
    WHERE id=v_existing.id;
    UPDATE brain_memory SET status='muted', active=false, contradiction_status='resolved' WHERE id=v_proposed.id;
  ELSE
    IF jsonb_typeof(p_resolution->'existingScope') <> 'object'
      OR jsonb_typeof(p_resolution->'proposedScope') <> 'object' THEN
      RAISE EXCEPTION 'Narrow/keep-both requires two explicit scopes';
    END IF;
    UPDATE brain_memory SET scope=p_resolution->'existingScope', contradiction_status='resolved'
    WHERE id=v_existing.id;
    UPDATE brain_memory SET scope=p_resolution->'proposedScope', status='active', active=true,
      contradiction_status='resolved', approved_by=p_actor_id, approved_at=v_now
    WHERE id=v_proposed.id;
  END IF;

  UPDATE brain_memory SET
    conflict_resolved_at=v_now, conflict_resolved_by=p_actor_id,
    conflict_resolution=p_action, updated_at=v_now
  WHERE id IN (v_existing.id, v_proposed.id);
  RETURN jsonb_build_object('success', true, 'action', p_action);
END;
$$;

CREATE OR REPLACE FUNCTION decay_brain_memories(p_client_id UUID)
RETURNS INT
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_updated INT;
BEGIN
  WITH penalties AS (
    SELECT
      bm.id,
      greatest(0,
        floor(extract(epoch FROM (clock_timestamp() - bm.last_confirmed_at)) / 2592000)::int * 2
        + CASE WHEN bm.contradiction_status = 'open' THEN least(20, (
            SELECT count(*)::int * 5 FROM brain_memory_sources bms
            WHERE bms.memory_id = bm.id AND bms.contribution = 'contradict'
              AND bms.created_at > bm.last_confirmed_at
          ))
          ELSE 0
        END
        + CASE WHEN EXISTS (
          SELECT 1 FROM content_style_analyses csa
          WHERE csa.client_id = bm.client_id AND csa.status = 'approved'
            AND csa.approved_at > bm.last_confirmed_at
            AND (
              jsonb_array_length(coalesce(bm.scope->'channels', '[]'::jsonb)) = 0
              OR coalesce(bm.scope->'channels', '[]'::jsonb) ? lower(csa.channel)
            )
        ) THEN 5 ELSE 0 END
        + CASE WHEN jsonb_array_length(coalesce(bm.scope->'channels', '[]'::jsonb)) > 0
          AND NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(bm.scope->'channels') scoped(channel)
            WHERE EXISTS (
              SELECT 1 FROM content_pieces cp
              WHERE cp.client_id = bm.client_id
                AND lower(cp.content_type) = lower(scoped.channel)
                AND cp.updated_at > clock_timestamp() - interval '365 days'
            )
            OR EXISTS (
              SELECT 1 FROM content_style_analyses csa
              WHERE csa.client_id = bm.client_id
                AND csa.status = 'approved'
                AND lower(csa.channel) = lower(scoped.channel)
            )
          )
        THEN 3 ELSE 0 END
      ) AS penalty
    FROM brain_memory bm
    WHERE bm.client_id = p_client_id
      AND bm.status = 'active'
      AND NOT (bm.pinned AND bm.kind = 'rule')
      AND bm.last_confirmed_at < clock_timestamp() - interval '21 days'
  )
  UPDATE brain_memory bm SET
    confidence = greatest(0, bm.confidence - CASE WHEN bm.pinned THEN ceil(p.penalty * 0.2)::int ELSE p.penalty END),
    status = CASE
      WHEN bm.confidence - CASE WHEN bm.pinned THEN ceil(p.penalty * 0.2)::int ELSE p.penalty END < 25
      THEN 'muted' ELSE bm.status END,
    active = CASE
      WHEN bm.confidence - CASE WHEN bm.pinned THEN ceil(p.penalty * 0.2)::int ELSE p.penalty END < 25
      THEN false ELSE bm.active END,
    updated_at = clock_timestamp()
  FROM penalties p
  WHERE bm.id = p.id AND p.penalty > 0;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

REVOKE ALL ON TABLE brain_memory_sources FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE brain_memory_sources TO authenticated;
GRANT ALL ON TABLE brain_memory_sources TO service_role;

REVOKE ALL ON FUNCTION brain_memory_scope_matches(JSONB,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION match_brain_memories(UUID,vector,TEXT,TEXT,TEXT,INT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION resolve_brain_memory_conflict(UUID,UUID,TEXT,UUID,JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION decay_brain_memories(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION commit_brain_distillation(UUID,UUID,UUID[],JSONB) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION match_brain_memories(UUID,vector,TEXT,TEXT,TEXT,INT,TEXT,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION resolve_brain_memory_conflict(UUID,UUID,TEXT,UUID,JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION decay_brain_memories(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION commit_brain_distillation(UUID,UUID,UUID[],JSONB) TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('122_task_aware_brain_memory.sql')
ON CONFLICT DO NOTHING;
