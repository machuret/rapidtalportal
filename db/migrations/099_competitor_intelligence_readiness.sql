-- ============================================================
-- 099_competitor_intelligence_readiness.sql
-- Evidence-readiness contract for each isolated competitor mini-Vault.
-- ============================================================

-- LinkedIn company pages are collectable through public search. Previously
-- registered company pages can be resumed without being recreated. Personal
-- profiles and individual posts remain connector-only.
UPDATE competitor_sources
SET
  status = 'active',
  last_error = NULL,
  failure_count = 0,
  updated_at = clock_timestamp()
WHERE platform = 'linkedin'
  AND source_type = 'social_profile'
  AND status = 'connector_required'
  AND normalized_url ~* '^https://([a-z0-9-]+\.)?linkedin\.com/company/[a-z0-9][a-z0-9-]{0,99}/?$';

CREATE OR REPLACE FUNCTION competitor_intelligence_readiness(p_client_id UUID)
RETURNS TABLE (
  competitor_id UUID,
  source_count BIGINT,
  collectable_source_count BIGINT,
  captured_items BIGINT,
  article_count BIGINT,
  social_post_count BIGINT,
  distinct_platforms BIGINT,
  content_characters BIGINT,
  latest_capture TIMESTAMPTZ,
  readiness_score INT,
  ready BOOLEAN
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH source_stats AS (
    SELECT
      cs.competitor_id,
      count(*) AS source_count,
      count(*) FILTER (
        WHERE cs.status IN ('active', 'retrying')
      ) AS collectable_source_count
    FROM competitor_sources cs
    WHERE cs.client_id = p_client_id
    GROUP BY cs.competitor_id
  ),
  item_stats AS (
    SELECT
      ci.competitor_id,
      count(*) AS captured_items,
      count(*) FILTER (WHERE ci.content_type = 'article') AS article_count,
      count(*) FILTER (WHERE ci.content_type = 'social_post') AS social_post_count,
      count(DISTINCT ci.platform) AS distinct_platforms,
      coalesce(sum(char_length(ci.raw_content)), 0) AS content_characters,
      max(ci.captured_at) AS latest_capture
    FROM competitor_content_items ci
    WHERE ci.client_id = p_client_id
      AND ci.is_removed = false
    GROUP BY ci.competitor_id
  ),
  metrics AS (
    SELECT
      c.id AS competitor_id,
      coalesce(ss.source_count, 0)::BIGINT AS source_count,
      coalesce(ss.collectable_source_count, 0)::BIGINT AS collectable_source_count,
      coalesce(i.captured_items, 0)::BIGINT AS captured_items,
      coalesce(i.article_count, 0)::BIGINT AS article_count,
      coalesce(i.social_post_count, 0)::BIGINT AS social_post_count,
      coalesce(i.distinct_platforms, 0)::BIGINT AS distinct_platforms,
      coalesce(i.content_characters, 0)::BIGINT AS content_characters,
      i.latest_capture
    FROM competitors c
    LEFT JOIN source_stats ss ON ss.competitor_id = c.id
    LEFT JOIN item_stats i ON i.competitor_id = c.id
    WHERE c.client_id = p_client_id
  )
  SELECT
    m.competitor_id,
    m.source_count,
    m.collectable_source_count,
    m.captured_items,
    m.article_count,
    m.social_post_count,
    m.distinct_platforms,
    m.content_characters,
    m.latest_capture,
    least(100,
      CASE WHEN m.collectable_source_count > 0 THEN 15 ELSE 0 END
      + least(40, m.captured_items::INT * 8)
      + CASE
          WHEN m.content_characters >= 10000 THEN 25
          WHEN m.content_characters >= 5000 THEN 20
          WHEN m.content_characters >= 3000 THEN 15
          WHEN m.content_characters >= 1000 THEN 8
          ELSE 0
        END
      + CASE
          WHEN m.article_count > 0 AND m.social_post_count > 0 THEN 10
          WHEN m.article_count > 0 OR m.social_post_count > 0 THEN 5
          ELSE 0
        END
      + CASE
          WHEN m.latest_capture >= now() - interval '90 days' THEN 10
          WHEN m.latest_capture >= now() - interval '180 days' THEN 5
          ELSE 0
        END
    )::INT AS readiness_score,
    (
      m.collectable_source_count > 0
      AND m.captured_items >= 5
      AND m.content_characters >= 3000
      AND m.latest_capture >= now() - interval '180 days'
    ) AS ready
  FROM metrics m
  ORDER BY m.competitor_id;
$$;

REVOKE ALL ON FUNCTION competitor_intelligence_readiness(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION competitor_intelligence_readiness(UUID)
  TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('099_competitor_intelligence_readiness.sql')
ON CONFLICT DO NOTHING;
