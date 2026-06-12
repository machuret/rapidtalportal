-- ============================================================
-- 061_expenses.sql – Business expense & subscription tracker (admin-only)
-- Run via scripts/apply-migrations.mjs (or SQL editor) after 060.
--
-- RapidTal's own costs: software, subscriptions, websites/domains, hosting,
-- contractors — recurring or one-off, in any currency. Super_admin ONLY (RLS).
-- Multi-currency by design: totals are summed PER currency (no FX in v1).
-- Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS expenses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,                 -- what it is ("Vercel Pro", "rapidtal.online domain")
  vendor        TEXT,                          -- provider
  category      TEXT NOT NULL DEFAULT 'software',
  amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency      TEXT NOT NULL DEFAULT 'USD',   -- ISO 4217 code
  cadence       TEXT NOT NULL DEFAULT 'monthly'
                  CHECK (cadence IN ('one_off','weekly','monthly','quarterly','yearly')),
  status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','cancelled')),
  next_due_date DATE,                          -- next renewal / payment (recurring)
  url           TEXT,                          -- website / login / billing URL
  started_on    DATE,
  owner_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  notes         TEXT,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  archived_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS expenses_active_idx ON expenses (status, cadence) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS expenses_due_idx ON expenses (next_due_date) WHERE archived_at IS NULL;

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "expenses_super_admin" ON expenses;
CREATE POLICY "expenses_super_admin" ON expenses FOR ALL
  USING (current_user_role() = 'super_admin')
  WITH CHECK (current_user_role() = 'super_admin');

INSERT INTO schema_migrations (version) VALUES ('061_expenses.sql')
ON CONFLICT DO NOTHING;
