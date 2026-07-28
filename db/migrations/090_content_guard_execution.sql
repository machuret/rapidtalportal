-- ============================================================
-- 090_content_guard_execution.sql – make the trigger self-contained
--
-- The trigger may run for authenticated RLS updates as well as service-role
-- updates. Run it as its owner so its private phrase helper does not need to be
-- exposed to API roles.
-- ============================================================

ALTER FUNCTION enforce_content_piece_approval() SECURITY DEFINER;
ALTER FUNCTION enforce_content_piece_approval() SET search_path = public;

REVOKE ALL ON FUNCTION enforce_content_piece_approval() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION content_contains_phrase(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION content_contains_phrase(TEXT, TEXT) TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('090_content_guard_execution.sql')
ON CONFLICT DO NOTHING;
