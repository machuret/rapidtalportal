-- ============================================================
-- 051_my_job.sql – "My Job" section: contract, days, leave, issues, reports
-- Run in Supabase SQL Editor after 050_messages_hardening.sql
--
-- The VA-facing employment hub. Contract terms are set by admins and read by
-- the VA; days-worked / leave / issues / self-reports are authored by the VA.
-- All access goes through /api/my-job/* (withAuth + assertClientAccess), so
-- these tables are service-role only — RLS enabled with NO policies, exactly
-- like app_errors / tool_runs / ai_prompts. Idempotent.
-- ============================================================

-- One contract record per VA (the key-terms card + pay details + start date).
CREATE TABLE IF NOT EXISTS va_job_contracts (
  user_id          UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  client_id        UUID REFERENCES clients(id) ON DELETE SET NULL,
  rate             NUMERIC(12,2),
  currency         TEXT NOT NULL DEFAULT 'USD',
  pay_period       TEXT NOT NULL DEFAULT 'monthly',   -- hourly | daily | weekly | fortnightly | monthly
  payment_method   TEXT,                              -- e.g. Wise, PayPal, bank transfer
  payment_schedule TEXT,                              -- e.g. "1st of the month", "every second Friday"
  start_date       DATE,
  weekly_hours     NUMERIC(5,1),
  notice_period    TEXT,                              -- e.g. "30 days"
  next_review_date DATE,
  contract_path    TEXT,                              -- storage path of the signed PDF
  contract_name    TEXT,
  updated_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Days the VA worked (feeds the monthly summary + invoice).
CREATE TABLE IF NOT EXISTS va_days_worked (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id  UUID REFERENCES clients(id) ON DELETE SET NULL,
  work_date  DATE NOT NULL,
  hours      NUMERIC(5,1),
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, work_date)
);
CREATE INDEX IF NOT EXISTS va_days_worked_user_date_idx ON va_days_worked (user_id, work_date DESC);

-- Leave requests (pairs with the holiday calendars).
CREATE TABLE IF NOT EXISTS va_leave_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id   UUID REFERENCES clients(id) ON DELETE SET NULL,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  leave_type  TEXT NOT NULL DEFAULT 'annual',     -- annual | sick | unpaid | personal
  reason      TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',    -- pending | approved | declined
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS va_leave_user_idx ON va_leave_requests (user_id, start_date DESC);

-- "Raise an issue" → routes to RapidTal (super_admin) for mediation.
CREATE TABLE IF NOT EXISTS va_issues (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id  UUID REFERENCES clients(id) ON DELETE SET NULL,
  category   TEXT NOT NULL DEFAULT 'other',       -- pay | hours | workload | conduct | other
  subject    TEXT NOT NULL,
  detail     TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'open',        -- open | in_review | resolved
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS va_issues_user_idx ON va_issues (user_id, created_at DESC);

-- Monthly self-report ("what I delivered this month").
CREATE TABLE IF NOT EXISTS va_self_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id    UUID REFERENCES clients(id) ON DELETE SET NULL,
  report_month DATE NOT NULL,                     -- first day of the month
  delivered    TEXT,
  challenges   TEXT,
  goals        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, report_month)
);
CREATE INDEX IF NOT EXISTS va_self_reports_user_idx ON va_self_reports (user_id, report_month DESC);

ALTER TABLE va_job_contracts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE va_days_worked    ENABLE ROW LEVEL SECURITY;
ALTER TABLE va_leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE va_issues         ENABLE ROW LEVEL SECURITY;
ALTER TABLE va_self_reports   ENABLE ROW LEVEL SECURITY;

INSERT INTO schema_migrations (version) VALUES ('051_my_job.sql')
ON CONFLICT DO NOTHING;
