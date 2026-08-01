-- ============================================================
-- 142_coach_proactive_turns.sql
-- Proactive Coach: the weekly cron writes turns it originated into the
-- owner's thread (with a server-authored action preview) so the human can
-- confirm or edit them through the exact same execution path as interactive
-- asks. An `origin` column distinguishes those turns for dedupe, analytics,
-- and retention semantics. No new grants — writes stay service-role only.
-- ============================================================

ALTER TABLE coach_turns
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'interactive';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'coach_turns_origin_check'
  ) THEN
    ALTER TABLE coach_turns
      ADD CONSTRAINT coach_turns_origin_check CHECK (origin IN ('interactive', 'proactive'));
  END IF;
END $$;

-- The cron's "already suggested this week" dedupe lookup.
CREATE INDEX IF NOT EXISTS coach_turns_proactive_recent
  ON coach_turns (owner_id, created_at DESC) WHERE origin = 'proactive';

INSERT INTO schema_migrations (version)
VALUES ('142_coach_proactive_turns.sql')
ON CONFLICT DO NOTHING;
