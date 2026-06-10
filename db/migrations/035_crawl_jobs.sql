-- ============================================================
-- 035_crawl_jobs.sql – Full-site crawl jobs (enterprise site ingestion)
-- Run in Supabase SQL Editor after 034_schema_migrations.sql
--
-- One row per site crawl. Firecrawl runs the actual crawl on their
-- infrastructure; our app advances the job through phases with small,
-- idempotent "ticks" (crawling → ingesting → synthesizing → done). ALL
-- state lives here, so any tick can crash and the next one resumes —
-- closing the browser only pauses ingestion (Firecrawl keeps crawling),
-- and it resumes when anyone reopens the Vault.
-- Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS crawl_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  url             TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'crawling'
                    CHECK (status IN ('crawling','ingesting','synthesizing','done','error')),
  error           TEXT,
  firecrawl_id    TEXT,
  page_cap        INT  NOT NULL DEFAULT 50,
  pages_total     INT  NOT NULL DEFAULT 0,
  pages_done      INT  NOT NULL DEFAULT 0,
  items_created   INT  NOT NULL DEFAULT 0,
  products_seen   INT  NOT NULL DEFAULT 0,
  pages_dropped   INT  NOT NULL DEFAULT 0,
  tokens_used     INT  NOT NULL DEFAULT 0,
  dossier_item_id UUID,
  meta            JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crawl_jobs_client_idx ON crawl_jobs (client_id, created_at DESC);

ALTER TABLE crawl_jobs ENABLE ROW LEVEL SECURITY;

-- Everyone in the client can watch progress; writes go through the API
-- (service role), so no insert/update policies are granted.
DROP POLICY IF EXISTS "crawl_jobs_select" ON crawl_jobs;
CREATE POLICY "crawl_jobs_select"
  ON crawl_jobs FOR SELECT
  USING (current_user_role() = 'super_admin' OR client_id = current_user_client_id());

INSERT INTO schema_migrations (version) VALUES ('035_crawl_jobs.sql')
ON CONFLICT DO NOTHING;
