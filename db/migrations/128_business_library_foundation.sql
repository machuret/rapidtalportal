-- ============================================================
-- 128_business_library_foundation.sql
-- Phase 2: admin-curated, versioned expert knowledge.
--
-- The Business Library is deliberately separate from tenant Vault knowledge.
-- It contains platform-wide guidance, never customer facts. Published releases
-- are immutable, fully auditable and pre-chunked for the official Brain
-- resolver that consumes them through immutable Brain Context snapshots.
-- ============================================================

CREATE TABLE IF NOT EXISTS business_library_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE
    CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name TEXT NOT NULL UNIQUE
    CHECK (length(btrim(name)) BETWEEN 2 AND 100),
  description TEXT
    CHECK (description IS NULL OR length(description) <= 1000),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS business_library_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE
    CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  current_version_id UUID,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  retired_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS business_library_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES business_library_entries(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','in_review','published','superseded','retired')),
  category_id UUID NOT NULL REFERENCES business_library_categories(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 300),
  summary TEXT NOT NULL CHECK (length(btrim(summary)) BETWEEN 10 AND 2000),
  body TEXT NOT NULL CHECK (length(btrim(body)) BETWEEN 50 AND 100000),
  source_url TEXT CHECK (source_url IS NULL OR length(source_url) <= 2000),
  tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[]
    CHECK (cardinality(tags) <= 30),
  industries TEXT[] NOT NULL DEFAULT '{}'::TEXT[]
    CHECK (cardinality(industries) <= 30),
  countries TEXT[] NOT NULL DEFAULT '{}'::TEXT[]
    CHECK (cardinality(countries) <= 30),
  audiences TEXT[] NOT NULL DEFAULT '{}'::TEXT[]
    CHECK (cardinality(audiences) <= 30),
  lifecycle_stages TEXT[] NOT NULL DEFAULT '{}'::TEXT[]
    CHECK (cardinality(lifecycle_stages) <= 20),
  channels TEXT[] NOT NULL DEFAULT '{}'::TEXT[]
    CHECK (cardinality(channels) <= 20),
  time_sensitive BOOLEAN NOT NULL DEFAULT false,
  valid_from DATE,
  valid_until DATE,
  review_due_at TIMESTAMPTZ,
  change_note TEXT CHECK (change_note IS NULL OR length(change_note) <= 2000),
  content_hash TEXT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (entry_id, version_number),
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from),
  CHECK (
    status NOT IN ('published','superseded','retired')
    OR (approved_at IS NOT NULL AND published_at IS NOT NULL)
  )
);

ALTER TABLE business_library_entries
  DROP CONSTRAINT IF EXISTS business_library_entries_current_version_fk;
ALTER TABLE business_library_entries
  ADD CONSTRAINT business_library_entries_current_version_fk
  FOREIGN KEY (current_version_id)
  REFERENCES business_library_versions(id)
  ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE IF NOT EXISTS business_library_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES business_library_entries(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES business_library_versions(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  content TEXT NOT NULL CHECK (length(btrim(content)) > 0),
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(content, ''))
  ) STORED,
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (version_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS business_library_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES business_library_entries(id) ON DELETE CASCADE,
  version_id UUID REFERENCES business_library_versions(id) ON DELETE SET NULL,
  action TEXT NOT NULL
    CHECK (action IN (
      'created','draft_saved','submitted_for_review','returned_to_draft',
      'published','new_version_created','retired'
    )),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  detail JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS business_library_versions_workflow_idx
  ON business_library_versions (status, review_due_at, updated_at DESC);
CREATE INDEX IF NOT EXISTS business_library_versions_entry_idx
  ON business_library_versions (entry_id, version_number DESC);
CREATE INDEX IF NOT EXISTS business_library_versions_category_idx
  ON business_library_versions (category_id, status, published_at DESC);
CREATE INDEX IF NOT EXISTS business_library_chunks_version_idx
  ON business_library_chunks (version_id, chunk_index);
CREATE INDEX IF NOT EXISTS business_library_chunks_fts_idx
  ON business_library_chunks USING gin (search_vector);
CREATE INDEX IF NOT EXISTS business_library_chunks_embedding_idx
  ON business_library_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS business_library_events_entry_idx
  ON business_library_events (entry_id, created_at DESC);

CREATE OR REPLACE FUNCTION set_business_library_content_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.content_hash := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'category_id', NEW.category_id,
          'title', btrim(NEW.title),
          'summary', btrim(NEW.summary),
          'body', btrim(NEW.body),
          'source_url', NEW.source_url,
          'tags', NEW.tags,
          'industries', NEW.industries,
          'countries', NEW.countries,
          'audiences', NEW.audiences,
          'lifecycle_stages', NEW.lifecycle_stages,
          'channels', NEW.channels,
          'time_sensitive', NEW.time_sensitive,
          'valid_from', NEW.valid_from,
          'valid_until', NEW.valid_until,
          'review_due_at', NEW.review_due_at
        )::TEXT,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS business_library_content_hash_before_write
  ON business_library_versions;
CREATE TRIGGER business_library_content_hash_before_write
BEFORE INSERT OR UPDATE OF
  category_id, title, summary, body, source_url, tags, industries, countries,
  audiences, lifecycle_stages, channels, time_sensitive, valid_from,
  valid_until, review_due_at
ON business_library_versions
FOR EACH ROW
EXECUTE FUNCTION set_business_library_content_hash();

CREATE OR REPLACE FUNCTION protect_business_library_release()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status IN ('published','superseded','retired') THEN
    RAISE EXCEPTION 'Published Business Library versions are immutable';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'published' THEN
    IF NEW.status NOT IN ('superseded','retired')
       OR (to_jsonb(NEW) - 'status' - 'updated_at')
          IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'updated_at') THEN
      RAISE EXCEPTION 'Published Business Library versions are immutable';
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.status IN ('superseded','retired') THEN
    RAISE EXCEPTION 'Historical Business Library versions are immutable';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS business_library_release_protection
  ON business_library_versions;
CREATE TRIGGER business_library_release_protection
BEFORE UPDATE OR DELETE ON business_library_versions
FOR EACH ROW
EXECUTE FUNCTION protect_business_library_release();

CREATE OR REPLACE FUNCTION transition_business_library_version(
  p_entry_id UUID,
  p_version_id UUID,
  p_action TEXT,
  p_actor_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry business_library_entries%ROWTYPE;
  v_version business_library_versions%ROWTYPE;
  v_existing UUID;
  v_new_version_id UUID;
  v_next_version INTEGER;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  SELECT * INTO v_entry
  FROM business_library_entries
  WHERE id = p_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Business Library entry not found';
  END IF;

  IF p_action = 'new_version' THEN
    SELECT id INTO v_existing
    FROM business_library_versions
    WHERE entry_id = p_entry_id
      AND status IN ('draft','in_review')
    ORDER BY version_number DESC
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;

    SELECT * INTO v_version
    FROM business_library_versions
    WHERE id = coalesce(
      v_entry.current_version_id,
      (
        SELECT id
        FROM business_library_versions
        WHERE entry_id = p_entry_id
        ORDER BY version_number DESC
        LIMIT 1
      )
    );

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No Business Library version is available to revise';
    END IF;

    SELECT coalesce(max(version_number), 0) + 1
    INTO v_next_version
    FROM business_library_versions
    WHERE entry_id = p_entry_id;

    INSERT INTO business_library_versions (
      entry_id, version_number, status, category_id, title, summary, body,
      source_url, tags, industries, countries, audiences, lifecycle_stages,
      channels, time_sensitive, valid_from, valid_until, review_due_at,
      change_note, content_hash, created_by
    ) VALUES (
      p_entry_id, v_next_version, 'draft', v_version.category_id,
      v_version.title, v_version.summary, v_version.body, v_version.source_url,
      v_version.tags, v_version.industries, v_version.countries,
      v_version.audiences, v_version.lifecycle_stages, v_version.channels,
      v_version.time_sensitive, v_version.valid_from, v_version.valid_until,
      v_version.review_due_at, NULL, v_version.content_hash, p_actor_id
    )
    RETURNING id INTO v_new_version_id;

    UPDATE business_library_entries
    SET updated_at = v_now
    WHERE id = p_entry_id;

    INSERT INTO business_library_events (
      entry_id, version_id, action, actor_id, detail
    ) VALUES (
      p_entry_id, v_new_version_id, 'new_version_created', p_actor_id,
      jsonb_build_object('based_on_version_id', v_version.id)
    );

    RETURN v_new_version_id;
  END IF;

  SELECT * INTO v_version
  FROM business_library_versions
  WHERE id = p_version_id
    AND entry_id = p_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Business Library version not found';
  END IF;

  IF p_action = 'submit_review' THEN
    IF v_version.status <> 'draft' THEN
      RAISE EXCEPTION 'Only a draft can be submitted for review';
    END IF;
    UPDATE business_library_versions
    SET status = 'in_review', submitted_at = v_now, updated_at = v_now
    WHERE id = p_version_id;
    INSERT INTO business_library_events (
      entry_id, version_id, action, actor_id
    ) VALUES (
      p_entry_id, p_version_id, 'submitted_for_review', p_actor_id
    );

  ELSIF p_action = 'return_draft' THEN
    IF v_version.status <> 'in_review' THEN
      RAISE EXCEPTION 'Only a review version can be returned to draft';
    END IF;
    UPDATE business_library_versions
    SET status = 'draft', submitted_at = NULL, updated_at = v_now
    WHERE id = p_version_id;
    INSERT INTO business_library_events (
      entry_id, version_id, action, actor_id
    ) VALUES (
      p_entry_id, p_version_id, 'returned_to_draft', p_actor_id
    );

  ELSIF p_action = 'publish' THEN
    IF v_version.status <> 'in_review' THEN
      RAISE EXCEPTION 'A version must be reviewed before publication';
    END IF;

    IF v_entry.current_version_id IS NOT NULL
       AND v_entry.current_version_id <> p_version_id THEN
      UPDATE business_library_versions
      SET status = 'superseded', updated_at = v_now
      WHERE id = v_entry.current_version_id
        AND status = 'published';
    END IF;

    UPDATE business_library_versions
    SET
      status = 'published',
      approved_by = p_actor_id,
      approved_at = v_now,
      published_at = v_now,
      updated_at = v_now
    WHERE id = p_version_id;

    UPDATE business_library_entries
    SET
      current_version_id = p_version_id,
      retired_at = NULL,
      updated_at = v_now
    WHERE id = p_entry_id;

    DELETE FROM business_library_chunks
    WHERE version_id = p_version_id;

    INSERT INTO business_library_chunks (
      entry_id, version_id, chunk_index, content
    )
    SELECT
      p_entry_id,
      p_version_id,
      row_number() OVER (ORDER BY chunk_start)::INTEGER - 1,
      CASE
        WHEN chunk_start = 1 THEN btrim(
          v_version.title
          || E'\n\n'
          || v_version.summary
          || E'\n\n'
          || substring(v_version.body FROM chunk_start FOR 3500)
        )
        ELSE btrim(substring(v_version.body FROM chunk_start FOR 3500))
      END
    FROM generate_series(
      1,
      greatest(length(v_version.body), 1),
      3000
    ) AS chunk_start
    WHERE length(btrim(substring(v_version.body FROM chunk_start FOR 3500))) > 0;

    INSERT INTO business_library_events (
      entry_id, version_id, action, actor_id,
      detail
    ) VALUES (
      p_entry_id, p_version_id, 'published', p_actor_id,
      jsonb_build_object('version_number', v_version.version_number)
    );

  ELSIF p_action = 'retire' THEN
    IF v_entry.current_version_id IS DISTINCT FROM p_version_id
       OR v_version.status <> 'published' THEN
      RAISE EXCEPTION 'Only the current published version can be retired';
    END IF;

    UPDATE business_library_versions
    SET status = 'retired', updated_at = v_now
    WHERE id = p_version_id;

    UPDATE business_library_entries
    SET retired_at = v_now, updated_at = v_now
    WHERE id = p_entry_id;

    INSERT INTO business_library_events (
      entry_id, version_id, action, actor_id
    ) VALUES (
      p_entry_id, p_version_id, 'retired', p_actor_id
    );
  ELSE
    RAISE EXCEPTION 'Unknown Business Library transition';
  END IF;

  UPDATE business_library_entries
  SET updated_at = v_now
  WHERE id = p_entry_id;

  RETURN p_version_id;
END;
$$;

ALTER TABLE business_library_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_library_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_library_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_library_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_library_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  business_library_categories,
  business_library_entries,
  business_library_versions,
  business_library_chunks,
  business_library_events
FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE
  business_library_categories,
  business_library_entries,
  business_library_versions,
  business_library_chunks,
  business_library_events
TO service_role;

REVOKE ALL ON FUNCTION
  set_business_library_content_hash(),
  protect_business_library_release(),
  transition_business_library_version(UUID, UUID, TEXT, UUID)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION transition_business_library_version(UUID, UUID, TEXT, UUID)
TO service_role;

INSERT INTO business_library_categories (
  slug, name, description, sort_order
) VALUES
  ('seo', 'SEO', 'Search visibility, technical foundations and content discoverability.', 10),
  ('meta-ads', 'Meta Ads', 'Facebook and Instagram advertising strategy and operations.', 20),
  ('google-ads', 'Google Ads', 'Paid search, display and performance campaign guidance.', 30),
  ('email-marketing', 'Email Marketing', 'Lifecycle, nurture, campaign and deliverability guidance.', 40),
  ('social-media', 'Social Media', 'Organic channel strategy, publishing and community practices.', 50),
  ('sales', 'Sales', 'Pipeline, qualification, proposals and conversion practices.', 60),
  ('crm', 'CRM', 'Customer data, pipeline hygiene and relationship management.', 70),
  ('customer-retention', 'Customer Retention', 'Onboarding, service, loyalty and churn reduction.', 80),
  ('operations', 'Operations', 'Processes, measurement and repeatable business execution.', 90),
  ('people', 'People and Hiring', 'Hiring, onboarding, management and team development.', 100),
  ('finance', 'Finance Fundamentals', 'Commercial fundamentals, cash flow and business metrics.', 110),
  ('compliance', 'Compliance', 'General operational compliance and risk-awareness guidance.', 120)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO schema_migrations (version)
VALUES ('128_business_library_foundation.sql')
ON CONFLICT DO NOTHING;
