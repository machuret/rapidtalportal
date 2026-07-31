-- ============================================================
-- 127_competitor_strategic_market_model.sql
-- Phase 5: reproducible strategic-intelligence metadata.
--
-- competitor_intelligence_runs is already immutable-by-replacement and stores
-- exact capture versions/hashes. These fields make the synthesis algorithm,
-- prompt contract and complete analysis payload independently auditable.
-- ============================================================

ALTER TABLE competitor_intelligence_runs
  ADD COLUMN IF NOT EXISTS prompt_version TEXT NOT NULL
    DEFAULT 'competitor-intelligence-phase5-v1',
  ADD COLUMN IF NOT EXISTS market_model_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS analysis_hash TEXT;

ALTER TABLE competitor_intelligence_runs
  DROP CONSTRAINT IF EXISTS competitor_intelligence_runs_market_model_version_check;
ALTER TABLE competitor_intelligence_runs
  ADD CONSTRAINT competitor_intelligence_runs_market_model_version_check
  CHECK (market_model_version > 0);

CREATE OR REPLACE FUNCTION set_competitor_intelligence_analysis_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.analysis_hash := encode(
    extensions.digest(convert_to(NEW.analysis::TEXT, 'UTF8'), 'sha256'),
    'hex'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS competitor_intelligence_analysis_hash_before_write
  ON competitor_intelligence_runs;
CREATE TRIGGER competitor_intelligence_analysis_hash_before_write
BEFORE INSERT OR UPDATE OF analysis ON competitor_intelligence_runs
FOR EACH ROW
EXECUTE FUNCTION set_competitor_intelligence_analysis_hash();

UPDATE competitor_intelligence_runs
SET analysis_hash = encode(
  extensions.digest(convert_to(analysis::TEXT, 'UTF8'), 'sha256'),
  'hex'
)
WHERE analysis_hash IS NULL;

ALTER TABLE competitor_intelligence_runs
  ALTER COLUMN analysis_hash SET NOT NULL;
ALTER TABLE competitor_intelligence_runs
  DROP CONSTRAINT IF EXISTS competitor_intelligence_runs_analysis_hash_check;
ALTER TABLE competitor_intelligence_runs
  ADD CONSTRAINT competitor_intelligence_runs_analysis_hash_check
  CHECK (analysis_hash ~ '^[0-9a-f]{64}$');

REVOKE ALL ON FUNCTION set_competitor_intelligence_analysis_hash()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION set_competitor_intelligence_analysis_hash()
  TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('127_competitor_strategic_market_model.sql')
ON CONFLICT DO NOTHING;
