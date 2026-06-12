-- ============================================================
-- 060_leads.sql – Sales lead management (RapidTal internal, admin-only)
-- Run via scripts/apply-migrations.mjs (or SQL editor) after 059.
--
-- A standalone sales CRM for the RapidTal team: a pipeline of leads with deal
-- value, owner, next action, and an activity timeline. Completely separate
-- from the client-facing crm_contacts. RLS: super_admin ONLY — clients and VAs
-- can never see or touch this data. Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS leads (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,                     -- deal / opportunity name
  company          TEXT,
  contact_name     TEXT,
  email            TEXT,
  phone            TEXT,
  source           TEXT,                              -- referral, inbound, outreach, …
  stage            TEXT NOT NULL DEFAULT 'new'
                     CHECK (stage IN ('new','contacted','qualified','proposal','won','lost')),
  value            NUMERIC(12,2),                     -- estimated deal value
  owner_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  next_action      TEXT,
  next_action_date DATE,
  notes            TEXT,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now(),
  archived_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS leads_stage_idx ON leads (stage, sort_order) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS leads_owner_idx ON leads (owner_id);
CREATE INDEX IF NOT EXISTS leads_next_action_idx ON leads (next_action_date) WHERE archived_at IS NULL;

-- Activity timeline: notes + logged calls/emails/meetings + automatic stage moves.
CREATE TABLE IF NOT EXISTS lead_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  kind       TEXT NOT NULL DEFAULT 'note'
               CHECK (kind IN ('note','call','email','meeting','stage')),
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_events_lead_idx ON lead_events (lead_id, created_at DESC);

ALTER TABLE leads       ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_events ENABLE ROW LEVEL SECURITY;

-- Super-admin only, full access. No policy grants anyone else anything.
DROP POLICY IF EXISTS "leads_super_admin" ON leads;
CREATE POLICY "leads_super_admin" ON leads FOR ALL
  USING (current_user_role() = 'super_admin')
  WITH CHECK (current_user_role() = 'super_admin');

DROP POLICY IF EXISTS "lead_events_super_admin" ON lead_events;
CREATE POLICY "lead_events_super_admin" ON lead_events FOR ALL
  USING (current_user_role() = 'super_admin')
  WITH CHECK (current_user_role() = 'super_admin');

INSERT INTO schema_migrations (version) VALUES ('060_leads.sql')
ON CONFLICT DO NOTHING;
