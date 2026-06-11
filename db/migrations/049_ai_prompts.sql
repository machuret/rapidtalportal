-- ============================================================
-- 049_ai_prompts.sql – Admin-managed AI prompt overrides
-- Run in Supabase SQL Editor after 048_tool_run_outputs.sql
--
-- Every AI feature's system prompt has a code default (lib/prompts/registry.ts).
-- This table stores admin overrides by slug: when a row exists, the app uses it
-- instead of the default — edits go live instantly, no deploy. Resetting a
-- prompt deletes its row. ai_prompt_versions keeps every saved revision so an
-- admin can always roll back.
-- Service-role access only (no RLS policies granted). Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_prompts (
  slug       TEXT PRIMARY KEY,        -- e.g. 'tools.gbp', 'sops.generate', 'style.outreach'
  content    TEXT NOT NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_prompt_versions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       TEXT NOT NULL,
  content    TEXT NOT NULL,
  saved_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_prompt_versions_slug_idx ON ai_prompt_versions (slug, created_at DESC);

ALTER TABLE ai_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_prompt_versions ENABLE ROW LEVEL SECURITY;

INSERT INTO schema_migrations (version) VALUES ('049_ai_prompts.sql')
ON CONFLICT DO NOTHING;
