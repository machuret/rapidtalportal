-- ============================================================
-- 129_business_library_brain_retrieval.sql
-- Phase 3: governed Business Library retrieval for Brain Context.
--
-- Only the current, published, in-date release can be returned. The resolver
-- records the exact entry/version/chunk IDs in its immutable snapshot.
-- ============================================================

CREATE OR REPLACE FUNCTION match_business_library_chunks(
  p_query TEXT,
  p_match_count INTEGER DEFAULT 8,
  p_channel TEXT DEFAULT NULL,
  p_audience TEXT DEFAULT NULL
)
RETURNS TABLE (
  entry_id UUID,
  version_id UUID,
  chunk_id UUID,
  version_number INTEGER,
  title TEXT,
  summary TEXT,
  content TEXT,
  category TEXT,
  source_url TEXT,
  tags TEXT[],
  rank REAL
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH search AS (
    SELECT websearch_to_tsquery('english', left(btrim(p_query), 4000)) AS query
  )
  SELECT
    e.id AS entry_id,
    v.id AS version_id,
    c.id AS chunk_id,
    v.version_number,
    v.title,
    v.summary,
    c.content,
    category.name AS category,
    v.source_url,
    v.tags,
    least(
      1.0,
      ts_rank_cd(c.search_vector, search.query, 32)
      + CASE
          WHEN p_channel IS NOT NULL AND p_channel = ANY(v.channels) THEN 0.08
          ELSE 0
        END
      + CASE
          WHEN p_audience IS NOT NULL
           AND EXISTS (
             SELECT 1
             FROM unnest(v.audiences) AS audience
             WHERE lower(p_audience) LIKE '%' || lower(audience) || '%'
                OR lower(audience) LIKE '%' || lower(p_audience) || '%'
           )
          THEN 0.08
          ELSE 0
        END
    )::REAL AS rank
  FROM search
  JOIN business_library_chunks c
    ON c.search_vector @@ search.query
  JOIN business_library_versions v
    ON v.id = c.version_id
  JOIN business_library_entries e
    ON e.id = v.entry_id
   AND e.current_version_id = v.id
  JOIN business_library_categories category
    ON category.id = v.category_id
   AND category.is_active
  WHERE length(btrim(coalesce(p_query, ''))) > 0
    AND v.status = 'published'
    AND e.retired_at IS NULL
    AND (v.valid_from IS NULL OR v.valid_from <= current_date)
    AND (v.valid_until IS NULL OR v.valid_until >= current_date)
    AND (v.review_due_at IS NULL OR v.review_due_at > clock_timestamp())
    AND (
      p_channel IS NULL
      OR cardinality(v.channels) = 0
      OR p_channel = ANY(v.channels)
    )
  ORDER BY rank DESC, v.published_at DESC, c.chunk_index
  LIMIT greatest(1, least(coalesce(p_match_count, 8), 30));
$$;

REVOKE ALL ON FUNCTION match_business_library_chunks(TEXT, INTEGER, TEXT, TEXT)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION match_business_library_chunks(TEXT, INTEGER, TEXT, TEXT)
TO service_role;

ALTER TABLE brain_context_snapshots
  DROP CONSTRAINT IF EXISTS brain_context_snapshots_resolver_version_check;

ALTER TABLE brain_context_snapshots
  ADD CONSTRAINT brain_context_snapshots_resolver_version_check
  CHECK (
    resolver_version IN (
      'resolver-v1',
      'resolver-v2-task-memory',
      'resolver-v3-business-library'
    )
  );

INSERT INTO schema_migrations (version)
VALUES ('129_business_library_brain_retrieval.sql')
ON CONFLICT DO NOTHING;
