-- ============================================================
-- 107_content_voice_calibration.sql
-- Evaluation-only client goldens and blind voice comparisons.
-- Goldens are deliberately separate from vault_items: they can evaluate
-- writing style but can never substantiate a company claim.
-- ============================================================

CREATE TABLE IF NOT EXISTS content_golden_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (
    channel IN ('linkedin', 'facebook', 'instagram', 'x', 'email', 'blog', 'newsletter')
  ),
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 300),
  body TEXT NOT NULL CHECK (length(btrim(body)) BETWEEN 40 AND 50000),
  source_url TEXT,
  published_at TIMESTAMPTZ,
  content_type TEXT NOT NULL CHECK (length(btrim(content_type)) BETWEEN 1 AND 120),
  represents_brand_strongly BOOLEAN NOT NULL DEFAULT true,
  voice_traits TEXT[] NOT NULL DEFAULT '{}'::text[] CHECK (cardinality(voice_traits) <= 20),
  structural_traits TEXT[] NOT NULL DEFAULT '{}'::text[] CHECK (cardinality(structural_traits) <= 20),
  vocabulary_preferences TEXT[] NOT NULL DEFAULT '{}'::text[] CHECK (cardinality(vocabulary_preferences) <= 30),
  admin_notes TEXT CHECK (length(admin_notes) <= 4000),
  evaluation_permission BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'archived')),
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, channel, content_hash)
);

CREATE INDEX IF NOT EXISTS content_golden_examples_lookup
  ON content_golden_examples (client_id, channel, status, published_at DESC NULLS LAST, created_at DESC);

ALTER TABLE content_golden_examples ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE content_golden_examples FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE content_golden_examples TO service_role;

CREATE TABLE IF NOT EXISTS content_voice_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (
    channel IN ('linkedin', 'facebook', 'instagram', 'x', 'email', 'blog', 'newsletter')
  ),
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('running', 'ready', 'reviewed', 'failed')),
  brief JSONB NOT NULL CHECK (jsonb_typeof(brief) = 'object'),
  golden_example_ids UUID[] NOT NULL DEFAULT '{}'::uuid[] CHECK (cardinality(golden_example_ids) <= 30),
  style_analysis_id UUID REFERENCES content_style_analyses(id) ON DELETE SET NULL,
  variant_a TEXT,
  variant_b TEXT,
  -- Hidden assignment is never returned by the GET route before review.
  assignment JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(assignment) = 'object'),
  automated_evaluation JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(automated_evaluation) = 'object'),
  preferred_variant TEXT CHECK (preferred_variant IN ('a', 'b', 'tie')),
  reviewer_notes TEXT CHECK (length(reviewer_notes) <= 4000),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  model TEXT,
  error TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_voice_evaluations_lookup
  ON content_voice_evaluations (client_id, channel, created_at DESC);

ALTER TABLE content_voice_evaluations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE content_voice_evaluations FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE content_voice_evaluations TO service_role;

CREATE OR REPLACE FUNCTION review_content_voice_evaluation(
  p_client_id UUID,
  p_evaluation_id UUID,
  p_actor_id UUID,
  p_preferred_variant TEXT,
  p_reviewer_notes TEXT
)
RETURNS content_voice_evaluations
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_evaluation content_voice_evaluations;
  v_actor_role TEXT;
  v_actor_client_id UUID;
BEGIN
  SELECT role::TEXT, client_id
    INTO v_actor_role, v_actor_client_id
  FROM users
  WHERE id = p_actor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Reviewer not found.';
  END IF;
  IF v_actor_role NOT IN ('client_admin', 'super_admin') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only client administrators can review voice evaluations.';
  END IF;
  IF v_actor_role <> 'super_admin' AND v_actor_client_id IS DISTINCT FROM p_client_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Forbidden.';
  END IF;
  IF p_preferred_variant NOT IN ('a', 'b', 'tie') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid review preference.';
  END IF;

  UPDATE content_voice_evaluations
  SET
    status = 'reviewed',
    preferred_variant = p_preferred_variant,
    reviewer_notes = nullif(btrim(p_reviewer_notes), ''),
    reviewed_by = p_actor_id,
    reviewed_at = clock_timestamp(),
    updated_at = clock_timestamp()
  WHERE id = p_evaluation_id
    AND client_id = p_client_id
    AND status = 'ready'
  RETURNING * INTO v_evaluation;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Voice evaluation not found or already reviewed.';
  END IF;

  RETURN v_evaluation;
END;
$$;

REVOKE ALL ON FUNCTION review_content_voice_evaluation(UUID, UUID, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION review_content_voice_evaluation(UUID, UUID, UUID, TEXT, TEXT)
  TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('107_content_voice_calibration.sql')
ON CONFLICT DO NOTHING;
