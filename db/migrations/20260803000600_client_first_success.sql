-- Durable, tenant-level client onboarding. Milestones are recorded from real
-- successful product events and never regress when source records are archived
-- or aged out. Operational dashboard reads can treat this layer as optional.

CREATE TABLE IF NOT EXISTS client_onboarding_milestones (
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  milestone TEXT NOT NULL CHECK (milestone IN (
    'company_confirmed', 'documents_ready', 'voice_configured',
    'coach_question_asked', 'content_draft_created', 'va_task_requested'
  )),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL DEFAULT 'system' CHECK (source_type IN (
    'company_dna', 'style', 'vault', 'coach', 'content', 'task', 'system'
  )),
  source_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  PRIMARY KEY (client_id, milestone)
);

CREATE TABLE IF NOT EXISTS client_onboarding_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  step TEXT CHECK (step IS NULL OR step IN ('company','documents','voice','coach','draft','task')),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'journey_viewed', 'step_viewed', 'step_completed'
  )),
  dedupe_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE client_onboarding_events
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

ALTER TABLE client_onboarding_milestones
  DROP CONSTRAINT IF EXISTS client_onboarding_milestones_source_type_check;
ALTER TABLE client_onboarding_milestones
  ADD CONSTRAINT client_onboarding_milestones_source_type_check
  CHECK (source_type IN ('company_dna','style','vault','coach','content','task','system'));

CREATE INDEX IF NOT EXISTS client_onboarding_events_client_time
  ON client_onboarding_events (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS client_onboarding_events_funnel
  ON client_onboarding_events (event_type, step, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS client_onboarding_events_dedupe
  ON client_onboarding_events (dedupe_key);

ALTER TABLE client_onboarding_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_onboarding_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_onboarding_milestones_select ON client_onboarding_milestones;
CREATE POLICY client_onboarding_milestones_select ON client_onboarding_milestones
  FOR SELECT USING (client_id = current_user_client_id() OR current_user_role() = 'super_admin');
DROP POLICY IF EXISTS client_onboarding_events_select ON client_onboarding_events;
CREATE POLICY client_onboarding_events_select ON client_onboarding_events
  FOR SELECT USING (client_id = current_user_client_id() OR current_user_role() = 'super_admin');

REVOKE ALL ON TABLE client_onboarding_milestones FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE client_onboarding_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE client_onboarding_milestones TO authenticated, service_role;
GRANT SELECT ON TABLE client_onboarding_events TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE client_onboarding_milestones TO service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE client_onboarding_events TO service_role;

CREATE OR REPLACE FUNCTION record_client_onboarding_milestone(
  p_client_id UUID,
  p_milestone TEXT,
  p_completed_by UUID DEFAULT NULL,
  p_source_type TEXT DEFAULT 'system',
  p_source_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row_count INTEGER := 0;
BEGIN
  IF p_milestone NOT IN (
    'company_confirmed', 'documents_ready', 'voice_configured',
    'coach_question_asked', 'content_draft_created', 'va_task_requested'
  ) THEN
    RAISE EXCEPTION 'Unknown onboarding milestone.' USING ERRCODE = '22023';
  END IF;
  IF p_source_type NOT IN ('company_dna','style','vault','coach','content','task','system') THEN
    RAISE EXCEPTION 'Unknown onboarding source.' USING ERRCODE = '22023';
  END IF;
  IF p_completed_by IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM users WHERE id = p_completed_by AND client_id = p_client_id
  ) THEN
    RAISE EXCEPTION 'Onboarding actor does not belong to the client.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO client_onboarding_milestones (
    client_id, milestone, completed_by, source_type, source_id, metadata
  ) VALUES (
    p_client_id, p_milestone, p_completed_by, p_source_type, p_source_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (client_id, milestone) DO NOTHING;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count > 0
     AND coalesce(p_metadata ->> 'suppressEvent', 'false') <> 'true' THEN
    INSERT INTO client_onboarding_events (client_id, user_id, step, event_type, metadata)
    VALUES (
      p_client_id,
      p_completed_by,
      CASE p_milestone
        WHEN 'company_confirmed' THEN 'company'
        WHEN 'documents_ready' THEN 'documents'
        WHEN 'voice_configured' THEN 'voice'
        WHEN 'coach_question_asked' THEN 'coach'
        WHEN 'content_draft_created' THEN 'draft'
        WHEN 'va_task_requested' THEN 'task'
      END,
      'step_completed',
      jsonb_build_object('sourceType', p_source_type, 'sourceId', p_source_id)
    );
  END IF;
  RETURN v_row_count > 0;
END;
$$;

CREATE OR REPLACE FUNCTION get_client_first_success_progress(p_client_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'milestones', coalesce((
      SELECT jsonb_agg(milestone ORDER BY milestone)
      FROM client_onboarding_milestones
      WHERE client_id = p_client_id
    ), '[]'::jsonb),
    'readyDocumentCount', (
      SELECT count(DISTINCT coalesce(nullif(vi.content_hash, ''), vi.id::text))
      FROM vault_items vi
      WHERE vi.client_id = p_client_id
        AND vi.status = 'ready'
        AND vi.evidence_role = 'factual'
        AND vi.knowledge_status = 'active'
        AND EXISTS (
          SELECT 1 FROM vault_chunks vc
          WHERE vc.item_id = vi.id
            AND vc.client_id = p_client_id
            AND vc.embedding IS NOT NULL
        )
    )
  );
$$;

REVOKE ALL ON FUNCTION record_client_onboarding_milestone(UUID,TEXT,UUID,TEXT,UUID,JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION get_client_first_success_progress(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_client_onboarding_milestone(UUID,TEXT,UUID,TEXT,UUID,JSONB)
  TO service_role;
GRANT EXECUTE ON FUNCTION get_client_first_success_progress(UUID)
  TO service_role;

DROP FUNCTION IF EXISTS refresh_documents_ready_milestone(UUID) CASCADE;
CREATE OR REPLACE FUNCTION refresh_documents_ready_milestone(
  p_client_id UUID,
  p_suppress_event BOOLEAN DEFAULT false
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF EXISTS (
    SELECT 1 FROM client_onboarding_milestones
    WHERE client_id = p_client_id AND milestone = 'documents_ready'
  ) THEN
    RETURN;
  END IF;

  SELECT count(DISTINCT coalesce(nullif(vi.content_hash, ''), vi.id::text))
  INTO v_count
  FROM vault_items vi
  WHERE vi.client_id = p_client_id
    AND vi.status = 'ready'
    AND vi.evidence_role = 'factual'
    AND vi.knowledge_status = 'active'
    AND EXISTS (
      SELECT 1 FROM vault_chunks vc
      WHERE vc.item_id = vi.id AND vc.client_id = p_client_id AND vc.embedding IS NOT NULL
    );
  IF v_count >= 3 THEN
    PERFORM record_client_onboarding_milestone(
      p_client_id, 'documents_ready', NULL, 'vault', NULL,
      jsonb_build_object(
        'searchableDistinctSources', v_count,
        'suppressEvent', p_suppress_event
      )
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION onboarding_vault_item_changed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM refresh_documents_ready_milestone(NEW.client_id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS onboarding_vault_item_changed_trigger ON vault_items;
CREATE TRIGGER onboarding_vault_item_changed_trigger
AFTER INSERT OR UPDATE OF status, evidence_role, knowledge_status, content_hash, indexed_at, index_error ON vault_items
FOR EACH ROW EXECUTE FUNCTION onboarding_vault_item_changed();

DROP FUNCTION IF EXISTS refresh_voice_configured_milestone(UUID) CASCADE;
CREATE OR REPLACE FUNCTION refresh_voice_configured_milestone(
  p_client_id UUID,
  p_suppress_event BOOLEAN DEFAULT false
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_type TEXT;
  v_source_id UUID;
BEGIN
  IF EXISTS (
    SELECT 1 FROM client_onboarding_milestones
    WHERE client_id = p_client_id AND milestone = 'voice_configured'
  ) THEN
    RETURN;
  END IF;

  SELECT 'company_dna', id
  INTO v_source_type, v_source_id
  FROM company_dna
    WHERE client_id = p_client_id
      AND (
        nullif(btrim(coalesce(brand_voice, '')), '') IS NOT NULL
        OR nullif(btrim(coalesce(content_style, '')), '') IS NOT NULL
      )
  LIMIT 1;

  IF v_source_type IS NULL THEN
    SELECT 'style', id
    INTO v_source_type, v_source_id
    FROM content_style_analyses
    WHERE client_id = p_client_id AND status = 'approved'
    ORDER BY approved_at DESC NULLS LAST, updated_at DESC
    LIMIT 1;
  END IF;

  IF v_source_type IS NOT NULL THEN
    PERFORM record_client_onboarding_milestone(
      p_client_id, 'voice_configured', NULL, v_source_type, v_source_id,
      jsonb_build_object(
        'existingConfiguration', true,
        'suppressEvent', p_suppress_event
      )
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION onboarding_company_voice_changed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM refresh_voice_configured_milestone(NEW.client_id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS onboarding_company_voice_changed_trigger ON company_dna;
CREATE TRIGGER onboarding_company_voice_changed_trigger
AFTER INSERT OR UPDATE OF brand_voice, content_style ON company_dna
FOR EACH ROW EXECUTE FUNCTION onboarding_company_voice_changed();

CREATE OR REPLACE FUNCTION onboarding_style_analysis_changed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'approved' THEN
    PERFORM refresh_voice_configured_milestone(NEW.client_id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS onboarding_style_analysis_changed_trigger ON content_style_analyses;
CREATE TRIGGER onboarding_style_analysis_changed_trigger
AFTER INSERT OR UPDATE OF status ON content_style_analyses
FOR EACH ROW EXECUTE FUNCTION onboarding_style_analysis_changed();

CREATE OR REPLACE FUNCTION onboarding_coach_turn_created()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM users WHERE id = NEW.owner_id AND client_id = NEW.client_id AND role = 'client_admin'
  ) THEN
    PERFORM record_client_onboarding_milestone(
      NEW.client_id, 'coach_question_asked', NEW.owner_id, 'coach', NEW.id, '{}'::jsonb
    );
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS onboarding_coach_turn_created_trigger ON coach_turns;
CREATE TRIGGER onboarding_coach_turn_created_trigger
AFTER INSERT ON coach_turns FOR EACH ROW EXECUTE FUNCTION onboarding_coach_turn_created();

CREATE OR REPLACE FUNCTION onboarding_content_draft_created()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF nullif(btrim(coalesce(NEW.body, '')), '') IS NOT NULL
     AND NEW.created_by IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM users
       WHERE id = NEW.created_by AND client_id = NEW.client_id AND role = 'client_admin'
     ) THEN
    PERFORM record_client_onboarding_milestone(
      NEW.client_id, 'content_draft_created', NEW.created_by, 'content', NEW.id, '{}'::jsonb
    );
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS onboarding_content_draft_created_trigger ON content_pieces;
CREATE TRIGGER onboarding_content_draft_created_trigger
AFTER INSERT OR UPDATE OF body ON content_pieces
FOR EACH ROW EXECUTE FUNCTION onboarding_content_draft_created();

CREATE OR REPLACE FUNCTION onboarding_va_task_requested()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL
     AND EXISTS (SELECT 1 FROM users WHERE id = NEW.created_by AND client_id = NEW.client_id AND role = 'client_admin')
     AND EXISTS (SELECT 1 FROM users WHERE id = NEW.assigned_to AND client_id = NEW.client_id AND role = 'va') THEN
    PERFORM record_client_onboarding_milestone(
      NEW.client_id, 'va_task_requested', NEW.created_by, 'task', NEW.id, '{}'::jsonb
    );
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS onboarding_va_task_requested_trigger ON tasks;
CREATE TRIGGER onboarding_va_task_requested_trigger
AFTER INSERT OR UPDATE OF assigned_to ON tasks
FOR EACH ROW EXECUTE FUNCTION onboarding_va_task_requested();

REVOKE ALL ON FUNCTION refresh_documents_ready_milestone(UUID,BOOLEAN)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION onboarding_vault_item_changed()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION refresh_voice_configured_milestone(UUID,BOOLEAN)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION onboarding_company_voice_changed()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION onboarding_style_analysis_changed()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION onboarding_coach_turn_created()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION onboarding_content_draft_created()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION onboarding_va_task_requested()
  FROM PUBLIC, anon, authenticated;

-- Preserve first success for existing active clients where the event is already
-- demonstrable. Company deliberately requires explicit confirmation; an
-- existing voice field or approved analysis already proves voice configuration.
INSERT INTO client_onboarding_milestones (client_id, milestone, completed_by, source_type, source_id)
SELECT DISTINCT ON (ct.client_id)
  ct.client_id, 'coach_question_asked', ct.owner_id, 'coach', ct.id
FROM coach_turns ct
JOIN users u ON u.id = ct.owner_id AND u.client_id = ct.client_id AND u.role = 'client_admin'
ORDER BY ct.client_id, ct.created_at
ON CONFLICT DO NOTHING;

INSERT INTO client_onboarding_milestones (client_id, milestone, completed_by, source_type, source_id)
SELECT DISTINCT ON (cp.client_id)
  cp.client_id, 'content_draft_created', cp.created_by, 'content', cp.id
FROM content_pieces cp
JOIN users creator
  ON creator.id = cp.created_by
 AND creator.client_id = cp.client_id
 AND creator.role = 'client_admin'
WHERE nullif(btrim(coalesce(cp.body, '')), '') IS NOT NULL
ORDER BY cp.client_id, cp.created_at
ON CONFLICT DO NOTHING;

INSERT INTO client_onboarding_milestones (client_id, milestone, completed_by, source_type, source_id)
SELECT DISTINCT ON (t.client_id)
  t.client_id, 'va_task_requested', t.created_by, 'task', t.id
FROM tasks t
JOIN users creator ON creator.id = t.created_by AND creator.client_id = t.client_id AND creator.role = 'client_admin'
JOIN users assignee ON assignee.id = t.assigned_to AND assignee.client_id = t.client_id AND assignee.role = 'va'
ORDER BY t.client_id, t.created_at
ON CONFLICT DO NOTHING;

DO $$
DECLARE v_client UUID;
BEGIN
  FOR v_client IN SELECT id FROM clients LOOP
    PERFORM refresh_documents_ready_milestone(v_client, true);
    PERFORM refresh_voice_configured_milestone(v_client, true);
  END LOOP;
END;
$$;

INSERT INTO schema_migrations (version)
VALUES ('20260803000600_client_first_success.sql')
ON CONFLICT (version) DO NOTHING;
