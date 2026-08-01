-- ============================================================
-- 144_fix_multi_table_trigger_field_validation.sql
--
-- ROOT CAUSE of the vault-insert failures (manual add-content AND site
-- crawl page saves, both erroring with `record "new" has no field
-- "active"`):
--
-- capture_brain_product_activity fires on FIVE tables (vault_items,
-- brain_memory, brain_knowledge_gaps, competitor_intelligence_runs,
-- content_style_analyses) but its IF/ELSIF chain references
-- NEW.active / NEW.contradiction_status — fields that exist ONLY on
-- brain_memory. PL/pgSQL expands record-field references when the IF
-- condition is *planned*, not when the branch is taken, so on any other
-- table the whole statement fails at plan time, regardless of the
-- TG_TABLE_NAME guard short-circuiting at runtime.
--
-- The fix: table-specific fields may only appear in statements nested
-- INSIDE their own table's branch (separate statements are planned lazily,
-- only when reached). Semantics are unchanged — the brain_memory branch
-- keeps its original ELSIF ordering (approved checked before conflict).
-- ============================================================

CREATE OR REPLACE FUNCTION capture_brain_product_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count INTEGER;
  v_date TEXT := to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD');
BEGIN
  -- Only fields common to every triggering table (status/old.status) may be
  -- referenced in this outer chain — see the migration header comment.
  IF TG_TABLE_NAME = 'content_style_analyses'
     AND NEW.status = 'approved'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    PERFORM record_meaningful_brain_event(
      NEW.client_id, 'style_approved', initcap(NEW.channel) || ' voice profile approved.',
      jsonb_build_object('sourceCount', NEW.source_count, 'confidence', NEW.analysis->>'confidence'),
      NEW.channel, NEW.id, 'style:' || NEW.id::TEXT
    );
  ELSIF TG_TABLE_NAME = 'brain_memory' THEN
    -- Nested statements: planned lazily, so brain_memory-only fields
    -- (active, contradiction_status) are never expanded for other tables.
    IF NEW.status = 'active' AND NEW.active = true
       AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active' OR OLD.active IS DISTINCT FROM true) THEN
      PERFORM record_meaningful_brain_event(
        NEW.client_id, 'memory_approved',
        'A learned ' || replace(NEW.kind, '_', ' ') || ' was approved.',
        jsonb_build_object('memoryId', NEW.id, 'scope', NEW.scope),
        null, NEW.id, 'memory-approved:' || NEW.id::TEXT
      );
    ELSIF NEW.contradiction_status = 'open'
       AND (TG_OP = 'INSERT' OR OLD.contradiction_status IS DISTINCT FROM 'open') THEN
      PERFORM record_meaningful_brain_event(
        NEW.client_id, 'memory_conflict', 'Conflicting feedback needs review.',
        jsonb_build_object('memoryId', NEW.id, 'summary', NEW.conflict_summary),
        null, NEW.id, 'memory-conflict:' || NEW.id::TEXT
      );
    END IF;
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
$function$;

REVOKE ALL ON FUNCTION capture_brain_product_activity() FROM PUBLIC, anon, authenticated;

INSERT INTO schema_migrations (version)
VALUES ('144_fix_multi_table_trigger_field_validation.sql')
ON CONFLICT DO NOTHING;
