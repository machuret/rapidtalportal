-- ============================================================
-- 134_coach_privacy_and_recipient_boundaries.sql
-- RapidTal Coach trust boundary:
--   * private Coach questions are owner-only and expire after 30 days;
--   * private questions never become team-visible knowledge-gap examples;
--   * Coach threads are persistent, owner-only records with explicit retention;
--   * messages have a real recipient audience instead of UI-only labels.
-- ============================================================

ALTER TABLE vault_queries
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'team_analytics',
  ADD COLUMN IF NOT EXISTS retention_until TIMESTAMPTZ;

ALTER TABLE vault_queries DROP CONSTRAINT IF EXISTS vault_queries_visibility_valid;
ALTER TABLE vault_queries
  ADD CONSTRAINT vault_queries_visibility_valid
  CHECK (visibility IN ('private_coach', 'team_analytics'));

CREATE INDEX IF NOT EXISTS vault_queries_private_owner_idx
  ON vault_queries (user_id, created_at DESC)
  WHERE visibility = 'private_coach';
CREATE INDEX IF NOT EXISTS vault_queries_retention_idx
  ON vault_queries (retention_until)
  WHERE retention_until IS NOT NULL;

DROP POLICY IF EXISTS "vault_queries_own_client_select" ON vault_queries;
DROP POLICY IF EXISTS vault_queries_visibility_select ON vault_queries;
CREATE POLICY vault_queries_visibility_select
  ON vault_queries FOR SELECT
  USING (
    (visibility = 'private_coach' AND user_id = auth.uid())
    OR (
      visibility = 'team_analytics'
      AND (client_id = current_user_client_id() OR current_user_role() = 'super_admin')
    )
  );

ALTER TABLE brain_signals
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'team_learning';
ALTER TABLE brain_signals DROP CONSTRAINT IF EXISTS brain_signals_visibility_valid;
ALTER TABLE brain_signals
  ADD CONSTRAINT brain_signals_visibility_valid
  CHECK (visibility IN ('private_coach', 'team_learning'));
DROP POLICY IF EXISTS "brain_signals_own_client_select" ON brain_signals;
DROP POLICY IF EXISTS brain_signals_visibility_select ON brain_signals;
CREATE POLICY brain_signals_visibility_select ON brain_signals FOR SELECT USING (
  (visibility = 'private_coach' AND user_id = auth.uid())
  OR (
    visibility = 'team_learning'
    AND (client_id = current_user_client_id() OR current_user_role() = 'super_admin')
  )
);

-- Private Coach prompts must not be copied into the company knowledge-gap
-- workflow. The service can still use aggregate ratings without exposing text.
CREATE OR REPLACE FUNCTION sync_brain_knowledge_gap_from_query()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_topic TEXT;
  v_gap_id UUID;
  v_surface TEXT;
BEGIN
  IF NEW.visibility = 'private_coach' THEN
    NEW.brain_gap_id := NULL;
    RETURN NEW;
  END IF;

  v_topic := left(coalesce(
    nullif(btrim(NEW.gap_key), ''),
    lower(regexp_replace(btrim(NEW.question), '\s+', ' ', 'g'))
  ), 500);
  v_surface := 'ask';

  IF TG_OP = 'INSERT' THEN
    INSERT INTO brain_knowledge_gaps (
      client_id, normalized_topic, example_questions, occurrence_count,
      affected_surfaces, importance, status, owner_id, recommended_source
    ) VALUES (
      NEW.client_id, v_topic, ARRAY[left(btrim(NEW.question), 2000)], 1,
      ARRAY[v_surface], coalesce(NEW.gap_importance, 'normal'),
      CASE
        WHEN NEW.answered THEN 'resolved'
        WHEN coalesce(NEW.dismissed, false) THEN 'dismissed'
        WHEN NEW.gap_status = 'in_review' THEN 'in_review'
        ELSE 'open'
      END,
      NEW.owner_id, NEW.recommended_source
    )
    ON CONFLICT (client_id, normalized_topic) DO UPDATE SET
      example_questions = (
        SELECT ARRAY(
          SELECT DISTINCT question
          FROM unnest(
            brain_knowledge_gaps.example_questions
            || ARRAY[left(btrim(NEW.question), 2000)]
          ) question
          LIMIT 20
        )
      ),
      occurrence_count = brain_knowledge_gaps.occurrence_count + 1,
      affected_surfaces = (
        SELECT ARRAY(
          SELECT DISTINCT surface
          FROM unnest(brain_knowledge_gaps.affected_surfaces || ARRAY[v_surface]) surface
        )
      ),
      status = CASE
        WHEN brain_knowledge_gaps.status IN ('resolved','dismissed')
          AND NOT NEW.answered AND NOT coalesce(NEW.dismissed, false) THEN 'open'
        ELSE brain_knowledge_gaps.status
      END,
      updated_at = clock_timestamp()
    RETURNING id INTO v_gap_id;
    NEW.brain_gap_id := v_gap_id;
    RETURN NEW;
  END IF;

  v_gap_id := coalesce(NEW.brain_gap_id, OLD.brain_gap_id);
  IF v_gap_id IS NOT NULL THEN
    UPDATE brain_knowledge_gaps SET
      status = CASE
        WHEN NEW.answered OR NEW.gap_status = 'resolved' THEN 'resolved'
        WHEN coalesce(NEW.dismissed, false) OR NEW.gap_status = 'dismissed' THEN 'dismissed'
        WHEN NEW.gap_status = 'in_review' THEN 'in_review'
        ELSE 'open'
      END,
      importance = coalesce(NEW.gap_importance, importance),
      owner_id = NEW.owner_id,
      recommended_source = NEW.recommended_source,
      resolved_at = CASE
        WHEN NEW.answered OR NEW.gap_status = 'resolved'
          THEN coalesce(resolved_at, clock_timestamp())
        ELSE NULL
      END,
      updated_at = clock_timestamp()
    WHERE id = v_gap_id AND client_id = NEW.client_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS coach_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  retention_days SMALLINT NOT NULL DEFAULT 365 CHECK (retention_days BETWEEN 30 AND 730),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE UNIQUE INDEX IF NOT EXISTS coach_threads_one_active_owner
  ON coach_threads (client_id, owner_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS coach_threads_owner_time
  ON coach_threads (owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS coach_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES coach_threads(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question TEXT NOT NULL CHECK (length(btrim(question)) BETWEEN 3 AND 8000),
  answer TEXT NOT NULL CHECK (length(btrim(answer)) BETWEEN 1 AND 30000),
  coach_mode TEXT NOT NULL DEFAULT 'private'
    CHECK (coach_mode IN (
      'private','message_client','message_va_team','create_task',
      'update_task','submit_review','review_task'
    )),
  brain_context_snapshot_id UUID NOT NULL
    REFERENCES brain_context_snapshots(id) ON DELETE RESTRICT,
  sources JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(sources) = 'array'),
  suggestions JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(suggestions) = 'array'),
  library_availability TEXT NOT NULL DEFAULT 'not_requested'
    CHECK (library_availability IN ('available','degraded','unavailable','not_requested')),
  warnings JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(warnings) = 'array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (owner_id, brain_context_snapshot_id)
);

CREATE INDEX IF NOT EXISTS coach_turns_thread_time
  ON coach_turns (thread_id, created_at);
-- Drop the child FK before rebuilding the parent identity constraint. This
-- ordering is required when an idempotent rerun finds both already present.
ALTER TABLE coach_turns DROP CONSTRAINT IF EXISTS coach_turns_thread_owner_fkey;
ALTER TABLE coach_threads DROP CONSTRAINT IF EXISTS coach_threads_identity_unique;
ALTER TABLE coach_threads
  ADD CONSTRAINT coach_threads_identity_unique UNIQUE (id, client_id, owner_id);
ALTER TABLE coach_turns
  ADD CONSTRAINT coach_turns_thread_owner_fkey
  FOREIGN KEY (thread_id, client_id, owner_id)
  REFERENCES coach_threads(id, client_id, owner_id)
  ON DELETE CASCADE;

ALTER TABLE coach_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_turns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coach_threads_owner_all ON coach_threads;
CREATE POLICY coach_threads_owner_all ON coach_threads
  FOR ALL
  USING (owner_id = auth.uid() AND client_id = current_user_client_id())
  WITH CHECK (owner_id = auth.uid() AND client_id = current_user_client_id());
DROP POLICY IF EXISTS coach_turns_owner_all ON coach_turns;
CREATE POLICY coach_turns_owner_all ON coach_turns
  FOR ALL
  USING (owner_id = auth.uid() AND client_id = current_user_client_id())
  WITH CHECK (owner_id = auth.uid() AND client_id = current_user_client_id());

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'company';
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_audience_valid;
ALTER TABLE messages
  ADD CONSTRAINT messages_audience_valid
  CHECK (audience IN ('company', 'client', 'va_team'));

CREATE INDEX IF NOT EXISTS messages_client_audience_time
  ON messages (client_id, audience, created_at);

DROP POLICY IF EXISTS "messages_select" ON messages;
CREATE POLICY "messages_select" ON messages FOR SELECT USING (
  client_id = current_user_client_id()
  AND (
    sender_id = auth.uid()
    OR audience = 'company'
    OR (audience = 'client' AND current_user_role() = 'client_admin')
    OR (audience = 'va_team' AND current_user_role() = 'va')
  )
);

-- Called by the service during normal Coach traffic. Raw private prompts have a
-- short retention window; persistent threads follow the owner's thread policy.
CREATE OR REPLACE FUNCTION purge_expired_coach_private_data()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_deleted INTEGER := 0;
  v_rows INTEGER := 0;
BEGIN
  DELETE FROM vault_queries
  WHERE visibility = 'private_coach'
    AND retention_until IS NOT NULL
    AND retention_until <= clock_timestamp();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  DELETE FROM coach_turns turn_row
  USING coach_threads thread_row
  WHERE turn_row.thread_id = thread_row.id
    AND turn_row.created_at < clock_timestamp() - make_interval(days => thread_row.retention_days);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_deleted := v_deleted + v_rows;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION purge_expired_coach_private_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION purge_expired_coach_private_data() TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('134_coach_privacy_and_recipient_boundaries.sql')
ON CONFLICT DO NOTHING;
