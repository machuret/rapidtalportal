-- ============================================================
-- 117_vault_governance_workflow.sql
-- Govern company knowledge sources and turn unanswered questions into an
-- owned, traceable workflow. Factual retrieval excludes unsafe lifecycle
-- states at the database boundary.
-- ============================================================

-- Production predates parts of the historical learning-loop migrations.
-- Repair the small prerequisites this workflow depends on instead of trusting
-- a migration ledger that may have been baselined after manual schema changes.
ALTER TABLE vault_queries
  ADD COLUMN IF NOT EXISTS dismissed BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE kb_entries
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE vault_items
  ADD COLUMN IF NOT EXISTS authority_level TEXT NOT NULL DEFAULT 'supporting'
    CHECK (authority_level IN ('authoritative', 'supporting')),
  ADD COLUMN IF NOT EXISTS knowledge_status TEXT NOT NULL DEFAULT 'active'
    CHECK (knowledge_status IN ('active', 'review_required', 'superseded')),
  ADD COLUMN IF NOT EXISTS time_sensitive BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS valid_from DATE,
  ADD COLUMN IF NOT EXISTS valid_until DATE,
  ADD COLUMN IF NOT EXISTS review_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS supersedes_item_id UUID REFERENCES vault_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS has_conflict BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS conflict_note TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vault_items_validity_window_check'
  ) THEN
    ALTER TABLE vault_items
      ADD CONSTRAINT vault_items_validity_window_check
      CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vault_items_not_self_superseding_check'
  ) THEN
    ALTER TABLE vault_items
      ADD CONSTRAINT vault_items_not_self_superseding_check
      CHECK (supersedes_item_id IS NULL OR supersedes_item_id <> id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vault_items_conflict_note_check'
  ) THEN
    ALTER TABLE vault_items
      ADD CONSTRAINT vault_items_conflict_note_check
      CHECK (
        (has_conflict = false)
        OR nullif(btrim(conflict_note), '') IS NOT NULL
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS vault_items_governance_idx
  ON vault_items (client_id, evidence_role, knowledge_status, authority_level);
CREATE INDEX IF NOT EXISTS vault_items_review_due_idx
  ON vault_items (client_id, review_due_at)
  WHERE knowledge_status <> 'superseded';
CREATE INDEX IF NOT EXISTS vault_items_valid_until_idx
  ON vault_items (client_id, valid_until)
  WHERE valid_until IS NOT NULL;

CREATE TABLE IF NOT EXISTS vault_item_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES vault_items(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  version_number INT NOT NULL CHECK (version_number > 0),
  title TEXT NOT NULL,
  source_url TEXT,
  raw_content TEXT,
  content_hash TEXT,
  authority_level TEXT NOT NULL,
  knowledge_status TEXT NOT NULL,
  time_sensitive BOOLEAN NOT NULL,
  valid_from DATE,
  valid_until DATE,
  review_due_at TIMESTAMPTZ,
  supersedes_item_id UUID,
  has_conflict BOOLEAN NOT NULL,
  conflict_note TEXT,
  captured_by UUID REFERENCES users(id) ON DELETE SET NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (item_id, version_number)
);

CREATE INDEX IF NOT EXISTS vault_item_versions_client_item_idx
  ON vault_item_versions (client_id, item_id, version_number DESC);

ALTER TABLE vault_item_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vault_item_versions_own_client_select" ON vault_item_versions;
CREATE POLICY "vault_item_versions_own_client_select"
  ON vault_item_versions FOR SELECT
  USING (
    client_id = current_user_client_id()
    OR current_user_role() = 'super_admin'
  );

CREATE OR REPLACE FUNCTION capture_vault_item_version()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_changed BOOLEAN := true;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_changed :=
      OLD.title IS DISTINCT FROM NEW.title
      OR OLD.source_url IS DISTINCT FROM NEW.source_url
      OR OLD.raw_content IS DISTINCT FROM NEW.raw_content
      OR OLD.content_hash IS DISTINCT FROM NEW.content_hash
      OR OLD.authority_level IS DISTINCT FROM NEW.authority_level
      OR OLD.knowledge_status IS DISTINCT FROM NEW.knowledge_status
      OR OLD.time_sensitive IS DISTINCT FROM NEW.time_sensitive
      OR OLD.valid_from IS DISTINCT FROM NEW.valid_from
      OR OLD.valid_until IS DISTINCT FROM NEW.valid_until
      OR OLD.review_due_at IS DISTINCT FROM NEW.review_due_at
      OR OLD.supersedes_item_id IS DISTINCT FROM NEW.supersedes_item_id
      OR OLD.has_conflict IS DISTINCT FROM NEW.has_conflict
      OR OLD.conflict_note IS DISTINCT FROM NEW.conflict_note;
  END IF;
  IF NOT v_changed THEN
    RETURN NEW;
  END IF;

  INSERT INTO vault_item_versions (
    item_id, client_id, version_number, title, source_url, raw_content,
    content_hash, authority_level, knowledge_status, time_sensitive,
    valid_from, valid_until, review_due_at, supersedes_item_id,
    has_conflict, conflict_note, captured_by, captured_at
  ) VALUES (
    NEW.id, NEW.client_id,
    coalesce((
      SELECT max(version_number) + 1
      FROM vault_item_versions
      WHERE item_id = NEW.id
    ), 1),
    NEW.title, NEW.source_url, NEW.raw_content, NEW.content_hash,
    NEW.authority_level, NEW.knowledge_status, NEW.time_sensitive,
    NEW.valid_from, NEW.valid_until, NEW.review_due_at,
    NEW.supersedes_item_id, NEW.has_conflict, NEW.conflict_note,
    coalesce(NEW.updated_by, NEW.created_by), clock_timestamp()
  );
  RETURN NEW;
END;
$$;

INSERT INTO vault_item_versions (
  item_id, client_id, version_number, title, source_url, raw_content,
  content_hash, authority_level, knowledge_status, time_sensitive,
  valid_from, valid_until, review_due_at, supersedes_item_id,
  has_conflict, conflict_note, captured_by, captured_at
)
SELECT
  vi.id, vi.client_id, 1, vi.title, vi.source_url, vi.raw_content,
  vi.content_hash, vi.authority_level, vi.knowledge_status, vi.time_sensitive,
  vi.valid_from, vi.valid_until, vi.review_due_at, vi.supersedes_item_id,
  vi.has_conflict, vi.conflict_note, coalesce(vi.updated_by, vi.created_by),
  coalesce(vi.updated_at, vi.created_at, clock_timestamp())
FROM vault_items vi
WHERE NOT EXISTS (
  SELECT 1 FROM vault_item_versions viv WHERE viv.item_id = vi.id
);

DROP TRIGGER IF EXISTS vault_items_capture_version ON vault_items;
CREATE TRIGGER vault_items_capture_version
AFTER INSERT OR UPDATE ON vault_items
FOR EACH ROW EXECUTE FUNCTION capture_vault_item_version();
REVOKE ALL ON FUNCTION capture_vault_item_version() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION enforce_vault_supersession()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.supersedes_item_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM vault_items
    WHERE id = NEW.supersedes_item_id
      AND client_id = NEW.client_id
      AND evidence_role = NEW.evidence_role
  ) THEN
    RAISE EXCEPTION 'A source can only supersede another source in the same client and evidence area.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION apply_vault_supersession()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.supersedes_item_id IS NULL OR NEW.knowledge_status <> 'active' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.supersedes_item_id IS NOT DISTINCT FROM NEW.supersedes_item_id
     AND OLD.knowledge_status IS NOT DISTINCT FROM NEW.knowledge_status THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE vault_items
    SET
      knowledge_status = 'superseded',
      updated_at = clock_timestamp(),
      updated_by = NEW.updated_by
    WHERE id = NEW.supersedes_item_id
      AND client_id = NEW.client_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vault_items_validate_supersession ON vault_items;
CREATE TRIGGER vault_items_validate_supersession
BEFORE INSERT OR UPDATE OF supersedes_item_id, knowledge_status ON vault_items
FOR EACH ROW EXECUTE FUNCTION enforce_vault_supersession();

DROP TRIGGER IF EXISTS vault_items_apply_supersession ON vault_items;
CREATE TRIGGER vault_items_apply_supersession
AFTER INSERT OR UPDATE OF supersedes_item_id, knowledge_status ON vault_items
FOR EACH ROW EXECUTE FUNCTION apply_vault_supersession();

-- Admin-maintained Company DNA is an explicitly curated factual authority.
UPDATE vault_items
SET authority_level = 'authoritative'
WHERE origin_key = 'admin_company_profile'
  AND evidence_role = 'factual';

ALTER TABLE vault_queries
  ADD COLUMN IF NOT EXISTS gap_key TEXT,
  ADD COLUMN IF NOT EXISTS gap_status TEXT NOT NULL DEFAULT 'open'
    CHECK (gap_status IN ('open', 'in_review', 'resolved', 'dismissed')),
  ADD COLUMN IF NOT EXISTS gap_importance TEXT NOT NULL DEFAULT 'normal'
    CHECK (gap_importance IN ('low', 'normal', 'high', 'critical')),
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recommended_source TEXT,
  ADD COLUMN IF NOT EXISTS resolved_by_vault_item_id UUID REFERENCES vault_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_by_kb_entry_id UUID REFERENCES kb_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION normalise_vault_gap_key(p_question TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
  SELECT lower(regexp_replace(btrim(coalesce(p_question, '')), '\s+', ' ', 'g'));
$$;

UPDATE vault_queries
SET
  gap_key = normalise_vault_gap_key(question),
  gap_status = CASE
    WHEN dismissed THEN 'dismissed'
    WHEN answered THEN 'resolved'
    ELSE gap_status
  END,
  resolved_at = CASE
    WHEN answered AND resolved_at IS NULL THEN created_at
    ELSE resolved_at
  END
WHERE gap_key IS NULL
   OR dismissed
   OR answered;

CREATE OR REPLACE FUNCTION sync_vault_gap_state()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.gap_key := normalise_vault_gap_key(NEW.question);

  IF NEW.dismissed THEN
    NEW.gap_status := 'dismissed';
    NEW.answered := false;
  ELSIF NEW.answered THEN
    NEW.gap_status := 'resolved';
  ELSIF NEW.gap_status = 'resolved' THEN
    NEW.answered := true;
    NEW.dismissed := false;
  ELSIF NEW.gap_status = 'dismissed' THEN
    NEW.dismissed := true;
    NEW.answered := false;
  ELSE
    NEW.answered := false;
    NEW.dismissed := false;
  END IF;

  IF NEW.gap_status = 'resolved' AND NEW.resolved_at IS NULL THEN
    NEW.resolved_at := clock_timestamp();
  ELSIF NEW.gap_status <> 'resolved' THEN
    NEW.resolved_at := NULL;
    NEW.resolved_by := NULL;
    NEW.resolved_by_vault_item_id := NULL;
    NEW.resolved_by_kb_entry_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vault_queries_sync_gap_state ON vault_queries;
CREATE TRIGGER vault_queries_sync_gap_state
BEFORE INSERT OR UPDATE ON vault_queries
FOR EACH ROW EXECUTE FUNCTION sync_vault_gap_state();

CREATE INDEX IF NOT EXISTS vault_queries_gap_workflow_idx
  ON vault_queries (client_id, gap_status, gap_importance, created_at DESC);
CREATE INDEX IF NOT EXISTS vault_queries_gap_key_idx
  ON vault_queries (client_id, gap_key);

-- Teaching a gap and acknowledging every matching occurrence must commit
-- together. A KB failure can no longer silently close the learning signal.
CREATE OR REPLACE FUNCTION resolve_vault_gap_with_answer(
  p_gap_id UUID,
  p_client_id UUID,
  p_actor_id UUID,
  p_answer TEXT
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_question TEXT;
  v_gap_key TEXT;
  v_kb_id UUID;
BEGIN
  IF char_length(btrim(coalesce(p_answer, ''))) < 3 THEN
    RAISE EXCEPTION 'Answer is too short.' USING ERRCODE = '22023';
  END IF;

  SELECT question, gap_key
  INTO v_question, v_gap_key
  FROM vault_queries
  WHERE id = p_gap_id
    AND client_id = p_client_id
    AND gap_status IN ('open', 'in_review')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Knowledge gap not found or already closed.' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO kb_entries (
    client_id, question, answer, source_vault_ids, category, is_pinned
  ) VALUES (
    p_client_id, v_question, btrim(p_answer), '{}'::UUID[], 'Taught', true
  )
  RETURNING id INTO v_kb_id;

  UPDATE vault_queries
  SET
    gap_status = 'resolved',
    answered = true,
    dismissed = false,
    resolved_by_kb_entry_id = v_kb_id,
    resolved_by = p_actor_id,
    resolved_at = clock_timestamp()
  WHERE client_id = p_client_id
    AND gap_key = v_gap_key
    AND gap_status IN ('open', 'in_review');

  RETURN v_kb_id;
END;
$$;

CREATE OR REPLACE FUNCTION resolve_vault_gap_with_item(
  p_gap_id UUID,
  p_client_id UUID,
  p_actor_id UUID,
  p_vault_item_id UUID
)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_gap_key TEXT;
BEGIN
  SELECT gap_key
  INTO v_gap_key
  FROM vault_queries
  WHERE id = p_gap_id
    AND client_id = p_client_id
    AND gap_status IN ('open', 'in_review')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Knowledge gap not found or already closed.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM vault_items
    WHERE id = p_vault_item_id
      AND client_id = p_client_id
      AND evidence_role = 'factual'
      AND status = 'ready'
      AND knowledge_status = 'active'
      AND has_conflict = false
      AND (valid_until IS NULL OR valid_until >= current_date)
      AND (review_due_at IS NULL OR review_due_at > clock_timestamp())
  ) THEN
    RAISE EXCEPTION 'Choose an active, usable factual Vault source.' USING ERRCODE = '22023';
  END IF;

  UPDATE vault_queries
  SET
    gap_status = 'resolved',
    answered = true,
    dismissed = false,
    resolved_by_vault_item_id = p_vault_item_id,
    resolved_by = p_actor_id,
    resolved_at = clock_timestamp()
  WHERE client_id = p_client_id
    AND gap_key = v_gap_key
    AND gap_status IN ('open', 'in_review');
END;
$$;

REVOKE ALL ON FUNCTION normalise_vault_gap_key(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION resolve_vault_gap_with_answer(UUID, UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION resolve_vault_gap_with_item(UUID, UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION normalise_vault_gap_key(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION resolve_vault_gap_with_answer(UUID, UUID, UUID, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION resolve_vault_gap_with_item(UUID, UUID, UUID, UUID)
  TO service_role;

-- Every semantic consumer inherits the same lifecycle safety boundary.
CREATE OR REPLACE FUNCTION match_vault_chunks(
  p_client_id UUID,
  p_query_embedding VECTOR(384),
  p_match_count INT DEFAULT 8
)
RETURNS TABLE (
  id UUID,
  item_id UUID,
  content TEXT,
  chunk_index INT,
  similarity FLOAT
)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT
    vc.id,
    vc.item_id,
    vc.content,
    vc.chunk_index,
    1 - (vc.embedding <=> p_query_embedding) AS similarity
  FROM vault_chunks vc
  JOIN vault_items vi
    ON vi.id = vc.item_id
   AND vi.client_id = vc.client_id
  WHERE vc.client_id = p_client_id
    AND vc.embedding IS NOT NULL
    AND vi.status = 'ready'
    AND vi.evidence_role = 'factual'
    AND vi.knowledge_status = 'active'
    AND vi.has_conflict = false
    AND (vi.valid_from IS NULL OR vi.valid_from <= current_date)
    AND (vi.valid_until IS NULL OR vi.valid_until >= current_date)
    AND (vi.review_due_at IS NULL OR vi.review_due_at > clock_timestamp())
  ORDER BY
    (vc.embedding <=> p_query_embedding)
      - CASE WHEN vi.authority_level = 'authoritative' THEN 0.02 ELSE 0 END,
    vc.id
  LIMIT greatest(1, least(coalesce(p_match_count, 8), 50));
$$;

REVOKE ALL ON FUNCTION match_vault_chunks(UUID, VECTOR, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION match_vault_chunks(UUID, VECTOR, INT)
  TO authenticated, service_role;

INSERT INTO schema_migrations (version)
VALUES ('117_vault_governance_workflow.sql')
ON CONFLICT DO NOTHING;
