-- ============================================================
-- 147_va_pay_single_source_of_truth.sql
--
-- Make va_job_contracts the single source of truth for VA compensation.
--
-- VA pay used to live in two places that could disagree: the legacy
-- users.salary / payment_terms / payment_details columns (migration 012,
-- edited by the old VaProfileEditor "Compensation" section) and the
-- canonical va_job_contracts.rate / currency / pay_period /
-- payment_method / payment_schedule (edited by VaContractEditor via
-- /api/my-job/contract). The team detail page rendered both with no
-- authority marker.
--
-- From this migration on, va_job_contracts is authoritative:
--   * users.salary / payment_terms / payment_details are DEPRECATED.
--     The columns are KEPT (a destructive drop is out of scope) but are
--     written nowhere in app code after this change; the UI only reads
--     them as a clearly marked "(legacy)" fallback when a VA has no
--     contract row at all.
--   * Backfill: for every user holding legacy pay data but NO contract
--     row, insert one va_job_contracts row:
--       salary        -> rate        (the legacy field was labelled USD,
--                                      a monthly figure, so currency
--                                      'USD' and pay_period 'monthly' —
--                                      the table defaults)
--       payment_terms -> payment_method ONLY when the trimmed text is
--                        exactly 'bank' / 'wise' / 'paypal'
--                        (case-insensitive); otherwise NULL. We do not
--                        guess methods out of free text.
--     payment_details (free-text bank/account notes) has no contract
--     equivalent and is intentionally not copied; the deprecated column
--     retains it.
--   * Existing contract rows are never touched: the NOT EXISTS guard
--     plus ON CONFLICT (user_id) DO NOTHING make this idempotent and
--     safe to re-run.
-- ============================================================

INSERT INTO va_job_contracts (user_id, client_id, rate, currency, pay_period, payment_method)
SELECT
  u.id,
  u.client_id,
  u.salary,
  'USD',
  'monthly',
  CASE lower(btrim(u.payment_terms))
    WHEN 'bank'   THEN 'bank'
    WHEN 'wise'   THEN 'wise'
    WHEN 'paypal' THEN 'paypal'
    ELSE NULL
  END
FROM users u
WHERE (u.salary IS NOT NULL OR u.payment_terms IS NOT NULL OR u.payment_details IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM va_job_contracts c WHERE c.user_id = u.id
  )
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO schema_migrations (version)
VALUES ('147_va_pay_single_source_of_truth.sql')
ON CONFLICT DO NOTHING;
