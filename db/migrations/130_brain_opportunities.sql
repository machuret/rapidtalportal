-- ============================================================
-- 130_brain_opportunities.sql
-- Brain Phase 5: scheduled diagnostics, approval-led opportunities and
-- effectiveness tracking. Every opportunity is tied to an immutable official
-- Brain context snapshot; tenant access remains server-side and service-role
-- only.
-- ============================================================

ALTER TABLE brain_context_snapshots
  DROP CONSTRAINT IF EXISTS brain_context_snapshots_resolver_version_check;

ALTER TABLE brain_context_snapshots
  ADD CONSTRAINT brain_context_snapshots_resolver_version_check
  CHECK (
    resolver_version IN (
      'resolver-v1',
      'resolver-v2-task-memory',
      'resolver-v3-business-library',
      'resolver-v4-library-availability'
    )
  );

ALTER TABLE brain_context_snapshots
  DROP CONSTRAINT IF EXISTS brain_context_snapshots_surface_check;

ALTER TABLE brain_context_snapshots
  ADD CONSTRAINT brain_context_snapshots_surface_check
  CHECK (surface IN ('ask', 'content', 'compose', 'tool', 'diagnostic'));

ALTER TABLE brain_context_snapshots
  DROP CONSTRAINT IF EXISTS brain_context_snapshots_artifact_kind_check;

ALTER TABLE brain_context_snapshots
  ADD CONSTRAINT brain_context_snapshots_artifact_kind_check
  CHECK (
    artifact_kind IS NULL OR artifact_kind IN (
      'vault_answer', 'content_topic', 'content_project',
      'content_piece', 'tool_run', 'compose',
      'brain_diagnostic_run', 'brain_opportunity'
    )
  );

-- Composite keys make tenant ownership a database invariant, not merely an
-- application convention. A run or opportunity cannot point at another
-- company's snapshot even when written with the service role.
CREATE UNIQUE INDEX IF NOT EXISTS brain_context_snapshots_id_client
  ON brain_context_snapshots (id, client_id);

CREATE TABLE IF NOT EXISTS brain_diagnostic_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  trigger_kind TEXT NOT NULL
    CHECK (trigger_kind IN ('scheduled', 'manual')),
  brain_context_snapshot_id UUID,
  summary JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(summary) = 'object'),
  opportunities_created INTEGER NOT NULL DEFAULT 0
    CHECK (opportunities_created BETWEEN 0 AND 100),
  error_code TEXT,
  error_message TEXT,
  recoverable BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    status <> 'completed'
    OR (brain_context_snapshot_id IS NOT NULL AND completed_at IS NOT NULL)
  ),
  CHECK (
    status <> 'failed'
    OR (error_code IS NOT NULL AND error_message IS NOT NULL AND completed_at IS NOT NULL)
  ),
  FOREIGN KEY (brain_context_snapshot_id, client_id)
    REFERENCES brain_context_snapshots(id, client_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS brain_diagnostic_runs_one_running
  ON brain_diagnostic_runs (client_id)
  WHERE status = 'running';
CREATE UNIQUE INDEX IF NOT EXISTS brain_diagnostic_runs_id_client
  ON brain_diagnostic_runs (id, client_id);
CREATE INDEX IF NOT EXISTS brain_diagnostic_runs_client_time
  ON brain_diagnostic_runs (client_id, created_at DESC);

CREATE TABLE IF NOT EXISTS brain_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  diagnostic_run_id UUID NOT NULL,
  brain_context_snapshot_id UUID NOT NULL,
  fingerprint TEXT NOT NULL CHECK (length(fingerprint) = 64),
  kind TEXT NOT NULL CHECK (
    kind IN (
      'knowledge_gap', 'voice', 'personalisation',
      'reliability', 'market', 'growth'
    )
  ),
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 240),
  summary TEXT NOT NULL CHECK (length(btrim(summary)) BETWEEN 1 AND 2000),
  rationale TEXT NOT NULL CHECK (length(btrim(rationale)) BETWEEN 1 AND 4000),
  recommended_action TEXT NOT NULL
    CHECK (length(btrim(recommended_action)) BETWEEN 1 AND 2000),
  impact TEXT NOT NULL CHECK (impact IN ('low', 'medium', 'high')),
  effort TEXT NOT NULL CHECK (effort IN ('low', 'medium', 'high')),
  priority_score SMALLINT NOT NULL CHECK (priority_score BETWEEN 0 AND 100),
  source_layers TEXT[] NOT NULL DEFAULT '{}'::TEXT[]
    CHECK (
      source_layers <@ ARRAY[
        'company_dna', 'vault', 'library', 'memory', 'market', 'runtime'
      ]::TEXT[]
    ),
  company_provenance JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(company_provenance) = 'object'),
  library_provenance JSONB NOT NULL DEFAULT '[]'::JSONB
    CHECK (jsonb_typeof(library_provenance) = 'array'),
  status TEXT NOT NULL DEFAULT 'suggested' CHECK (
    status IN (
      'suggested', 'approved', 'dismissed',
      'in_progress', 'completed'
    )
  ),
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  dismissed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  dismissed_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  outcome JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(outcome) = 'object'),
  effectiveness_status TEXT NOT NULL DEFAULT 'unmeasured' CHECK (
    effectiveness_status IN (
      'unmeasured', 'measuring', 'effective', 'mixed', 'ineffective'
    )
  ),
  measured_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    jsonb_array_length(library_provenance) = 0
    OR 'library' = ANY(source_layers)
  ),
  CHECK (
    NOT ('library' = ANY(source_layers))
    OR (
      jsonb_array_length(library_provenance) > 0
      AND jsonb_array_length(
        jsonb_path_query_array(
          library_provenance,
          '$[*] ? (@.entryId.type() == "string" && @.versionId.type() == "string" && @.versionNumber.type() == "number")'
        )
      ) = jsonb_array_length(library_provenance)
    )
  ),
  FOREIGN KEY (diagnostic_run_id, client_id)
    REFERENCES brain_diagnostic_runs(id, client_id) ON DELETE CASCADE,
  FOREIGN KEY (brain_context_snapshot_id, client_id)
    REFERENCES brain_context_snapshots(id, client_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS brain_opportunities_open_fingerprint
  ON brain_opportunities (client_id, fingerprint)
  WHERE status IN ('suggested', 'approved', 'in_progress');
CREATE INDEX IF NOT EXISTS brain_opportunities_client_status
  ON brain_opportunities (client_id, status, priority_score DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS brain_opportunities_snapshot
  ON brain_opportunities (brain_context_snapshot_id);
CREATE UNIQUE INDEX IF NOT EXISTS brain_opportunities_id_client
  ON brain_opportunities (id, client_id);

CREATE TABLE IF NOT EXISTS brain_opportunity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  event_kind TEXT NOT NULL CHECK (
    event_kind IN (
      'suggested', 'approved', 'dismissed',
      'started', 'completed', 'reopened', 'measured'
    )
  ),
  from_status TEXT,
  to_status TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(metadata) = 'object'),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (opportunity_id, client_id)
    REFERENCES brain_opportunities(id, client_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS brain_opportunity_events_timeline
  ON brain_opportunity_events (opportunity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS brain_opportunity_events_client_time
  ON brain_opportunity_events (client_id, created_at DESC);

CREATE OR REPLACE FUNCTION record_brain_opportunity_suggested()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  INSERT INTO brain_opportunity_events (
    opportunity_id, client_id, event_kind,
    from_status, to_status, metadata, actor_id
  )
  VALUES (
    NEW.id, NEW.client_id, 'suggested',
    NULL, 'suggested',
    jsonb_build_object(
      'diagnosticRunId', NEW.diagnostic_run_id,
      'snapshotId', NEW.brain_context_snapshot_id
    ),
    (
      SELECT created_by
      FROM brain_diagnostic_runs
      WHERE id = NEW.diagnostic_run_id
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS brain_opportunity_suggested_after_insert
  ON brain_opportunities;
CREATE TRIGGER brain_opportunity_suggested_after_insert
AFTER INSERT ON brain_opportunities
FOR EACH ROW
EXECUTE FUNCTION record_brain_opportunity_suggested();

CREATE OR REPLACE FUNCTION transition_brain_opportunity(
  p_opportunity_id UUID,
  p_client_id UUID,
  p_action TEXT,
  p_actor_id UUID,
  p_outcome JSONB DEFAULT '{}'::JSONB
)
RETURNS brain_opportunities
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_row brain_opportunities%ROWTYPE;
  previous_status TEXT;
  next_status TEXT;
  event_name TEXT;
  requested_effectiveness TEXT;
BEGIN
  SELECT *
  INTO current_row
  FROM brain_opportunities
  WHERE id = p_opportunity_id
    AND client_id = p_client_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Opportunity not found.';
  END IF;
  previous_status := current_row.status;

  IF p_action = 'approve' AND current_row.status = 'suggested' THEN
    next_status := 'approved';
    event_name := 'approved';
  ELSIF p_action = 'dismiss'
    AND current_row.status IN ('suggested', 'approved') THEN
    next_status := 'dismissed';
    event_name := 'dismissed';
  ELSIF p_action = 'start' AND current_row.status = 'approved' THEN
    next_status := 'in_progress';
    event_name := 'started';
  ELSIF p_action = 'complete'
    AND current_row.status IN ('approved', 'in_progress') THEN
    next_status := 'completed';
    event_name := 'completed';
  ELSIF p_action = 'reopen'
    AND current_row.status IN ('dismissed', 'completed') THEN
    next_status := 'suggested';
    event_name := 'reopened';
  ELSIF p_action = 'measure' AND current_row.status = 'completed' THEN
    next_status := 'completed';
    event_name := 'measured';
  ELSE
    RAISE EXCEPTION 'Invalid opportunity transition from % using %.',
      current_row.status, p_action;
  END IF;

  requested_effectiveness := coalesce(p_outcome->>'effectivenessStatus', '');
  IF requested_effectiveness <> ''
    AND requested_effectiveness NOT IN (
      'unmeasured', 'measuring', 'effective', 'mixed', 'ineffective'
    ) THEN
    RAISE EXCEPTION 'Invalid effectiveness status.';
  END IF;

  UPDATE brain_opportunities
  SET
    status = next_status,
    approved_by = CASE WHEN p_action = 'approve' THEN p_actor_id ELSE approved_by END,
    approved_at = CASE WHEN p_action = 'approve' THEN now() ELSE approved_at END,
    dismissed_by = CASE WHEN p_action = 'dismiss' THEN p_actor_id ELSE dismissed_by END,
    dismissed_at = CASE WHEN p_action = 'dismiss' THEN now() ELSE dismissed_at END,
    started_at = CASE WHEN p_action = 'start' THEN now() ELSE started_at END,
    completed_by = CASE WHEN p_action = 'complete' THEN p_actor_id ELSE completed_by END,
    completed_at = CASE WHEN p_action = 'complete' THEN now() ELSE completed_at END,
    outcome = CASE
      WHEN p_action IN ('complete', 'measure') THEN coalesce(p_outcome, '{}'::JSONB)
      WHEN p_action = 'reopen' THEN '{}'::JSONB
      ELSE outcome
    END,
    effectiveness_status = CASE
      WHEN p_action IN ('complete', 'measure') AND requested_effectiveness <> ''
        THEN requested_effectiveness
      WHEN p_action = 'complete' THEN 'measuring'
      WHEN p_action = 'reopen' THEN 'unmeasured'
      ELSE effectiveness_status
    END,
    measured_at = CASE
      WHEN p_action = 'measure' THEN now()
      WHEN p_action = 'reopen' THEN NULL
      ELSE measured_at
    END,
    updated_at = now()
  WHERE id = current_row.id
  RETURNING * INTO current_row;

  INSERT INTO brain_opportunity_events (
    opportunity_id, client_id, event_kind,
    from_status, to_status, metadata, actor_id
  )
  VALUES (
    current_row.id, current_row.client_id, event_name,
    previous_status,
    next_status,
    coalesce(p_outcome, '{}'::JSONB),
    p_actor_id
  );

  RETURN current_row;
END;
$$;

ALTER TABLE brain_diagnostic_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_opportunity_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  brain_diagnostic_runs,
  brain_opportunities,
  brain_opportunity_events
FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE
  brain_diagnostic_runs,
  brain_opportunities,
  brain_opportunity_events
TO service_role;

REVOKE ALL ON FUNCTION transition_brain_opportunity(UUID, UUID, TEXT, UUID, JSONB)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION transition_brain_opportunity(UUID, UUID, TEXT, UUID, JSONB)
TO service_role;

REVOKE ALL ON FUNCTION record_brain_opportunity_suggested()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_brain_opportunity_suggested()
TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('130_brain_opportunities.sql')
ON CONFLICT DO NOTHING;
