-- ============================================================
-- 078_va_leave_allowance.sql – Annual leave entitlement on the VA contract
-- Run in Supabase SQL Editor after 077_content_outcomes.sql
--
-- The leave tab can already show working-days taken; this gives it the other
-- half — an allowance — so it can show "remaining = allowance − taken".
--
--   annual_leave_days — the VA's annual paid-leave entitlement in working days.
--                       NULL means "not set"; the app falls back to a default
--                       (DEFAULT_ANNUAL_LEAVE_DAYS in lib/my-job/leave.ts) so a
--                       fresh contract still shows a sensible balance.
-- Idempotent.
-- ============================================================

ALTER TABLE va_job_contracts
  ADD COLUMN IF NOT EXISTS annual_leave_days INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'va_job_contracts_annual_leave_days_check') THEN
    ALTER TABLE va_job_contracts
      ADD CONSTRAINT va_job_contracts_annual_leave_days_check
      CHECK (annual_leave_days IS NULL OR (annual_leave_days >= 0 AND annual_leave_days <= 366));
  END IF;
END $$;

INSERT INTO schema_migrations (version) VALUES ('078_va_leave_allowance.sql')
ON CONFLICT DO NOTHING;
