-- ============================================================
-- 081_help_videos.sql – Per-feature tutorial videos + editable guides
-- Run in Supabase SQL Editor after 080_notification_prefs.sql
--
-- Two super-admin-managed help surfaces (no RLS — written by service role
-- via /api/admin/* routes, read server-side via the admin client):
--
--   feature_videos  one optional Loom video per feature page (keyed by the
--                   PageIntro slug, e.g. 'vault', 'tasks'). Shown to clients
--                   and VAs alike behind a "Video Tutorial" button.
--
--   guides          the editable Client and VA guides. One JSONB row per
--                   audience ('client' | 'va') holding { intro, groups }.
--                   Absent row = fall back to the built-in code default, so
--                   the guides keep working before anything is saved.
-- Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS feature_videos (
  slug       TEXT PRIMARY KEY,
  loom_url   TEXT NOT NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS guides (
  key        TEXT PRIMARY KEY CHECK (key IN ('client', 'va')),
  data       JSONB NOT NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations (version) VALUES ('081_help_videos.sql')
ON CONFLICT DO NOTHING;
