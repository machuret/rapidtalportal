-- ============================================================
-- 20260806000400_mark_messages_read_search_path.sql
-- Forward fix for 20260806000300: mark_messages_read was created without an
-- explicit search_path, which surfaced as `relation "messages" does not exist`
-- when applied from a session whose search_path didn't include public, and
-- leaves table resolution dependent on the caller's search_path at runtime.
-- Redefine it with SET search_path = public (matching every other function in
-- this repo — current_user_role, the users guard trigger, etc.) so resolution
-- is deterministic. CREATE OR REPLACE, so this is a safe idempotent re-definition.
-- ============================================================

CREATE OR REPLACE FUNCTION mark_messages_read(p_client uuid, p_user uuid, p_audiences text[])
RETURNS integer
LANGUAGE sql
SET search_path = public
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

INSERT INTO schema_migrations (version) VALUES ('20260806000400_mark_messages_read_search_path.sql')
ON CONFLICT DO NOTHING;
