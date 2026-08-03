-- Actionable, idempotent VA placement requests from client onboarding.

CREATE TABLE IF NOT EXISTS client_va_assignment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'assigned', 'cancelled')),
  note TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS client_va_assignment_requests_one_pending
  ON client_va_assignment_requests (client_id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS client_va_assignment_requests_queue
  ON client_va_assignment_requests (status, requested_at);

ALTER TABLE client_va_assignment_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_va_assignment_requests_select ON client_va_assignment_requests;
CREATE POLICY client_va_assignment_requests_select ON client_va_assignment_requests
  FOR SELECT USING (
    client_id = current_user_client_id()
    OR current_user_role() = 'super_admin'
  );

REVOKE ALL ON TABLE client_va_assignment_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE client_va_assignment_requests TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE client_va_assignment_requests TO service_role;

CREATE OR REPLACE FUNCTION request_client_va_assignment(
  p_client_id UUID,
  p_requested_by UUID
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM users
    WHERE id = p_requested_by
      AND client_id = p_client_id
      AND role = 'client_admin'
  ) THEN
    RAISE EXCEPTION 'assignment_request_forbidden' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM users
    WHERE client_id = p_client_id AND role = 'va'
  ) THEN
    RAISE EXCEPTION 'va_already_assigned' USING ERRCODE = '23505';
  END IF;

  INSERT INTO client_va_assignment_requests (client_id, requested_by)
  VALUES (p_client_id, p_requested_by)
  ON CONFLICT (client_id) WHERE status = 'pending'
  DO UPDATE SET updated_at = clock_timestamp()
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION request_client_va_assignment(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION request_client_va_assignment(UUID, UUID)
  TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('20260803000900_client_va_assignment_requests.sql')
ON CONFLICT (version) DO NOTHING;
