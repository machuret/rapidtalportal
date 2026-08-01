-- ============================================================
-- 141_coach_release_quality_repairs.sql
-- Phase 3/4 release repairs: bounded raw-feedback retention, recurring
-- commitment follow-ups and honest semantic-index degradation signalling.
-- ============================================================

-- Private thumbs feedback may contain a question, answer and free-text detail.
-- Keep it available to the same owner's Coach for 30 days, then remove it.
-- Explicit Coach memories remain the durable, user-managed learning mechanism.
ALTER TABLE brain_signals
  ADD COLUMN IF NOT EXISTS retention_until TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS brain_signals_private_retention_idx
  ON brain_signals (retention_until)
  WHERE visibility = 'private_coach' AND retention_until IS NOT NULL;

CREATE OR REPLACE FUNCTION set_private_brain_signal_retention()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.visibility = 'private_coach' THEN
    NEW.retention_until := coalesce(NEW.created_at, clock_timestamp()) + interval '30 days';
  ELSE
    NEW.retention_until := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS brain_signals_private_retention ON brain_signals;
CREATE TRIGGER brain_signals_private_retention
  BEFORE INSERT OR UPDATE OF visibility, created_at ON brain_signals
  FOR EACH ROW EXECUTE FUNCTION set_private_brain_signal_retention();
UPDATE brain_signals
SET retention_until = created_at + interval '30 days'
WHERE visibility = 'private_coach' AND retention_until IS NULL;

-- A scheduled check-in is a weekly follow-up loop until the owner completes,
-- dismisses or explicitly reschedules the commitment.
ALTER TABLE coach_commitments
  ADD COLUMN IF NOT EXISTS check_in_interval_days SMALLINT
    CHECK (check_in_interval_days BETWEEN 1 AND 90);
UPDATE coach_commitments SET check_in_interval_days = 7
WHERE next_check_in_at IS NOT NULL AND status IN ('open','snoozed')
  AND check_in_interval_days IS NULL;

CREATE OR REPLACE FUNCTION normalize_coach_commitment_check_in()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('completed','dismissed') OR NEW.next_check_in_at IS NULL THEN
    NEW.check_in_interval_days := NULL;
  ELSIF NEW.check_in_interval_days IS NULL THEN
    NEW.check_in_interval_days := 7;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS coach_commitments_normalize_check_in ON coach_commitments;
CREATE TRIGGER coach_commitments_normalize_check_in
  BEFORE INSERT OR UPDATE OF status, next_check_in_at, check_in_interval_days
  ON coach_commitments FOR EACH ROW
  EXECUTE FUNCTION normalize_coach_commitment_check_in();

CREATE OR REPLACE FUNCTION complete_coach_check_in(
  p_commitment_id UUID, p_claim_token UUID, p_delivered BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row coach_commitments%ROWTYPE; v_timezone TEXT; v_next_check_in_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_row FROM coach_commitments WHERE id = p_commitment_id
    AND check_in_claim_token = p_claim_token FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_delivered THEN
    SELECT coalesce((SELECT name FROM pg_timezone_names WHERE name = users.timezone), 'UTC')
      INTO v_timezone FROM users WHERE id = v_row.owner_id;
    v_next_check_in_at := CASE WHEN v_row.check_in_interval_days IS NULL THEN NULL ELSE
      (((clock_timestamp() AT TIME ZONE v_timezone)::DATE + v_row.check_in_interval_days) + time '09:00')
        AT TIME ZONE v_timezone END;
    UPDATE coach_commitments SET last_check_in_at = clock_timestamp(),
      next_check_in_at = v_next_check_in_at,
      reminder_count = least(100, reminder_count + 1), status = 'open',
      check_in_claim_token = NULL, check_in_claimed_until = NULL, updated_at = clock_timestamp()
    WHERE id = p_commitment_id;
    INSERT INTO coach_progress_events (client_id, owner_id, commitment_id, goal_id, event_type, detail)
    VALUES (v_row.client_id, v_row.owner_id, v_row.id, v_row.goal_id, 'check_in_sent',
      jsonb_build_object('scheduledFor', v_row.next_check_in_at, 'nextCheckInAt', v_next_check_in_at));
  ELSE
    UPDATE coach_commitments SET check_in_claim_token = NULL, check_in_claimed_until = NULL
    WHERE id = p_commitment_id;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION deliver_coach_check_in(
  p_commitment_id UUID, p_claim_token UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row coach_commitments%ROWTYPE; v_timezone TEXT; v_next_check_in_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_row FROM coach_commitments WHERE id = p_commitment_id
    AND check_in_claim_token = p_claim_token
    AND check_in_claimed_until > clock_timestamp() FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT coalesce((SELECT name FROM pg_timezone_names WHERE name = users.timezone), 'UTC')
    INTO v_timezone FROM users WHERE id = v_row.owner_id;
  v_next_check_in_at := CASE WHEN v_row.check_in_interval_days IS NULL THEN NULL ELSE
    (((clock_timestamp() AT TIME ZONE v_timezone)::DATE + v_row.check_in_interval_days) + time '09:00')
      AT TIME ZONE v_timezone END;
  INSERT INTO notifications (user_id, client_id, type, title, body, href)
  VALUES (v_row.owner_id, v_row.client_id, 'coach_check_in',
    'Coach check-in', left(v_row.commitment, 1000), '/ask');
  UPDATE coach_commitments SET last_check_in_at = clock_timestamp(),
    next_check_in_at = v_next_check_in_at,
    reminder_count = least(100, reminder_count + 1), status = 'open',
    check_in_claim_token = NULL, check_in_claimed_until = NULL, updated_at = clock_timestamp()
  WHERE id = p_commitment_id;
  INSERT INTO coach_progress_events (client_id, owner_id, commitment_id, goal_id, event_type, detail)
  VALUES (v_row.client_id, v_row.owner_id, v_row.id, v_row.goal_id, 'check_in_sent',
    jsonb_build_object('scheduledFor', v_row.next_check_in_at, 'nextCheckInAt', v_next_check_in_at));
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION complete_coach_check_in(UUID,UUID,BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION deliver_coach_check_in(UUID,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION complete_coach_check_in(UUID,UUID,BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION deliver_coach_check_in(UUID,UUID) TO service_role;

-- Distinguish a verified lexical match from a lexical match whose chunk has
-- not yet entered the semantic index. The resolver turns the latter into a
-- visible, recoverable degraded state.
CREATE OR REPLACE FUNCTION match_business_library_chunks_hybrid(
  p_query_embedding VECTOR(384), p_query TEXT, p_match_count INTEGER DEFAULT 8,
  p_channel TEXT DEFAULT NULL, p_audience TEXT DEFAULT NULL, p_coach_role TEXT DEFAULT NULL
)
RETURNS TABLE (
  entry_id UUID, version_id UUID, chunk_id UUID, version_number INTEGER,
  title TEXT, summary TEXT, content TEXT, category TEXT, source_url TEXT,
  tags TEXT[], rank REAL, retrieval_method TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH search AS (
    SELECT CASE WHEN length(btrim(coalesce(p_query, ''))) > 0
      THEN websearch_to_tsquery('english', left(btrim(p_query), 4000)) ELSE NULL END AS query
  ), candidates AS (
    SELECT e.id AS entry_id, v.id AS version_id, c.id AS chunk_id,
      v.version_number, v.title, v.summary, c.content, category.name AS category,
      v.source_url, v.tags, v.published_at, c.embedding IS NOT NULL AS semantic_indexed,
      CASE WHEN p_query_embedding IS NOT NULL AND c.embedding IS NOT NULL
        THEN greatest(0, 1 - (c.embedding <=> p_query_embedding)) ELSE 0 END AS semantic_score,
      CASE WHEN search.query IS NOT NULL AND c.search_vector @@ search.query
        THEN ts_rank_cd(c.search_vector, search.query, 32) ELSE 0 END AS lexical_score,
      CASE WHEN p_channel IS NOT NULL AND p_channel = ANY(v.channels) THEN 0.05 ELSE 0 END
      + CASE WHEN p_audience IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(v.audiences) audience
          WHERE lower(p_audience) LIKE '%' || lower(audience) || '%'
             OR lower(audience) LIKE '%' || lower(p_audience) || '%'
        ) THEN 0.05 ELSE 0 END
      + CASE WHEN p_coach_role = 'client' AND EXISTS (
          SELECT 1 FROM unnest(v.audiences) audience WHERE lower(audience) ~ '(client|owner|founder|director|business)'
        ) THEN 0.06 WHEN p_coach_role = 'va' AND EXISTS (
          SELECT 1 FROM unnest(v.audiences) audience WHERE lower(audience) ~ '(va|assistant|operator|team|specialist)'
        ) THEN 0.06 ELSE 0 END AS context_boost
    FROM search JOIN business_library_chunks c ON true
    JOIN business_library_versions v ON v.id = c.version_id
    JOIN business_library_entries e ON e.id = v.entry_id AND e.current_version_id = v.id
    JOIN business_library_categories category ON category.id = v.category_id AND category.is_active
    WHERE v.status = 'published' AND e.retired_at IS NULL
      AND (v.valid_from IS NULL OR v.valid_from <= current_date)
      AND (v.valid_until IS NULL OR v.valid_until >= current_date)
      AND (v.review_due_at IS NULL OR v.review_due_at > clock_timestamp())
      AND (p_channel IS NULL OR cardinality(v.channels) = 0 OR p_channel = ANY(v.channels))
      AND ((p_query_embedding IS NOT NULL AND c.embedding IS NOT NULL)
        OR (search.query IS NOT NULL AND c.search_vector @@ search.query))
  )
  SELECT entry_id, version_id, chunk_id, version_number, title, summary, content,
    category, source_url, tags,
    least(1.0, semantic_score * 0.72 + least(lexical_score, 1) * 0.22 + context_boost)::REAL,
    CASE WHEN semantic_score > 0 AND lexical_score > 0 THEN 'hybrid'
         WHEN semantic_score > 0 THEN 'semantic'
         WHEN NOT semantic_indexed THEN 'full_text_unindexed'
         ELSE 'full_text' END
  FROM candidates WHERE semantic_score >= 0.28 OR lexical_score > 0
  ORDER BY (semantic_score * 0.72 + least(lexical_score, 1) * 0.22 + context_boost) DESC,
    published_at DESC, chunk_id
  LIMIT greatest(1, least(coalesce(p_match_count, 8), 30));
$$;
REVOKE ALL ON FUNCTION match_business_library_chunks_hybrid(VECTOR,TEXT,INTEGER,TEXT,TEXT,TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION match_business_library_chunks_hybrid(VECTOR,TEXT,INTEGER,TEXT,TEXT,TEXT)
  TO service_role;

CREATE OR REPLACE FUNCTION purge_expired_coach_private_data()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_deleted INTEGER := 0; v_rows INTEGER := 0;
BEGIN
  DELETE FROM vault_queries WHERE visibility = 'private_coach'
    AND retention_until IS NOT NULL AND retention_until <= clock_timestamp();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  DELETE FROM brain_signals WHERE visibility = 'private_coach'
    AND retention_until IS NOT NULL AND retention_until <= clock_timestamp();
  GET DIAGNOSTICS v_rows = ROW_COUNT; v_deleted := v_deleted + v_rows;
  DELETE FROM coach_turns turn_row USING coach_threads thread_row
  WHERE turn_row.thread_id = thread_row.id
    AND turn_row.created_at < clock_timestamp() - make_interval(days => thread_row.retention_days);
  GET DIAGNOSTICS v_rows = ROW_COUNT; v_deleted := v_deleted + v_rows;
  DELETE FROM coach_action_previews WHERE expires_at <= clock_timestamp()
    AND status IN ('draft','failed');
  GET DIAGNOSTICS v_rows = ROW_COUNT; v_deleted := v_deleted + v_rows;
  DELETE FROM coach_commitments WHERE retention_until IS NOT NULL
    AND retention_until <= clock_timestamp();
  GET DIAGNOSTICS v_rows = ROW_COUNT; v_deleted := v_deleted + v_rows;
  DELETE FROM coach_goals WHERE retention_until IS NOT NULL
    AND retention_until <= clock_timestamp();
  GET DIAGNOSTICS v_rows = ROW_COUNT; v_deleted := v_deleted + v_rows;
  RETURN v_deleted;
END;
$$;
REVOKE ALL ON FUNCTION purge_expired_coach_private_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION purge_expired_coach_private_data() TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('141_coach_release_quality_repairs.sql') ON CONFLICT DO NOTHING;
