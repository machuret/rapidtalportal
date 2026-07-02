-- Make leave-request overlap rejection a DB invariant, not just a code check.
--
-- /api/my-job/leave POST guards against overlapping requests with a SELECT
-- followed by an INSERT — two concurrent submissions (double-click, retry) can
-- BOTH pass the SELECT before either inserts, double-booking the same days and
-- double-counting the balance. An exclusion constraint closes the race in the
-- database itself: same user, overlapping [start_date, end_date] ranges, while
-- either row is pending/approved → the second insert fails with 23P01, which
-- the route maps to the same friendly 409 the code check produces.
--
-- btree_gist lets a GiST index mix the scalar user_id equality with the range
-- overlap operator. Declined requests are excluded, so re-requesting dates that
-- were previously declined still works.
--
-- NOTE: if legacy overlapping pending/approved rows already exist, this
-- migration fails (constraint can't be created). Find them with:
--   SELECT a.id, b.id FROM va_leave_requests a
--   JOIN va_leave_requests b ON a.user_id = b.user_id AND a.id < b.id
--     AND a.status IN ('pending','approved') AND b.status IN ('pending','approved')
--     AND daterange(a.start_date, a.end_date, '[]') && daterange(b.start_date, b.end_date, '[]');
-- decline/delete the duplicates, then re-run pnpm db:apply.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE va_leave_requests
  ADD CONSTRAINT va_leave_no_overlap
  EXCLUDE USING gist (
    user_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  )
  WHERE (status IN ('pending', 'approved'));

INSERT INTO schema_migrations (version) VALUES ('083_leave_overlap_constraint.sql')
ON CONFLICT DO NOTHING;
