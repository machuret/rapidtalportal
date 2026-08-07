-- ============================================================
-- 20260806000300_mark_messages_read_rpc.sql
-- PERF (C1): replace the N+1 read-modify-write loop in
-- /api/messages/read (up to 200 sequential UPDATEs per page open) with one
-- set-based statement. array_append + the NOT (read_by @> ...) guard is exactly
-- equivalent to the old per-row "append my id if absent" loop, but runs as a
-- single round-trip. The p_audiences filter reproduces the role→audience
-- visibility (lib/messages/audience.ts) so a VA never marks admin-only messages.
--
-- Called only via the service-role admin client (the route already does
-- assertClientAccess before calling), so execution is locked to service_role.
-- Idempotent.
-- ============================================================

CREATE OR REPLACE FUNCTION mark_messages_read(p_client uuid, p_user uuid, p_audiences text[])
RETURNS integer
LANGUAGE sql
AS $$
  WITH upd AS (
    UPDATE messages
       SET read_by = array_append(coalesce(read_by, '{}'::uuid[]), p_user)
     WHERE client_id = p_client
       AND sender_id <> p_user
       AND NOT (read_by @> ARRAY[p_user])
       AND (p_audiences IS NULL OR audience = ANY(p_audiences))
    RETURNING 1
  )
  SELECT count(*)::int FROM upd;
$$;

REVOKE ALL ON FUNCTION mark_messages_read(uuid, uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mark_messages_read(uuid, uuid, text[]) TO service_role;

INSERT INTO schema_migrations (version) VALUES ('20260806000300_mark_messages_read_rpc.sql')
ON CONFLICT DO NOTHING;
