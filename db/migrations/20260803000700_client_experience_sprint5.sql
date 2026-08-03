-- Sprint 5: prove that clients can find and adopt the product without storing
-- their search text or business content. Product-adoption signals remain
-- separate from operational errors in the System Health interface.

ALTER TABLE portal_experience_events
  DROP CONSTRAINT IF EXISTS portal_experience_events_event_type_check;
ALTER TABLE portal_experience_events
  ADD CONSTRAINT portal_experience_events_event_type_check
  CHECK (event_type IN (
    'page_ready', 'feature_ready', 'feature_error',
    'page_slow', 'page_retry', 'page_error',
    'navigation_search_opened', 'navigation_destination_opened',
    'guide_search_used', 'contextual_help_opened'
  ));

ALTER TABLE portal_experience_events
  ADD COLUMN IF NOT EXISTS actor_role TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS target_path TEXT,
  ADD COLUMN IF NOT EXISTS interaction_id UUID;

UPDATE portal_experience_events AS event
SET actor_role = portal_user.role
FROM users AS portal_user
WHERE portal_user.id = event.user_id
  AND event.actor_role = 'unknown';

ALTER TABLE portal_experience_events
  DROP CONSTRAINT IF EXISTS portal_experience_events_actor_role_check;
ALTER TABLE portal_experience_events
  ADD CONSTRAINT portal_experience_events_actor_role_check
  CHECK (actor_role IN ('client_admin', 'va', 'super_admin', 'unknown'));
ALTER TABLE portal_experience_events
  DROP CONSTRAINT IF EXISTS portal_experience_events_target_path_check;
ALTER TABLE portal_experience_events
  ADD CONSTRAINT portal_experience_events_target_path_check
  CHECK (target_path IS NULL OR (target_path ~ '^/[a-z0-9_:/-]+$' AND char_length(target_path) <= 120));

CREATE INDEX IF NOT EXISTS portal_experience_events_adoption_idx
  ON portal_experience_events (client_id, event_type, created_at DESC)
  WHERE event_type IN (
    'navigation_search_opened', 'navigation_destination_opened',
    'guide_search_used', 'contextual_help_opened'
  );

CREATE INDEX IF NOT EXISTS portal_experience_events_interaction_idx
  ON portal_experience_events (client_id, navigation_id, event_type, created_at)
  WHERE navigation_id IS NOT NULL;

DROP FUNCTION IF EXISTS health_client_adoption(TIMESTAMPTZ);
CREATE FUNCTION health_client_adoption(
  p_since TIMESTAMPTZ DEFAULT (now() - interval '30 days')
)
RETURNS TABLE (
  client_id UUID,
  client_name TEXT,
  active_client_admins BIGINT,
  active_vas BIGINT,
  route_sessions BIGINT,
  feature_ready BIGINT,
  errors BIGINT,
  retries BIGINT,
  navigation_searches BIGINT,
  search_selections BIGINT,
  zero_result_searches BIGINT,
  destinations_opened BIGINT,
  destinations_loaded BIGINT,
  guide_searches BIGINT,
  contextual_help BIGINT,
  recent_steps_completed BIGINT,
  completed_milestones BIGINT,
  total_milestones INTEGER,
  missing_milestones TEXT[],
  last_activity TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH required_milestones(sequence, milestone) AS (VALUES
    (1, 'company_confirmed'),
    (2, 'documents_ready'),
    (3, 'voice_configured'),
    (4, 'coach_question_asked'),
    (5, 'content_draft_created'),
    (6, 'va_task_requested')
  ), experience AS (
    SELECT
      event.client_id,
      count(DISTINCT event.user_id) FILTER (WHERE event.actor_role = 'client_admin') AS active_client_admins,
      count(DISTINCT event.user_id) FILTER (WHERE event.actor_role = 'va') AS active_vas,
      count(DISTINCT coalesce(event.navigation_id::TEXT, event.id::TEXT))
        FILTER (WHERE event.event_type = 'page_ready' AND event.actor_role = 'client_admin') AS route_sessions,
      count(*) FILTER (WHERE event.event_type = 'feature_ready' AND event.actor_role = 'client_admin') AS feature_ready,
      count(*) FILTER (WHERE event.event_type IN ('page_error', 'feature_error') AND event.actor_role = 'client_admin') AS errors,
      count(*) FILTER (WHERE event.event_type = 'page_retry' AND event.actor_role = 'client_admin') AS retries,
      count(*) FILTER (WHERE event.event_type = 'navigation_search_opened' AND event.actor_role = 'client_admin') AS navigation_searches,
      count(*) FILTER (
        WHERE event.event_type = 'navigation_destination_opened'
          AND event.actor_role = 'client_admin'
          AND event.metadata ->> 'source' = 'command_palette_search'
      ) AS search_selections,
      count(*) FILTER (
        WHERE event.event_type IN ('guide_search_used', 'navigation_destination_opened')
          AND event.actor_role = 'client_admin'
          AND coalesce(event.metadata ->> 'result_count', '') ~ '^\d+$'
          AND (event.metadata ->> 'result_count')::INTEGER = 0
      ) AS zero_result_searches,
      count(*) FILTER (WHERE event.event_type = 'guide_search_used' AND event.actor_role = 'client_admin') AS guide_searches,
      count(*) FILTER (WHERE event.event_type = 'contextual_help_opened' AND event.actor_role = 'client_admin') AS contextual_help,
      max(event.created_at) FILTER (WHERE event.actor_role = 'client_admin') AS last_activity
    FROM portal_experience_events AS event
    WHERE event.created_at >= p_since
    GROUP BY event.client_id
  ), destination_outcomes AS (
    SELECT
      opened.client_id,
      count(*) AS destinations_opened,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1
        FROM portal_experience_events AS outcome
        WHERE outcome.client_id = opened.client_id
          AND outcome.user_id = opened.user_id
          AND outcome.actor_role = 'client_admin'
          AND outcome.navigation_id = coalesce(opened.interaction_id, opened.navigation_id)
          AND outcome.event_type = 'page_ready'
          AND outcome.path = opened.target_path
          -- The selection beacon and destination request can arrive out of
          -- order. Correlate by the shared navigation ID, while bounding the
          -- small clock/order tolerance so unrelated sessions cannot match.
          AND outcome.created_at >= opened.created_at - interval '1 minute'
          AND outcome.created_at <= opened.created_at + interval '5 minutes'
      )) AS destinations_loaded
    FROM portal_experience_events AS opened
    WHERE opened.created_at >= p_since
      AND opened.event_type = 'navigation_destination_opened'
      AND opened.actor_role = 'client_admin'
    GROUP BY opened.client_id
  ), recent_onboarding AS (
    SELECT event.client_id, count(*) AS recent_steps_completed
    FROM client_onboarding_events AS event
    WHERE event.created_at >= p_since
      AND event.event_type = 'step_completed'
    GROUP BY event.client_id
  ), milestones AS (
    SELECT
      milestone.client_id,
      count(*) AS completed_milestones,
      array_agg(milestone.milestone) AS completed_milestone_names
    FROM client_onboarding_milestones AS milestone
    GROUP BY milestone.client_id
  )
  SELECT
    client.id,
    client.name,
    coalesce(experience.active_client_admins, 0),
    coalesce(experience.active_vas, 0),
    coalesce(experience.route_sessions, 0),
    coalesce(experience.feature_ready, 0),
    coalesce(experience.errors, 0),
    coalesce(experience.retries, 0),
    coalesce(experience.navigation_searches, 0),
    coalesce(experience.search_selections, 0),
    coalesce(experience.zero_result_searches, 0),
    coalesce(destination_outcomes.destinations_opened, 0),
    coalesce(destination_outcomes.destinations_loaded, 0),
    coalesce(experience.guide_searches, 0),
    coalesce(experience.contextual_help, 0),
    coalesce(recent_onboarding.recent_steps_completed, 0),
    coalesce(milestones.completed_milestones, 0),
    (SELECT count(*)::INTEGER FROM required_milestones),
    ARRAY(
      SELECT required.milestone
      FROM required_milestones AS required
      WHERE NOT (required.milestone = ANY(coalesce(milestones.completed_milestone_names, ARRAY[]::TEXT[])))
      ORDER BY required.sequence
    ),
    experience.last_activity
  FROM clients AS client
  LEFT JOIN experience ON experience.client_id = client.id
  LEFT JOIN destination_outcomes ON destination_outcomes.client_id = client.id
  LEFT JOIN recent_onboarding ON recent_onboarding.client_id = client.id
  LEFT JOIN milestones ON milestones.client_id = client.id
  WHERE client.archived_at IS NULL
  ORDER BY
    coalesce(milestones.completed_milestones, 0) ASC,
    experience.last_activity DESC NULLS LAST,
    client.name ASC;
$$;

REVOKE ALL ON FUNCTION health_client_adoption(TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION health_client_adoption(TIMESTAMPTZ)
  TO service_role;

COMMENT ON FUNCTION health_client_adoption(TIMESTAMPTZ) IS
  'Service-only, privacy-safe client adoption and first-success summary. Search text is never stored.';

DROP FUNCTION IF EXISTS health_client_onboarding_funnel(TIMESTAMPTZ);
CREATE FUNCTION health_client_onboarding_funnel(
  p_since TIMESTAMPTZ DEFAULT (now() - interval '30 days')
)
RETURNS TABLE (
  sequence INTEGER,
  step TEXT,
  label TEXT,
  cohort_clients BIGINT,
  viewed_clients BIGINT,
  completed_clients BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH required(sequence, step, label) AS (VALUES
    (1, 'company', 'Company confirmed'),
    (2, 'documents', 'Knowledge ready'),
    (3, 'voice', 'Voice configured'),
    (4, 'coach', 'Coach used'),
    (5, 'draft', 'First draft'),
    (6, 'task', 'VA task requested')
  ), cohort AS (
    SELECT event.client_id, min(event.created_at) AS started_at
    FROM client_onboarding_events AS event
    WHERE event.event_type = 'journey_viewed'
      AND event.created_at >= p_since
    GROUP BY event.client_id
  )
  SELECT
    required.sequence,
    required.step,
    required.label,
    (SELECT count(*) FROM cohort),
    count(DISTINCT activity.client_id) FILTER (WHERE activity.event_type = 'step_viewed'),
    count(DISTINCT activity.client_id) FILTER (WHERE activity.event_type = 'step_completed')
  FROM required
  LEFT JOIN cohort ON true
  LEFT JOIN client_onboarding_events AS activity
    ON activity.client_id = cohort.client_id
   AND activity.step = required.step
   AND activity.created_at >= cohort.started_at
  GROUP BY required.sequence, required.step, required.label
  ORDER BY required.sequence;
$$;

REVOKE ALL ON FUNCTION health_client_onboarding_funnel(TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION health_client_onboarding_funnel(TIMESTAMPTZ)
  TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('20260803000700_client_experience_sprint5.sql')
ON CONFLICT (version) DO NOTHING;
