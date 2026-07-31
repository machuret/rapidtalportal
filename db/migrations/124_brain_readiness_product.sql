-- ============================================================
-- 124_brain_readiness_product.sql
-- Brain Phase 4: managed knowledge gaps and meaningful activity.
-- Readiness is calculated from live source-of-truth tables by the app.
-- ============================================================

CREATE TABLE IF NOT EXISTS brain_knowledge_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  normalized_topic TEXT NOT NULL CHECK (length(btrim(normalized_topic)) BETWEEN 1 AND 500),
  example_questions TEXT[] NOT NULL DEFAULT '{}'::TEXT[]
    CHECK (cardinality(example_questions) BETWEEN 1 AND 20),
  occurrence_count INTEGER NOT NULL DEFAULT 1 CHECK (occurrence_count > 0),
  affected_surfaces TEXT[] NOT NULL DEFAULT '{}'::TEXT[]
    CHECK (affected_surfaces <@ ARRAY['ask','content','compose','tool']::TEXT[]),
  importance TEXT NOT NULL DEFAULT 'normal'
    CHECK (importance IN ('low','normal','high','critical')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_review','resolved','dismissed')),
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  recommended_source TEXT CHECK (length(recommended_source) <= 500),
  resolved_by_vault_item_id UUID REFERENCES vault_items(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  resolved_at TIMESTAMPTZ,
  UNIQUE (client_id, normalized_topic)
);

CREATE INDEX IF NOT EXISTS brain_knowledge_gaps_workflow_idx
  ON brain_knowledge_gaps (client_id, status, importance, occurrence_count DESC);

ALTER TABLE brain_knowledge_gaps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE brain_knowledge_gaps FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE brain_knowledge_gaps TO service_role;

DROP POLICY IF EXISTS brain_knowledge_gaps_tenant_select ON brain_knowledge_gaps;
CREATE POLICY brain_knowledge_gaps_tenant_select
  ON brain_knowledge_gaps FOR SELECT
  USING (current_user_role() = 'super_admin' OR client_id = current_user_client_id());

CREATE TABLE IF NOT EXISTS brain_maintenance_state (
  client_id UUID PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  last_decay_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE brain_maintenance_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE brain_maintenance_state FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE brain_maintenance_state TO service_role;

ALTER TABLE vault_queries
  ADD COLUMN IF NOT EXISTS brain_gap_id UUID
    REFERENCES brain_knowledge_gaps(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS vault_queries_brain_gap_idx
  ON vault_queries (brain_gap_id, created_at DESC)
  WHERE brain_gap_id IS NOT NULL;

INSERT INTO brain_knowledge_gaps (
  client_id, normalized_topic, example_questions, occurrence_count,
  affected_surfaces, importance, status, owner_id, recommended_source,
  resolved_at, created_at, updated_at
)
SELECT
  client_id,
  left(coalesce(
    nullif(btrim(gap_key), ''),
    lower(regexp_replace(btrim(question), '\s+', ' ', 'g'))
  ), 500),
  (array_agg(DISTINCT left(btrim(question), 2000)))[1:20],
  count(*)::INTEGER,
  ARRAY['ask']::TEXT[],
  CASE
    WHEN bool_or(gap_importance = 'critical') THEN 'critical'
    WHEN bool_or(gap_importance = 'high') THEN 'high'
    WHEN bool_or(gap_importance = 'normal') THEN 'normal'
    ELSE 'low'
  END,
  CASE
    WHEN bool_or(gap_status = 'in_review') THEN 'in_review'
    WHEN bool_or(gap_status = 'open') THEN 'open'
    WHEN bool_or(gap_status = 'resolved') THEN 'resolved'
    ELSE 'dismissed'
  END,
  (array_agg(owner_id ORDER BY created_at DESC) FILTER (WHERE owner_id IS NOT NULL))[1],
  (array_agg(recommended_source ORDER BY created_at DESC)
    FILTER (WHERE recommended_source IS NOT NULL))[1],
  max(created_at) FILTER (WHERE gap_status = 'resolved'),
  min(created_at),
  max(created_at)
FROM vault_queries
WHERE nullif(btrim(question), '') IS NOT NULL
GROUP BY client_id, left(coalesce(
  nullif(btrim(gap_key), ''),
  lower(regexp_replace(btrim(question), '\s+', ' ', 'g'))
), 500)
ON CONFLICT (client_id, normalized_topic) DO NOTHING;

UPDATE vault_queries query
SET brain_gap_id = gap.id
FROM brain_knowledge_gaps gap
WHERE query.client_id = gap.client_id
  AND gap.normalized_topic = left(coalesce(
    nullif(btrim(query.gap_key), ''),
    lower(regexp_replace(btrim(query.question), '\s+', ' ', 'g'))
  ), 500)
  AND query.brain_gap_id IS NULL;

CREATE OR REPLACE FUNCTION sync_brain_knowledge_gap_from_query()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_topic TEXT;
  v_gap_id UUID;
  v_surface TEXT;
BEGIN
  v_topic := left(coalesce(
    nullif(btrim(NEW.gap_key), ''),
    lower(regexp_replace(btrim(NEW.question), '\s+', ' ', 'g'))
  ), 500);
  -- vault_queries is written by Ask the Vault. Other surfaces can create or
  -- update managed gap records through the tenant-checked application route.
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

DROP TRIGGER IF EXISTS vault_queries_brain_gap_sync ON vault_queries;
CREATE TRIGGER vault_queries_brain_gap_sync
BEFORE INSERT OR UPDATE OF answered, dismissed, gap_status, gap_importance,
  owner_id, recommended_source, gap_key
ON vault_queries FOR EACH ROW EXECUTE FUNCTION sync_brain_knowledge_gap_from_query();
REVOKE ALL ON FUNCTION sync_brain_knowledge_gap_from_query()
  FROM PUBLIC, anon, authenticated;

ALTER TABLE brain_events
  ADD COLUMN IF NOT EXISTS meaningful BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS event_type TEXT,
  ADD COLUMN IF NOT EXISTS channel TEXT,
  ADD COLUMN IF NOT EXISTS artifact_id UUID,
  ADD COLUMN IF NOT EXISTS event_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS brain_events_meaningful_key
  ON brain_events (client_id, event_key) WHERE event_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS brain_events_meaningful_timeline
  ON brain_events (client_id, created_at DESC) WHERE meaningful = true;

CREATE OR REPLACE FUNCTION record_meaningful_brain_event(
  p_client_id UUID,
  p_event_type TEXT,
  p_summary TEXT,
  p_meta JSONB DEFAULT '{}'::JSONB,
  p_channel TEXT DEFAULT NULL,
  p_artifact_id UUID DEFAULT NULL,
  p_event_key TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO brain_events (
    client_id, kind, summary, meta, meaningful, event_type,
    channel, artifact_id, event_key
  ) VALUES (
    p_client_id, p_event_type, p_summary, coalesce(p_meta, '{}'::JSONB),
    true, p_event_type, p_channel, p_artifact_id, p_event_key
  )
  ON CONFLICT (client_id, event_key) WHERE event_key IS NOT NULL
  DO UPDATE SET summary = EXCLUDED.summary, meta = EXCLUDED.meta,
    created_at = clock_timestamp()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION record_meaningful_brain_event(
  UUID, TEXT, TEXT, JSONB, TEXT, UUID, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_meaningful_brain_event(
  UUID, TEXT, TEXT, JSONB, TEXT, UUID, TEXT
) TO service_role;

CREATE OR REPLACE FUNCTION capture_brain_product_activity()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count INTEGER;
  v_date TEXT := to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD');
BEGIN
  IF TG_TABLE_NAME = 'content_style_analyses'
     AND NEW.status = 'approved'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    PERFORM record_meaningful_brain_event(
      NEW.client_id, 'style_approved', initcap(NEW.channel) || ' voice profile approved.',
      jsonb_build_object('sourceCount', NEW.source_count, 'confidence', NEW.analysis->>'confidence'),
      NEW.channel, NEW.id, 'style:' || NEW.id::TEXT
    );
  ELSIF TG_TABLE_NAME = 'brain_memory'
     AND NEW.status = 'active' AND NEW.active = true
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active' OR OLD.active IS DISTINCT FROM true) THEN
    PERFORM record_meaningful_brain_event(
      NEW.client_id, 'memory_approved',
      'A learned ' || replace(NEW.kind, '_', ' ') || ' was approved.',
      jsonb_build_object('memoryId', NEW.id, 'scope', NEW.scope),
      null, NEW.id, 'memory-approved:' || NEW.id::TEXT
    );
  ELSIF TG_TABLE_NAME = 'brain_memory'
     AND NEW.contradiction_status = 'open'
     AND (TG_OP = 'INSERT' OR OLD.contradiction_status IS DISTINCT FROM 'open') THEN
    PERFORM record_meaningful_brain_event(
      NEW.client_id, 'memory_conflict', 'Conflicting feedback needs review.',
      jsonb_build_object('memoryId', NEW.id, 'summary', NEW.conflict_summary),
      null, NEW.id, 'memory-conflict:' || NEW.id::TEXT
    );
  ELSIF TG_TABLE_NAME = 'brain_knowledge_gaps'
     AND NEW.status = 'resolved'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'resolved') THEN
    PERFORM record_meaningful_brain_event(
      NEW.client_id, 'gap_resolved',
      'Knowledge gap resolved: ' || left(NEW.example_questions[1], 180),
      jsonb_build_object('occurrences', NEW.occurrence_count, 'vaultItemId', NEW.resolved_by_vault_item_id),
      null, NEW.id, 'gap-resolved:' || NEW.id::TEXT
    );
  ELSIF TG_TABLE_NAME = 'competitor_intelligence_runs' AND NEW.status = 'complete' THEN
    PERFORM record_meaningful_brain_event(
      NEW.client_id, 'market_refreshed',
      'Competitor intelligence refreshed from ' || NEW.source_count || ' captured items.',
      jsonb_build_object('sourceCount', NEW.source_count, 'competitorCount', cardinality(NEW.competitor_ids)),
      null, NEW.id, 'market:' || NEW.id::TEXT
    );
  ELSIF TG_TABLE_NAME = 'vault_items'
     AND NEW.status = 'ready'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'ready') THEN
    SELECT count(*)::INTEGER INTO v_count FROM vault_items
    WHERE client_id = NEW.client_id AND status = 'ready'
      AND updated_at >= date_trunc('day', clock_timestamp());
    PERFORM record_meaningful_brain_event(
      NEW.client_id, 'sources_usable',
      v_count || CASE WHEN v_count = 1 THEN ' source became usable.' ELSE ' sources became usable.' END,
      jsonb_build_object('count', v_count), null, NULL,
      'sources:' || NEW.client_id::TEXT || ':' || v_date
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS brain_activity_style_approved ON content_style_analyses;
CREATE TRIGGER brain_activity_style_approved
AFTER INSERT OR UPDATE OF status ON content_style_analyses
FOR EACH ROW EXECUTE FUNCTION capture_brain_product_activity();
DROP TRIGGER IF EXISTS brain_activity_memory ON brain_memory;
CREATE TRIGGER brain_activity_memory
AFTER INSERT OR UPDATE OF status, active, contradiction_status ON brain_memory
FOR EACH ROW EXECUTE FUNCTION capture_brain_product_activity();
DROP TRIGGER IF EXISTS brain_activity_gap ON brain_knowledge_gaps;
CREATE TRIGGER brain_activity_gap
AFTER INSERT OR UPDATE OF status ON brain_knowledge_gaps
FOR EACH ROW EXECUTE FUNCTION capture_brain_product_activity();
DROP TRIGGER IF EXISTS brain_activity_market ON competitor_intelligence_runs;
CREATE TRIGGER brain_activity_market
AFTER INSERT ON competitor_intelligence_runs
FOR EACH ROW EXECUTE FUNCTION capture_brain_product_activity();
DROP TRIGGER IF EXISTS brain_activity_vault_ready ON vault_items;
CREATE TRIGGER brain_activity_vault_ready
AFTER INSERT OR UPDATE OF status ON vault_items
FOR EACH ROW EXECUTE FUNCTION capture_brain_product_activity();
REVOKE ALL ON FUNCTION capture_brain_product_activity()
  FROM PUBLIC, anon, authenticated;

INSERT INTO schema_migrations (version)
VALUES ('124_brain_readiness_product.sql')
ON CONFLICT DO NOTHING;
