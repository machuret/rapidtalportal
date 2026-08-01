-- ============================================================
-- 145_vault_chunks_uniqueness.sql
--
-- vault_chunks had no uniqueness on (item_id, chunk_index): concurrent
-- index runs (cron sweep overlapping a waitUntil trigger or a manual
-- reprocess) inserted the same chunk twice, duplicating RAG context —
-- and the overflow self-heal (delete-all-and-restart) turned that into
-- periodic full re-embeds. The resume logic is select-then-insert, so a
-- uniqueness backstop is the only race-safe guarantee.
--
-- Deletes existing duplicates first (8 pairs at time of writing, keeping
-- the most recently written row per pair), then adds the index.
-- ============================================================

DELETE FROM vault_chunks a
USING vault_chunks b
WHERE a.item_id = b.item_id
  AND a.chunk_index = b.chunk_index
  AND a.id < b.id;

CREATE UNIQUE INDEX IF NOT EXISTS vault_chunks_item_chunk_uidx
  ON vault_chunks (item_id, chunk_index);

INSERT INTO schema_migrations (version)
VALUES ('145_vault_chunks_uniqueness.sql')
ON CONFLICT DO NOTHING;
