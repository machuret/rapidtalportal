-- ============================================================
-- 028_global_sops.sql – Admin-owned generic SOP library, available to all VAs
-- Run in Supabase SQL Editor after 027_learning_loops.sql
--
-- SOPs were strictly per-client (client_id NOT NULL). Generic SOPs (WordPress,
-- Shopify, AI, email…) are authored by the admin and shared with every VA
-- regardless of client. Those live with client_id = NULL ("global library").
-- Idempotent.
-- ============================================================

ALTER TABLE sops ALTER COLUMN client_id DROP NOT NULL;

-- Any authenticated user may READ global SOPs (the shared library).
-- Writes to global SOPs are covered by the existing sops_super_admin_all policy.
DROP POLICY IF EXISTS "sops_global_select" ON sops;
CREATE POLICY "sops_global_select"
  ON sops FOR SELECT
  USING (client_id IS NULL);

CREATE INDEX IF NOT EXISTS sops_global_idx
  ON sops (category, order_index) WHERE client_id IS NULL;
