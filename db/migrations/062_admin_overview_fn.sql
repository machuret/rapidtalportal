-- ============================================================
-- 062_admin_overview_fn.sql – push the admin overview aggregation into SQL
-- Run via scripts/apply-migrations.mjs (or SQL editor) after 061.
--
-- The /admin overview page used to SELECT every user, vault_item, task and
-- daily_log across all clients and aggregate in Node — unbounded as those
-- tables grow. This does the grouping in Postgres and returns one row per
-- active client. SECURITY DEFINER so the service-role page call reads all
-- tenants; super_admin is the only caller. Idempotent.
-- ============================================================

CREATE OR REPLACE FUNCTION admin_client_overview()
RETURNS TABLE (
  client_id          UUID,
  client_name        TEXT,
  client_created_at  TIMESTAMPTZ,
  user_count         INT,
  va_count           INT,
  vault_total        INT,
  vault_ready        INT,
  vault_error        INT,
  has_dossier        BOOLEAN,
  open_tasks         INT,
  done_recently      INT,
  vas_logged         INT,
  last_activity      TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    c.id, c.name, c.created_at,
    coalesce(u.user_count, 0)::int,
    coalesce(u.va_count, 0)::int,
    coalesce(v.total, 0)::int,
    coalesce(v.ready, 0)::int,
    coalesce(v.error, 0)::int,
    coalesce(v.has_dossier, false),
    coalesce(t.open_tasks, 0)::int,
    coalesce(t.done_recently, 0)::int,
    coalesce(dl.vas_logged, 0)::int,
    greatest(v.last_created, t.last_updated)
  FROM clients c
  LEFT JOIN (
    SELECT client_id,
      count(*)                              AS user_count,
      count(*) FILTER (WHERE role = 'va')   AS va_count
    FROM users GROUP BY client_id
  ) u ON u.client_id = c.id
  LEFT JOIN (
    SELECT client_id,
      count(*)                                  AS total,
      count(*) FILTER (WHERE status = 'ready')  AS ready,
      count(*) FILTER (WHERE status = 'error')  AS error,
      bool_or('dossier' = ANY(tags))            AS has_dossier,
      max(created_at)                           AS last_created
    FROM vault_items GROUP BY client_id
  ) v ON v.client_id = c.id
  LEFT JOIN (
    SELECT client_id,
      count(*) FILTER (WHERE status <> 'done')                                                   AS open_tasks,
      count(*) FILTER (WHERE status = 'done' AND updated_at >= now() - interval '7 days')         AS done_recently,
      max(updated_at)                                                                             AS last_updated
    FROM tasks GROUP BY client_id
  ) t ON t.client_id = c.id
  LEFT JOIN (
    SELECT client_id, count(DISTINCT user_id) AS vas_logged
    FROM daily_logs WHERE log_date >= current_date - 2 GROUP BY client_id
  ) dl ON dl.client_id = c.id
  WHERE c.archived_at IS NULL
  ORDER BY c.name;
$$;

GRANT EXECUTE ON FUNCTION admin_client_overview() TO authenticated, service_role;

INSERT INTO schema_migrations (version) VALUES ('062_admin_overview_fn.sql')
ON CONFLICT DO NOTHING;
