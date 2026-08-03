-- Compact the mutable lead projection while retaining immutable discovery
-- captures, and clean up legacy duplicate campaign definitions created before
-- atomic fingerprints were introduced.

UPDATE prospecting_campaigns duplicate
SET archived_at = COALESCE(duplicate.archived_at, clock_timestamp()),
    status = 'archived'
WHERE duplicate.archived_at IS NULL
  AND duplicate.search_fingerprint IS NULL
  AND EXISTS (
    SELECT 1 FROM prospecting_campaigns keeper
    WHERE keeper.client_id = duplicate.client_id
      AND keeper.id <> duplicate.id
      AND keeper.archived_at IS NULL
      AND keeper.search_fingerprint = prospecting_search_fingerprint(
        duplicate.source, duplicate.queries, duplicate.locations,
        duplicate.country_code, duplicate.language_code, duplicate.max_results
      )
  );

CREATE OR REPLACE FUNCTION reference_latest_prospecting_capture()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE prospecting_prospects SET raw_payload = jsonb_build_object(
    'storedIn', 'prospecting_discovery_captures',
    'captureId', NEW.id,
    'payloadHash', NEW.payload_hash
  ) WHERE id = NEW.prospect_id AND client_id = NEW.client_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS prospecting_capture_compact_projection ON prospecting_discovery_captures;
CREATE TRIGGER prospecting_capture_compact_projection
AFTER INSERT ON prospecting_discovery_captures
FOR EACH ROW EXECUTE FUNCTION reference_latest_prospecting_capture();

WITH latest AS (
  SELECT DISTINCT ON (client_id, prospect_id)
    client_id, prospect_id, id, payload_hash
  FROM prospecting_discovery_captures
  ORDER BY client_id, prospect_id, captured_at DESC, created_at DESC, id DESC
)
UPDATE prospecting_prospects prospect SET raw_payload = jsonb_build_object(
  'storedIn', 'prospecting_discovery_captures',
  'captureId', latest.id,
  'payloadHash', latest.payload_hash
)
FROM latest
WHERE prospect.client_id = latest.client_id AND prospect.id = latest.prospect_id;

-- JSON.stringify() is bounded by UTF-16 characters in the application; the
-- byte limits below allow worst-case UTF-8 expansion while remaining finite.
ALTER TABLE prospecting_prospects DROP CONSTRAINT IF EXISTS prospecting_prospects_raw_payload_size;
ALTER TABLE prospecting_prospects ADD CONSTRAINT prospecting_prospects_raw_payload_size
  CHECK (octet_length(raw_payload::TEXT) <= 100000) NOT VALID;
ALTER TABLE prospecting_discovery_captures DROP CONSTRAINT IF EXISTS prospecting_capture_raw_payload_size;
ALTER TABLE prospecting_discovery_captures ADD CONSTRAINT prospecting_capture_raw_payload_size
  CHECK (octet_length(raw_payload::TEXT) <= 100000) NOT VALID;
ALTER TABLE prospecting_discovery_captures DROP CONSTRAINT IF EXISTS prospecting_capture_normalized_payload_size;
ALTER TABLE prospecting_discovery_captures ADD CONSTRAINT prospecting_capture_normalized_payload_size
  CHECK (octet_length(normalized_payload::TEXT) <= 100000) NOT VALID;

ALTER TABLE prospecting_enrichment_snapshots DROP CONSTRAINT IF EXISTS prospecting_enrichment_excerpt_size;
ALTER TABLE prospecting_enrichment_snapshots ADD CONSTRAINT prospecting_enrichment_excerpt_size
  CHECK (content_excerpt IS NULL OR octet_length(content_excerpt) <= 25000) NOT VALID;
ALTER TABLE prospecting_enrichment_snapshots DROP CONSTRAINT IF EXISTS prospecting_enrichment_page_urls_size;
ALTER TABLE prospecting_enrichment_snapshots ADD CONSTRAINT prospecting_enrichment_page_urls_size
  CHECK (cardinality(page_urls) <= 5) NOT VALID;
ALTER TABLE prospecting_enrichment_snapshots DROP CONSTRAINT IF EXISTS prospecting_enrichment_emails_size;
ALTER TABLE prospecting_enrichment_snapshots ADD CONSTRAINT prospecting_enrichment_emails_size
  CHECK (cardinality(emails) <= 10) NOT VALID;
ALTER TABLE prospecting_enrichment_snapshots DROP CONSTRAINT IF EXISTS prospecting_enrichment_phones_size;
ALTER TABLE prospecting_enrichment_snapshots ADD CONSTRAINT prospecting_enrichment_phones_size
  CHECK (cardinality(phones) <= 10) NOT VALID;

-- Immutable capture history is readable by admins and tenant users, but only
-- the service ingestion boundary may write it. Service role bypasses RLS.
DROP POLICY IF EXISTS prospecting_discovery_captures_super_admin_all ON prospecting_discovery_captures;
DROP POLICY IF EXISTS prospecting_discovery_captures_super_admin_select ON prospecting_discovery_captures;
CREATE POLICY prospecting_discovery_captures_super_admin_select
  ON prospecting_discovery_captures FOR SELECT
  USING (current_user_role() = 'super_admin');

INSERT INTO schema_migrations (version)
VALUES ('20260803000311_prospecting_storage_compaction.sql')
ON CONFLICT (version) DO NOTHING;
