-- ============================================================
-- 086_atomic_brain_distillation.sql – lossless, concurrent-safe learning
--
-- Distillation calls an external model, so it cannot hold a database
-- transaction open for the whole run. Instead:
--   1. claim_brain_signals atomically leases one eligible batch;
--   2. the worker prepares memory operations outside the database;
--   3. commit_brain_distillation applies every operation and acknowledges the
--      exact claimed signals in one transaction.
--
-- Any error rolls the commit back. Killed workers leave an expiring lease, not
-- permanently acknowledged feedback.
-- ============================================================

ALTER TABLE brain_signals
  ADD COLUMN IF NOT EXISTS distill_claim_token UUID,
  ADD COLUMN IF NOT EXISTS distill_claim_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS brain_signals_distill_claim_idx
  ON brain_signals (client_id, distill_claim_until, created_at)
  WHERE distilled_at IS NULL;

-- Canonicalize legacy scopes already stored before every reader shared one
-- vocabulary. Runtime readers keep the same aliases for rollback compatibility.
UPDATE brain_memory
SET scope = jsonb_set(
  scope,
  '{surfaces}',
  coalesce((
    SELECT jsonb_agg(DISTINCT CASE lower(surface)
      WHEN 'ask' THEN 'vault_answer'
      WHEN 'vault' THEN 'vault_answer'
      WHEN 'content_topic' THEN 'content'
      WHEN 'content_draft' THEN 'content'
      WHEN 'content_outcome' THEN 'content'
      ELSE lower(surface)
    END)
    FROM jsonb_array_elements_text(scope->'surfaces') AS surface_values(surface)
  ), '[]'::jsonb),
  true
)
WHERE jsonb_typeof(scope->'surfaces') = 'array';

CREATE OR REPLACE FUNCTION claim_brain_signals(
  p_client_id UUID,
  p_limit INT DEFAULT 60,
  p_min_signals INT DEFAULT 3,
  p_lease_seconds INT DEFAULT 600
)
RETURNS SETOF brain_signals
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_token UUID := gen_random_uuid();
BEGIN
  RETURN QUERY
  WITH candidates AS MATERIALIZED (
    SELECT bs.id
    FROM brain_signals bs
    WHERE bs.client_id = p_client_id
      AND bs.distilled_at IS NULL
      AND (
        bs.distill_claim_until IS NULL
        OR bs.distill_claim_until <= clock_timestamp()
      )
    ORDER BY bs.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT greatest(1, least(coalesce(p_limit, 60), 200))
  ),
  eligible AS (
    SELECT count(*) AS signal_count FROM candidates
  )
  UPDATE brain_signals bs
  SET
    distill_claim_token = v_token,
    distill_claim_until = clock_timestamp() + make_interval(
      secs => greatest(60, least(coalesce(p_lease_seconds, 600), 1800))
    )
  FROM candidates c, eligible e
  WHERE bs.id = c.id
    AND e.signal_count >= greatest(1, least(coalesce(p_min_signals, 3), 200))
  RETURNING bs.*;
END;
$$;

CREATE OR REPLACE FUNCTION release_brain_signal_claim(
  p_client_id UUID,
  p_claim_token UUID
)
RETURNS INT
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_released INT;
BEGIN
  UPDATE brain_signals
  SET distill_claim_token = NULL, distill_claim_until = NULL
  WHERE client_id = p_client_id
    AND distilled_at IS NULL
    AND distill_claim_token = p_claim_token;
  GET DIAGNOSTICS v_released = ROW_COUNT;
  RETURN v_released;
END;
$$;

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
  v_expected INT;
  v_distinct INT;
  v_claimed INT;
  v_marked INT;
  v_inserted INT := 0;
  v_reinforced INT := 0;
  v_proposed INT := 0;
  v_op JSONB;
  v_memory_id UUID;
  v_kind TEXT;
  v_status TEXT;
  v_confidence INT;
BEGIN
  v_expected := coalesce(cardinality(p_signal_ids), 0);
  IF v_expected = 0 THEN
    RAISE EXCEPTION 'Distillation commit requires at least one signal';
  END IF;

  SELECT count(DISTINCT signal_id)
  INTO v_distinct
  FROM unnest(p_signal_ids) AS ids(signal_id);
  IF v_distinct <> v_expected THEN
    RAISE EXCEPTION 'Distillation signal ids must be unique';
  END IF;

  SELECT count(*)
  INTO v_claimed
  FROM brain_signals
  WHERE client_id = p_client_id
    AND id = ANY(p_signal_ids)
    AND distilled_at IS NULL
    AND distill_claim_token = p_claim_token
    AND distill_claim_until > v_now;
  IF v_claimed <> v_expected THEN
    RAISE EXCEPTION 'Distillation claim is missing, stale, or does not own every signal';
  END IF;

  IF jsonb_typeof(coalesce(p_operations, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Distillation operations must be a JSON object';
  END IF;

  FOR v_op IN
    SELECT value FROM jsonb_array_elements(coalesce(p_operations->'backfills', '[]'::jsonb))
  LOOP
    v_memory_id := (v_op->>'id')::UUID;
    UPDATE brain_memory
    SET embedding = nullif(v_op->'embedding', 'null'::jsonb), updated_at = v_now
    WHERE id = v_memory_id AND client_id = p_client_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cannot backfill memory % outside client %', v_memory_id, p_client_id;
    END IF;
  END LOOP;

  FOR v_op IN
    SELECT value FROM jsonb_array_elements(coalesce(p_operations->'reinforces', '[]'::jsonb))
  LOOP
    v_memory_id := (v_op->>'id')::UUID;
    UPDATE brain_memory
    SET
      confidence = least(100, confidence + 8),
      source_count = source_count + 1,
      last_reinforced_at = v_now,
      updated_at = v_now
    WHERE id = v_memory_id AND client_id = p_client_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cannot reinforce memory % outside client %', v_memory_id, p_client_id;
    END IF;
    v_reinforced := v_reinforced + 1;
  END LOOP;

  FOR v_op IN
    SELECT value FROM jsonb_array_elements(coalesce(p_operations->'inserts', '[]'::jsonb))
  LOOP
    v_kind := v_op->>'kind';
    v_status := v_op->>'status';
    v_confidence := (v_op->>'confidence')::INT;
    IF v_kind NOT IN ('preference', 'anti_pattern', 'rule') THEN
      RAISE EXCEPTION 'Invalid memory kind %', v_kind;
    END IF;
    IF v_status NOT IN ('active', 'proposed') THEN
      RAISE EXCEPTION 'Invalid memory status %', v_status;
    END IF;
    IF v_confidence NOT BETWEEN 0 AND 100 OR nullif(trim(v_op->>'content'), '') IS NULL THEN
      RAISE EXCEPTION 'Invalid memory content or confidence';
    END IF;

    INSERT INTO brain_memory (
      client_id, kind, content, confidence, source_count, status, active,
      scope, embedding, last_reinforced_at, updated_at
    )
    VALUES (
      p_client_id,
      v_kind,
      trim(v_op->>'content'),
      v_confidence,
      v_expected,
      v_status,
      v_status = 'active',
      coalesce(v_op->'scope', '{}'::jsonb),
      nullif(v_op->'embedding', 'null'::jsonb),
      v_now,
      v_now
    );

    IF v_status = 'proposed' THEN
      v_proposed := v_proposed + 1;
    ELSE
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  UPDATE brain_signals
  SET
    distilled_at = v_now,
    distill_claim_token = NULL,
    distill_claim_until = NULL
  WHERE client_id = p_client_id
    AND id = ANY(p_signal_ids)
    AND distilled_at IS NULL
    AND distill_claim_token = p_claim_token;
  GET DIAGNOSTICS v_marked = ROW_COUNT;
  IF v_marked <> v_expected THEN
    RAISE EXCEPTION 'Distillation acknowledgement lost ownership before commit';
  END IF;

  RETURN jsonb_build_object(
    'processedSignals', v_marked,
    'newMemories', v_inserted,
    'reinforced', v_reinforced,
    'proposed', v_proposed
  );
END;
$$;

REVOKE ALL ON FUNCTION claim_brain_signals(UUID, INT, INT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION release_brain_signal_claim(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION commit_brain_distillation(UUID, UUID, UUID[], JSONB) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION claim_brain_signals(UUID, INT, INT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION release_brain_signal_claim(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION commit_brain_distillation(UUID, UUID, UUID[], JSONB) TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('086_atomic_brain_distillation.sql')
ON CONFLICT DO NOTHING;
