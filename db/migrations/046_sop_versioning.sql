-- ============================================================
-- 046_sop_versioning.sql – SOP versions + fork lineage
-- Run in Supabase SQL Editor after 045_tool_runs.sql
--
-- Two correctness gaps closed:
--  1. Edits to a SOP now bump a version number, and each run records the
--     version it followed (sop_runs.sop_version) — no more silent changes
--     with no trace of what a VA actually ran.
--  2. Forks remember their origin (forked_from) and the source version at
--     fork time (forked_version), so the UI can show "the original has moved
--     on N versions since you forked" instead of forks drifting invisibly.
-- Idempotent.
-- ============================================================

ALTER TABLE sops
  ADD COLUMN IF NOT EXISTS version        INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS forked_from    UUID REFERENCES sops(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS forked_version INT;

ALTER TABLE sop_runs
  ADD COLUMN IF NOT EXISTS sop_version INT;

INSERT INTO schema_migrations (version) VALUES ('046_sop_versioning.sql')
ON CONFLICT DO NOTHING;
