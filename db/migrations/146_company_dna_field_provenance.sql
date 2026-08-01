-- ============================================================
-- 146_company_dna_field_provenance.sql
--
-- Per-field provenance for Company DNA: which fields were auto-filled
-- (website scrape or Vault draft) versus hand-written, and when. Today a
-- scraped value and a typed value look identical in the form, so users
-- can't tell what to review. The UI shows an "auto-filled" badge on those
-- fields; any manual edit clears the field's provenance on next save.
-- Shape: { "<field_key>": { "source": "scrape" | "vault_draft", "at": "<iso>" } }
-- ============================================================

ALTER TABLE company_dna
  ADD COLUMN IF NOT EXISTS field_provenance JSONB NOT NULL DEFAULT '{}'::jsonb;

INSERT INTO schema_migrations (version)
VALUES ('146_company_dna_field_provenance.sql')
ON CONFLICT DO NOTHING;
