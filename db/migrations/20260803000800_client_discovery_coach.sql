-- Sprint 6: role-aware pilot measurement for global discovery and contextual
-- Coach. Search text and client content are never stored or returned.

CREATE OR REPLACE FUNCTION health_client_discovery(
  p_since TIMESTAMPTZ DEFAULT (now() - interval '30 days')
)
RETURNS TABLE (
  client_id UUID,
  client_name TEXT,
  actor_role TEXT,
  searches BIGINT,
  selections BIGINT,
  record_selections BIGINT,
  destination_selections BIGINT,
  destinations_loaded BIGINT,
  zero_result_searches BIGINT,
  contextual_help BIGINT,
  last_activity TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH roles(actor_role) AS (VALUES ('client_admin'::TEXT), ('va'::TEXT)),
  scoped AS (
    SELECT event.*
    FROM portal_experience_events AS event
    WHERE event.created_at >= p_since
      AND event.actor_role IN ('client_admin', 'va')
      AND event.event_type IN (
        'navigation_search_opened', 'navigation_destination_opened',
        'guide_search_used', 'contextual_help_opened', 'page_ready'
      )
  ), aggregates AS (
    SELECT
      event.client_id,
      event.actor_role,
      count(*) FILTER (WHERE event.event_type = 'navigation_search_opened') AS searches,
      count(*) FILTER (WHERE event.event_type = 'navigation_destination_opened') AS selections,
      count(*) FILTER (
        WHERE event.event_type = 'navigation_destination_opened'
          AND coalesce(event.metadata ->> 'result_kind', 'destination') <> 'destination'
      ) AS record_selections,
      count(*) FILTER (
        WHERE event.event_type = 'navigation_destination_opened'
          AND coalesce(event.metadata ->> 'result_kind', 'destination') = 'destination'
      ) AS destination_selections,
      count(*) FILTER (
        WHERE event.event_type IN ('guide_search_used', 'navigation_destination_opened')
          AND coalesce(event.metadata ->> 'result_count', '') ~ '^\d+$'
          AND (event.metadata ->> 'result_count')::INTEGER = 0
      ) AS zero_result_searches,
      count(*) FILTER (WHERE event.event_type = 'contextual_help_opened') AS contextual_help,
      max(event.created_at) AS last_activity
    FROM scoped AS event
    GROUP BY event.client_id, event.actor_role
  ), loaded AS (
    SELECT opened.client_id, opened.actor_role, count(*) AS destinations_loaded
    FROM scoped AS opened
    WHERE opened.event_type = 'navigation_destination_opened'
      AND EXISTS (
        SELECT 1
        FROM scoped AS outcome
        WHERE outcome.client_id = opened.client_id
          AND outcome.user_id = opened.user_id
          AND outcome.actor_role = opened.actor_role
          AND outcome.navigation_id = coalesce(opened.interaction_id, opened.navigation_id)
          AND outcome.event_type = 'page_ready'
          AND outcome.path = opened.target_path
          AND outcome.created_at >= opened.created_at - interval '1 minute'
          AND outcome.created_at <= opened.created_at + interval '5 minutes'
      )
    GROUP BY opened.client_id, opened.actor_role
  )
  SELECT
    client.id,
    client.name,
    role.actor_role,
    coalesce(aggregates.searches, 0),
    coalesce(aggregates.selections, 0),
    coalesce(aggregates.record_selections, 0),
    coalesce(aggregates.destination_selections, 0),
    coalesce(loaded.destinations_loaded, 0),
    coalesce(aggregates.zero_result_searches, 0),
    coalesce(aggregates.contextual_help, 0),
    aggregates.last_activity
  FROM clients AS client
  CROSS JOIN roles AS role
  LEFT JOIN aggregates ON aggregates.client_id = client.id AND aggregates.actor_role = role.actor_role
  LEFT JOIN loaded ON loaded.client_id = client.id AND loaded.actor_role = role.actor_role
  WHERE client.archived_at IS NULL
    AND (aggregates.last_activity IS NOT NULL OR loaded.destinations_loaded > 0)
  ORDER BY aggregates.last_activity DESC NULLS LAST, client.name, role.actor_role;
$$;

REVOKE ALL ON FUNCTION health_client_discovery(TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION health_client_discovery(TIMESTAMPTZ)
  TO service_role;

COMMENT ON FUNCTION health_client_discovery(TIMESTAMPTZ) IS
  'Service-only client/VA discovery and contextual-help pilot metrics. Search text and client content are never stored.';

INSERT INTO schema_migrations (version)
VALUES ('20260803000800_client_discovery_coach.sql')
ON CONFLICT (version) DO NOTHING;
