-- ============================================================
-- 148_coach_tool_call_log.sql
--
-- The bounded tool-use loop in vault-ask records every read-only tool call
-- (tool, args, row counts, timing) into the context snapshot that produced
-- the answer — the provenance contract ("you can prove what the answer was
-- based on") extended to tool calls. The log lands in a top-level `meta`
-- envelope sibling of the validated brain-context-v1 payload (the table's
-- CHECKs only pin version/clientId/request; readers strip unknown keys), so
-- the immutable-payload invariant is untouched.
--
-- Snapshots are INSERT-only by design (migration 120). This grants the
-- narrowest write the tool-log persister needs: UPDATE of the snapshot
-- column, service_role only. No other column becomes writable, and no other
-- role gets anything.
-- ============================================================

GRANT UPDATE (snapshot) ON brain_context_snapshots TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('148_coach_tool_call_log.sql')
ON CONFLICT DO NOTHING;
