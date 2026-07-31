-- ============================================================
-- 123_editorial_learning.sql
-- Deliberate editorial learning: immutable change events, dimension-specific
-- feedback and a human-reviewed learning inbox. Publishing and performance
-- remain explicitly excluded from Brain learning.
-- ============================================================

ALTER TABLE brain_signals
  ADD COLUMN IF NOT EXISTS dimensions TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS channel TEXT,
  ADD COLUMN IF NOT EXISTS content_type TEXT,
  ADD COLUMN IF NOT EXISTS learning_intent TEXT NOT NULL DEFAULT 'explicit_feedback',
  ADD COLUMN IF NOT EXISTS editorial_event_id UUID;

ALTER TABLE brain_signals DROP CONSTRAINT IF EXISTS brain_signals_dimensions_valid;
ALTER TABLE brain_signals
  ADD CONSTRAINT brain_signals_dimensions_valid CHECK (
    dimensions <@ ARRAY[
      'topic','voice','hook','structure','audience','useful_detail','cta','length',
      'vocabulary','promotional_intensity','paragraph_length','heading_structure',
      'lists','emoji','sentence_length','point_of_view','claims','formatting'
    ]::TEXT[]
  );

ALTER TABLE brain_signals DROP CONSTRAINT IF EXISTS brain_signals_learning_intent_valid;
ALTER TABLE brain_signals
  ADD CONSTRAINT brain_signals_learning_intent_valid CHECK (
    learning_intent IN ('explicit_feedback', 'explicit_revision_teaching')
  );

CREATE TABLE IF NOT EXISTS content_editorial_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  project_id UUID REFERENCES content_projects(id) ON DELETE CASCADE,
  piece_id UUID NOT NULL REFERENCES content_pieces(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (
    event_type IN ('generated','manual_revision','ai_rewrite','submitted','approved')
  ),
  edit_origin TEXT NOT NULL CHECK (
    edit_origin IN ('generation','manual','ai_rewrite','workflow')
  ),
  before_title TEXT,
  after_title TEXT,
  before_body TEXT,
  after_body TEXT,
  analysis JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(analysis) = 'object'),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS content_editorial_events_piece_idx
  ON content_editorial_events(piece_id, created_at, id);
CREATE INDEX IF NOT EXISTS content_editorial_events_client_idx
  ON content_editorial_events(client_id, created_at DESC);

ALTER TABLE content_editorial_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS content_editorial_events_tenant_select ON content_editorial_events;
CREATE POLICY content_editorial_events_tenant_select
  ON content_editorial_events FOR SELECT
  USING (
    current_user_role() = 'super_admin'
    OR client_id = current_user_client_id()
  );

CREATE TABLE IF NOT EXISTS editorial_learning_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  project_id UUID REFERENCES content_projects(id) ON DELETE CASCADE,
  piece_id UUID NOT NULL REFERENCES content_pieces(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES content_editorial_events(id) ON DELETE CASCADE,
  classification TEXT NOT NULL CHECK (
    classification IN (
      'content_specific','company_factual','voice_preference','channel_preference',
      'format_preference','hard_rule_candidate','one_off'
    )
  ),
  proposed_outcome TEXT NOT NULL CHECK (
    proposed_outcome IN (
      'brain_preference','brain_anti_pattern','company_dna_update',
      'channel_style_update','vault_correction','no_reusable_learning'
    )
  ),
  dimensions TEXT[] NOT NULL DEFAULT '{}',
  summary TEXT NOT NULL,
  lesson_content TEXT NOT NULL,
  explanation TEXT NOT NULL,
  before_excerpt TEXT NOT NULL DEFAULT '',
  after_excerpt TEXT NOT NULL DEFAULT '',
  proposed_scope JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(proposed_scope) = 'object'),
  confidence SMALLINT NOT NULL DEFAULT 50 CHECK (confidence BETWEEN 0 AND 100),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending','use_draft','proposed','approved','dismissed','rejected')
  ),
  signal_id UUID REFERENCES brain_signals(id) ON DELETE SET NULL,
  memory_id UUID REFERENCES brain_memory(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (event_id)
);

ALTER TABLE editorial_learning_suggestions
  ADD COLUMN IF NOT EXISTS lesson_content TEXT;
UPDATE editorial_learning_suggestions
SET lesson_content = summary
WHERE lesson_content IS NULL OR btrim(lesson_content) = '';
ALTER TABLE editorial_learning_suggestions
  ALTER COLUMN lesson_content SET NOT NULL;

CREATE INDEX IF NOT EXISTS editorial_learning_inbox_idx
  ON editorial_learning_suggestions(client_id, status, created_at DESC);

ALTER TABLE editorial_learning_suggestions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS editorial_learning_suggestions_tenant_select ON editorial_learning_suggestions;
CREATE POLICY editorial_learning_suggestions_tenant_select
  ON editorial_learning_suggestions FOR SELECT
  USING (
    current_user_role() = 'super_admin'
    OR client_id = current_user_client_id()
  );

ALTER TABLE brain_signals
  DROP CONSTRAINT IF EXISTS brain_signals_editorial_event_fkey;
ALTER TABLE brain_signals
  ADD CONSTRAINT brain_signals_editorial_event_fkey
  FOREIGN KEY (editorial_event_id)
  REFERENCES content_editorial_events(id)
  ON DELETE SET NULL;

-- Existing AI drafts receive a recoverable original snapshot. New generations
-- set ai_original at persistence time in content-generate.
UPDATE content_pieces piece
SET ai_original = coalesce(
  (
    SELECT revision.body
    FROM content_piece_revisions revision
    WHERE revision.piece_id = piece.id
    ORDER BY revision.revision_number, revision.created_at, revision.id
    LIMIT 1
  ),
  piece.body
)
WHERE piece.ai_original IS NULL
  AND piece.generation_kind <> 'manual'
  AND piece.body IS NOT NULL;

INSERT INTO content_editorial_events (
  client_id, project_id, piece_id, event_type, edit_origin,
  after_title, after_body, analysis, created_by, created_at
)
SELECT
  piece.client_id, piece.project_id, piece.id, 'generated', 'generation',
  piece.title, piece.ai_original,
  jsonb_build_object('backfilled', true),
  piece.created_by, piece.created_at
FROM content_pieces piece
WHERE piece.ai_original IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM content_editorial_events event
    WHERE event.piece_id = piece.id AND event.event_type = 'generated'
  );

CREATE OR REPLACE FUNCTION initialise_generated_content_lineage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.generation_kind <> 'manual'
     AND NEW.body IS NOT NULL
     AND NEW.ai_original IS NULL THEN
    NEW.ai_original := NEW.body;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS content_piece_initialise_ai_original ON content_pieces;
CREATE TRIGGER content_piece_initialise_ai_original
BEFORE INSERT ON content_pieces
FOR EACH ROW EXECUTE FUNCTION initialise_generated_content_lineage();

CREATE OR REPLACE FUNCTION capture_generated_content_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.ai_original IS NOT NULL THEN
    INSERT INTO content_editorial_events (
      client_id, project_id, piece_id, event_type, edit_origin,
      after_title, after_body, analysis, created_by, created_at
    ) VALUES (
      NEW.client_id, NEW.project_id, NEW.id, 'generated', 'generation',
      NEW.title, NEW.ai_original,
      jsonb_build_object('generationKind', NEW.generation_kind),
      NEW.created_by, NEW.created_at
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS content_piece_capture_generated_event ON content_pieces;
CREATE TRIGGER content_piece_capture_generated_event
AFTER INSERT ON content_pieces
FOR EACH ROW EXECUTE FUNCTION capture_generated_content_event();

-- Runs alphabetically before content_pieces_revision_history, whose trigger
-- consumes revision_reason. This makes the before/after ledger part of the same
-- transaction as every edit, even if the application process disappears after
-- the database update commits.
CREATE OR REPLACE FUNCTION capture_content_editorial_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ai_rewrite BOOLEAN;
  v_actor UUID;
BEGIN
  IF NEW.title IS NOT DISTINCT FROM OLD.title
     AND NEW.body IS NOT DISTINCT FROM OLD.body THEN
    RETURN NEW;
  END IF;

  v_ai_rewrite := lower(coalesce(NEW.revision_reason, '')) LIKE '%rewrite%';
  BEGIN
    v_actor := nullif(current_setting('request.jwt.claim.sub', true), '')::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    v_actor := NULL;
  END;

  INSERT INTO content_editorial_events (
    client_id, project_id, piece_id, event_type, edit_origin,
    before_title, after_title, before_body, after_body, analysis, created_by
  ) VALUES (
    OLD.client_id, OLD.project_id, OLD.id,
    CASE WHEN v_ai_rewrite THEN 'ai_rewrite' ELSE 'manual_revision' END,
    CASE WHEN v_ai_rewrite THEN 'ai_rewrite' ELSE 'manual' END,
    OLD.title, NEW.title, OLD.body, NEW.body,
    jsonb_build_object('pendingAnalysis', true),
    coalesce(v_actor, NEW.created_by, OLD.created_by)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS a_content_piece_editorial_event ON content_pieces;
CREATE TRIGGER a_content_piece_editorial_event
BEFORE UPDATE OF title, body ON content_pieces
FOR EACH ROW EXECUTE FUNCTION capture_content_editorial_change();

CREATE OR REPLACE FUNCTION capture_content_approval_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    INSERT INTO content_editorial_events (
      client_id, project_id, piece_id, event_type, edit_origin,
      after_title, after_body, analysis, created_by
    ) VALUES (
      NEW.client_id, NEW.project_id, NEW.id, 'approved', 'workflow',
      NEW.title, NEW.body, '{}'::jsonb, NEW.created_by
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS content_piece_capture_approval_event ON content_pieces;
CREATE TRIGGER content_piece_capture_approval_event
AFTER UPDATE OF status ON content_pieces
FOR EACH ROW EXECUTE FUNCTION capture_content_approval_event();

CREATE OR REPLACE FUNCTION capture_content_submission_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_piece content_pieces%ROWTYPE;
BEGIN
  IF NEW.current_step = 'approve' AND OLD.current_step IS DISTINCT FROM 'approve' THEN
    SELECT * INTO v_piece
    FROM content_pieces
    WHERE id = NEW.current_piece_id AND client_id = NEW.client_id;
    IF FOUND THEN
      INSERT INTO content_editorial_events (
        client_id, project_id, piece_id, event_type, edit_origin,
        after_title, after_body, analysis, created_by
      ) VALUES (
        NEW.client_id, NEW.id, v_piece.id, 'submitted', 'workflow',
        v_piece.title, v_piece.body, '{}'::jsonb, NEW.created_by
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS content_project_capture_submission_event ON content_projects;
CREATE TRIGGER content_project_capture_submission_event
AFTER UPDATE OF current_step ON content_projects
FOR EACH ROW EXECUTE FUNCTION capture_content_submission_event();

CREATE OR REPLACE FUNCTION approve_editorial_learning_suggestion(
  p_client_id UUID,
  p_suggestion_id UUID,
  p_actor_id UUID,
  p_scope JSONB DEFAULT NULL
)
RETURNS SETOF editorial_learning_suggestions
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
  v_suggestion editorial_learning_suggestions%ROWTYPE;
  v_event content_editorial_events%ROWTYPE;
  v_piece content_pieces%ROWTYPE;
  v_actor_role TEXT;
  v_actor_client UUID;
  v_signal_id UUID;
  v_memory_id UUID;
  v_scope JSONB;
  v_kind TEXT;
  v_reason TEXT;
BEGIN
  SELECT role::TEXT, client_id
    INTO v_actor_role, v_actor_client
  FROM users
  WHERE id = p_actor_id;

  IF NOT FOUND
     OR v_actor_role NOT IN ('client_admin','super_admin')
     OR (v_actor_role <> 'super_admin' AND v_actor_client IS DISTINCT FROM p_client_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only a client administrator or super administrator can approve permanent learning.';
  END IF;

  SELECT * INTO v_suggestion
  FROM editorial_learning_suggestions
  WHERE id = p_suggestion_id AND client_id = p_client_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Learning suggestion not found.';
  END IF;
  IF v_suggestion.status IN ('dismissed','rejected') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A dismissed suggestion cannot be approved.';
  END IF;

  SELECT * INTO v_event FROM content_editorial_events
  WHERE id = v_suggestion.event_id AND client_id = p_client_id;
  SELECT * INTO v_piece FROM content_pieces
  WHERE id = v_suggestion.piece_id AND client_id = p_client_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Connected content was not found.';
  END IF;

  v_scope := coalesce(p_scope, v_suggestion.proposed_scope);
  IF jsonb_typeof(v_scope) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Learning scope must be an object.';
  END IF;

  IF v_suggestion.proposed_outcome IN ('brain_preference','brain_anti_pattern') THEN
    v_reason := concat_ws(' ', v_suggestion.summary, v_suggestion.explanation);
    v_signal_id := v_suggestion.signal_id;
    IF v_signal_id IS NULL THEN
      INSERT INTO brain_signals (
        client_id, user_id, surface, artifact_id, artifact_text, rating, reason,
        context, dimensions, channel, content_type, learning_intent,
        editorial_event_id, distilled_at
      ) VALUES (
        p_client_id, v_suggestion.created_by, 'content_draft', v_piece.id,
        coalesce(v_event.after_body, ''),
        CASE WHEN v_suggestion.proposed_outcome = 'brain_anti_pattern' THEN -1 ELSE 1 END,
        v_reason,
        jsonb_build_object(
          'event', 'explicit_revision_teaching',
          'suggestionId', v_suggestion.id,
          'classification', v_suggestion.classification
        ),
        v_suggestion.dimensions,
        v_piece.content_type,
        coalesce(v_piece.content_brief->>'contentType', v_piece.content_type),
        'explicit_revision_teaching',
        v_event.id,
        clock_timestamp()
      )
      RETURNING id INTO v_signal_id;
    END IF;

    v_kind := CASE
      WHEN v_suggestion.proposed_outcome = 'brain_anti_pattern' THEN 'anti_pattern'
      ELSE 'preference'
    END;
    v_memory_id := v_suggestion.memory_id;
    IF v_memory_id IS NULL THEN
      INSERT INTO brain_memory (
        client_id, kind, content, confidence, source_count, active, pinned,
        status, scope, first_observed_at, last_confirmed_at, approved_by,
        approved_at, lineage_complete
      ) VALUES (
        p_client_id, v_kind, v_suggestion.lesson_content,
        v_suggestion.confidence, 0, false, false, 'proposed', v_scope,
        v_event.created_at, clock_timestamp(), NULL, NULL, false
      )
      RETURNING id INTO v_memory_id;

      INSERT INTO brain_memory_sources (
        client_id, memory_id, signal_id, contribution
      ) VALUES (
        p_client_id, v_memory_id, v_signal_id, 'support'
      );
    END IF;

    UPDATE brain_memory
    SET
      status = 'active',
      active = true,
      approved_by = p_actor_id,
      approved_at = clock_timestamp(),
      last_confirmed_at = clock_timestamp(),
      last_reinforced_at = clock_timestamp(),
      updated_at = clock_timestamp()
    WHERE id = v_memory_id AND client_id = p_client_id;

    UPDATE brain_signals
    SET distilled_at = coalesce(distilled_at, clock_timestamp())
    WHERE id = v_signal_id AND client_id = p_client_id;
  END IF;

  UPDATE editorial_learning_suggestions
  SET
    status = 'approved',
    proposed_scope = v_scope,
    signal_id = coalesce(v_signal_id, signal_id),
    memory_id = coalesce(v_memory_id, memory_id),
    reviewed_by = p_actor_id,
    reviewed_at = clock_timestamp(),
    updated_at = clock_timestamp()
  WHERE id = v_suggestion.id
  RETURNING * INTO v_suggestion;

  RETURN NEXT v_suggestion;
END;
$$;

CREATE OR REPLACE FUNCTION reject_content_performance_signal()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.surface = 'content_outcome'
     OR coalesce(NEW.context->>'event', '') IN (
       'approval','approved','publish','published','publication',
       'performance','engagement','conversion','clicks','impressions'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Publishing and performance signals are not part of the Brain learning model.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON TABLE content_editorial_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE editorial_learning_suggestions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE content_editorial_events TO authenticated;
GRANT SELECT ON TABLE editorial_learning_suggestions TO authenticated;
GRANT ALL ON TABLE content_editorial_events TO service_role;
GRANT ALL ON TABLE editorial_learning_suggestions TO service_role;

REVOKE ALL ON FUNCTION approve_editorial_learning_suggestion(UUID,UUID,UUID,JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION approve_editorial_learning_suggestion(UUID,UUID,UUID,JSONB)
  TO service_role;
REVOKE ALL ON FUNCTION initialise_generated_content_lineage()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION capture_generated_content_event()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION capture_content_editorial_change()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION capture_content_approval_event()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION capture_content_submission_event()
  FROM PUBLIC, anon, authenticated;

INSERT INTO schema_migrations (version)
VALUES ('123_editorial_learning.sql')
ON CONFLICT DO NOTHING;
