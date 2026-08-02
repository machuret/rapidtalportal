-- ============================================================
-- 149_notebook_revision_coalescing.sql – collapse rapid autosave snapshots
-- Run in Supabase SQL Editor after 148_coach_tool_call_log.sql
--
-- The notebook autosave (1.5s debounce) PATCHes the page on every pause, and
-- 055/056's change trigger snapshots a PERMANENT revision row per save, pruned
-- at 50 per page. A focused editing session therefore exhausts the entire
-- revision history with near-identical snapshots, pushing genuinely older
-- states out of the prune window.
--
-- Fix: when the new snapshot's editor and page match the LATEST existing
-- revision AND that revision is younger than 5 minutes, refresh that row in
-- place (content, title, timestamp) instead of appending a new one. The
-- result is one rolling "current burst" row per editor per page; anything
-- older than the 5-minute window stays immutable, so meaningful checkpoints
-- are never rewritten.
--
-- notebook_page_revisions has no action/origin column, so coalescing keys on
-- (page, editor, recency) alone — every revision write goes through this one
-- trigger, including restores (a restore by the same editor inside the window
-- simply refreshes the burst row to the restored content, which is the state
-- the page now shows).
--
-- The 50-row prune (notebook_prune_revisions, AFTER INSERT) is untouched: a
-- coalesced UPDATE adds no row, so there is nothing new to prune.
-- Idempotent.
-- ============================================================

CREATE OR REPLACE FUNCTION notebook_on_page_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role    TEXT;
  v_event   TEXT;
  v_changed BOOLEAN := false;
  v_latest  notebook_page_revisions%ROWTYPE;
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

  -- Snapshot a revision whenever content/title materially changed.
  IF v_changed THEN
    SELECT * INTO v_latest
    FROM notebook_page_revisions
    WHERE page_id = NEW.id
    ORDER BY created_at DESC
    LIMIT 1;

    -- Coalesce the autosave burst: same page, same editor (NULL-safe), latest
    -- snapshot under 5 minutes old → update it in place. Older revisions, and
    -- the page-creation snapshot (a brand-new page has no prior rows), always
    -- insert.
    IF TG_OP = 'UPDATE'
       AND v_latest.id IS NOT NULL
       AND v_latest.edited_by IS NOT DISTINCT FROM NEW.last_edited_by
       AND v_latest.created_at > now() - interval '5 minutes' THEN
      UPDATE notebook_page_revisions
      SET content    = NEW.content,
          title      = NEW.title,
          created_at = now()
      WHERE id = v_latest.id;
    ELSE
      INSERT INTO notebook_page_revisions (page_id, content, title, edited_by)
      VALUES (NEW.id, NEW.content, NEW.title, NEW.last_edited_by);
    END IF;
  END IF;

  -- Log activity for genuine user actions only (seeds have NULL role).
  IF v_role IS NOT NULL THEN
    INSERT INTO notebook_activity (placement_id, event, actor_role)
    VALUES (NEW.placement_id, v_event, v_role);
  END IF;

  RETURN NEW;
END;
$$;

INSERT INTO schema_migrations (version) VALUES ('149_notebook_revision_coalescing.sql')
ON CONFLICT DO NOTHING;
