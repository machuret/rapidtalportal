-- Keep tenant identity intact when an enrichment snapshot is removed. The
-- composite FK must null only latest_enrichment_id, never client_id.

ALTER TABLE prospecting_campaign_leads
  DROP CONSTRAINT IF EXISTS prospecting_campaign_leads_latest_enrichment_fkey;
ALTER TABLE prospecting_campaign_leads
  ADD CONSTRAINT prospecting_campaign_leads_latest_enrichment_fkey
  FOREIGN KEY (latest_enrichment_id, client_id)
  REFERENCES prospecting_enrichment_snapshots(id, client_id)
  ON DELETE SET NULL (latest_enrichment_id);

INSERT INTO schema_migrations (version)
VALUES ('20260803000302_prospecting_enrichment_fk_cleanup.sql')
ON CONFLICT (version) DO NOTHING;
