-- ============================================================
-- 056_notebook_log_restore.sql – record page restores in activity
-- Run in Supabase SQL Editor after 055_notebook.sql
--
-- 055's change trigger logged page_created / page_edited / page_archived but
-- fell through silently when a page was UN-archived (restored), because that
-- toggles is_archived without touching content or title — so the admin activity
-- trail missed restores. Map a restore to a 'page_edited' event (the enum has
-- no dedicated restore event, and a restore is a change to the page's state).
-- No revision is written for a restore since content is unchanged. Idempotent.
-- ============================================================

CREATE OR REPLACE FUNCTION notebook_on_page_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role  TEXT;
  v_event TEXT;
  v_changed BOOLEAN := false;
BEGIN
  v_role := notebook_actor_role(NEW.placement_id);

  IF TG_OP = 'INSERT' THEN
    v_event := 'page_created';
    v_changed := true;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.is_archived AND NOT OLD.is_archived THEN
      v_event := 'page_archived';
    ELSIF NOT NEW.is_archived AND OLD.is_archived THEN
      v_event := 'page_edited'; -- restore (no dedicated enum value)
    ELSIF NEW.content IS DISTINCT FROM OLD.content OR NEW.title IS DISTINCT FROM OLD.title THEN
      v_event := 'page_edited';
      v_changed := true;
    ELSE
      RETURN NEW; -- sort/no-op change: nothing to record
    END IF;
  END IF;

  IF v_changed THEN
    INSERT INTO notebook_page_revisions (page_id, content, title, edited_by)
    VALUES (NEW.id, NEW.content, NEW.title, NEW.last_edited_by);
  END IF;

  IF v_role IS NOT NULL THEN
    INSERT INTO notebook_activity (placement_id, event, actor_role)
    VALUES (NEW.placement_id, v_event, v_role);
  END IF;

  RETURN NEW;
END;
$$;

INSERT INTO schema_migrations (version) VALUES ('056_notebook_log_restore.sql')
ON CONFLICT DO NOTHING;
