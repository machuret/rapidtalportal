-- Preserve the latest enrichment attempt on each lead, including terminal
-- failures and cancellations. A successful snapshot alone cannot explain why
-- a refresh failed or why an enrichment button apparently did nothing.

ALTER TABLE prospecting_campaign_leads
  ADD COLUMN IF NOT EXISTS latest_enrichment_job_id UUID;

ALTER TABLE prospecting_campaign_leads
  DROP CONSTRAINT IF EXISTS prospecting_campaign_leads_latest_enrichment_job_fkey;
ALTER TABLE prospecting_campaign_leads
  ADD CONSTRAINT prospecting_campaign_leads_latest_enrichment_job_fkey
  FOREIGN KEY (latest_enrichment_job_id)
  REFERENCES prospecting_jobs(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS prospecting_campaign_leads_latest_enrichment_job_idx
  ON prospecting_campaign_leads (latest_enrichment_job_id)
  WHERE latest_enrichment_job_id IS NOT NULL;

WITH latest AS (
  SELECT DISTINCT ON (lead_id) lead_id, id
  FROM prospecting_jobs
  WHERE job_type = 'enrichment' AND lead_id IS NOT NULL
  ORDER BY lead_id, created_at DESC, id DESC
)
UPDATE prospecting_campaign_leads lead
SET latest_enrichment_job_id = latest.id
FROM latest
WHERE latest.lead_id = lead.id
  AND lead.latest_enrichment_job_id IS DISTINCT FROM latest.id;

CREATE OR REPLACE FUNCTION remember_latest_prospecting_enrichment_job()
RETURNS TRIGGER
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.job_type = 'enrichment' AND NEW.lead_id IS NOT NULL THEN
    UPDATE prospecting_campaign_leads
    SET latest_enrichment_job_id = NEW.id
    WHERE id = NEW.lead_id AND client_id = NEW.client_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Enrichment lead not found.' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS remember_latest_prospecting_enrichment_job ON prospecting_jobs;
CREATE TRIGGER remember_latest_prospecting_enrichment_job
AFTER INSERT ON prospecting_jobs
FOR EACH ROW
WHEN (NEW.job_type = 'enrichment')
EXECUTE FUNCTION remember_latest_prospecting_enrichment_job();

INSERT INTO schema_migrations (version)
VALUES ('20260803000313_prospecting_enrichment_attempt_visibility.sql')
ON CONFLICT (version) DO NOTHING;
