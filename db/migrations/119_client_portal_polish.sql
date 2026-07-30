-- ============================================================
-- 119_client_portal_polish.sql
-- Clean up unfinished Notebook template labels already seeded in production.
-- ============================================================

-- Old processing rows cannot recover on their own. Convert them into an
-- explicit retryable state without removing their saved source material.
UPDATE vault_items
SET
  status = 'error',
  error_message = COALESCE(
    NULLIF(error_message, ''),
    'Preparation timed out. Retry this source.'
  ),
  updated_at = clock_timestamp()
WHERE status IN ('pending', 'processing')
  AND COALESCE(updated_at, created_at) < clock_timestamp() - INTERVAL '20 minutes';

UPDATE notebook_pages
SET
  title = 'Meeting notes template',
  content = REPLACE(
    REPLACE(
      REPLACE(
        REPLACE(content::text, '"Meeting — YYYY-MM-DD"', '"Meeting notes"'),
        '"Meeting — add date"',
        '"Meeting notes"'
      ),
      '"…"',
      '"Add details"'
    ),
    '"Action — owner — due date"',
    '"Add an action, owner and due date"'
  )::jsonb,
  updated_at = clock_timestamp()
WHERE title = 'Meeting — <date>';

UPDATE notebook_pages
SET
  title = 'New page',
  updated_at = clock_timestamp()
WHERE title = 'Untitled';

INSERT INTO schema_migrations (version)
VALUES ('119_client_portal_polish.sql')
ON CONFLICT DO NOTHING;
