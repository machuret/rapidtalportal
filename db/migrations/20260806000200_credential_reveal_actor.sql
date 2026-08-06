-- ============================================================
-- 20260806000200_credential_reveal_actor.sql
-- P2: attribute credential reveals to the REAL actor during impersonation.
--
-- access_credential_reveals.user_id holds the EFFECTIVE user, which during a
-- super_admin "view as" session is the impersonated target — not the admin who
-- actually revealed the stored password. Add a nullable acting_user_id that the
-- reveal route stamps with the real admin (actualUser) whenever impersonation is
-- active, so the supervision trail can show "revealed by <target>, acting as
-- <admin>". NULL means the reveal was performed directly (no impersonation).
--
-- Idempotent.
-- ============================================================

ALTER TABLE access_credential_reveals
  ADD COLUMN IF NOT EXISTS acting_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

INSERT INTO schema_migrations (version) VALUES ('20260806000200_credential_reveal_actor.sql')
ON CONFLICT DO NOTHING;
