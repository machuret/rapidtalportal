-- ============================================================
-- 087_content_brand_style.sql – Explicit brand style + channels
--
-- Company DNA remains the authority for how content should sound. Channel
-- styles are deliberate human-authored overrides, not inferred performance
-- signals. Legacy "social" rows remain valid, while new work is stored as one
-- platform-specific artifact.
-- ============================================================

ALTER TABLE company_dna
  ADD COLUMN IF NOT EXISTS preferred_terms    TEXT,
  ADD COLUMN IF NOT EXISTS prohibited_terms   TEXT,
  ADD COLUMN IF NOT EXISTS emoji_policy       TEXT,
  ADD COLUMN IF NOT EXISTS humour_policy      TEXT,
  ADD COLUMN IF NOT EXISTS spelling_locale    TEXT,
  ADD COLUMN IF NOT EXISTS default_cta_style  TEXT,
  ADD COLUMN IF NOT EXISTS approved_claims    TEXT,
  ADD COLUMN IF NOT EXISTS prohibited_claims  TEXT,
  ADD COLUMN IF NOT EXISTS channel_styles     JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE content_topics
  DROP CONSTRAINT IF EXISTS content_topics_content_type_check;

ALTER TABLE content_topics
  ADD CONSTRAINT content_topics_content_type_check
  CHECK (content_type IN (
    'email', 'linkedin', 'facebook', 'instagram', 'social',
    'newsletter', 'blog', 'message', 'other'
  ));

ALTER TABLE content_pieces
  DROP CONSTRAINT IF EXISTS content_pieces_content_type_check;

ALTER TABLE content_pieces
  ADD CONSTRAINT content_pieces_content_type_check
  CHECK (content_type IN (
    'email', 'linkedin', 'facebook', 'instagram', 'social',
    'newsletter', 'blog', 'message', 'other'
  ));

INSERT INTO schema_migrations (version) VALUES ('087_content_brand_style.sql')
ON CONFLICT DO NOTHING;
