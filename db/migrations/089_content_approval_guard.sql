-- ============================================================
-- 089_content_approval_guard.sql – database-level content invariant
--
-- The atomic RPC is the preferred update path. This trigger is the final guard:
-- even an older deployment or future service-role route cannot edit approved
-- content or approve a body containing deterministically prohibited DNA content.
-- ============================================================

CREATE OR REPLACE FUNCTION content_contains_phrase(p_body TEXT, p_phrase TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_body TEXT := lower(coalesce(p_body, ''));
  v_phrase TEXT := lower(btrim(coalesce(p_phrase, '')));
  v_offset INT := 1;
  v_relative_hit INT;
  v_hit INT;
  v_before TEXT;
  v_after TEXT;
BEGIN
  IF length(v_phrase) < 2 THEN
    RETURN FALSE;
  END IF;

  LOOP
    v_relative_hit := strpos(substr(v_body, v_offset), v_phrase);
    IF v_relative_hit = 0 THEN
      RETURN FALSE;
    END IF;

    v_hit := v_offset + v_relative_hit - 1;
    v_before := CASE WHEN v_hit <= 1 THEN '' ELSE substr(v_body, v_hit - 1, 1) END;
    v_after := substr(v_body, v_hit + length(v_phrase), 1);

    IF (v_before = '' OR v_before !~ '[[:alnum:]]')
       AND (v_after = '' OR v_after !~ '[[:alnum:]]') THEN
      RETURN TRUE;
    END IF;

    v_offset := v_hit + 1;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_content_piece_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_dna company_dna%ROWTYPE;
  v_phrase TEXT;
  v_emoji_policy TEXT;
BEGIN
  IF OLD.status <> 'draft'
     AND (NEW.title IS DISTINCT FROM OLD.title OR NEW.body IS DISTINCT FROM OLD.body)
     AND NEW.status <> 'draft' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Only draft content can be edited.';
  END IF;

  IF NEW.status = 'approved'
     AND (
       OLD.status IS DISTINCT FROM 'approved'
       OR NEW.body IS DISTINCT FROM OLD.body
       OR NEW.title IS DISTINCT FROM OLD.title
     ) THEN
    IF NEW.body IS NULL OR length(btrim(NEW.body)) = 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A content body is required before approval.';
    END IF;

    SELECT *
      INTO v_dna
    FROM company_dna
    WHERE client_id = NEW.client_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Complete Company DNA before approving content.';
    END IF;

    FOR v_phrase IN
      SELECT btrim(value)
      FROM regexp_split_to_table(coalesce(v_dna.prohibited_terms, ''), E'[\\n,;]+') AS value
      WHERE length(btrim(value)) >= 2
      UNION
      SELECT btrim(value)
      FROM regexp_split_to_table(coalesce(v_dna.prohibited_claims, ''), E'[\\n;]+') AS value
      WHERE length(btrim(value)) >= 2
    LOOP
      IF content_contains_phrase(NEW.body, v_phrase) THEN
        RAISE EXCEPTION USING
          ERRCODE = '22023',
          MESSAGE = format('Content violates Company DNA: prohibited phrase "%s".', v_phrase);
      END IF;
    END LOOP;

    v_emoji_policy := lower(btrim(coalesce(v_dna.emoji_policy, '')));
    IF (
      v_emoji_policy = 'none'
      OR v_emoji_policy ~ '\m(no|zero)[[:space:]]+emojis?\M'
      OR v_emoji_policy ~ '\m(without|avoid)[[:space:]]+(using[[:space:]]+)?emojis?\M'
      OR v_emoji_policy ~ '\m(never|do not|don''t)[[:space:]]+use[[:space:]]+emojis?\M'
    ) AND NEW.body ~ '[😀-🙏🌀-🫿]' THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'Content violates Company DNA: emoji are not allowed.';
    END IF;

    -- Compatibility for an older web deployment that does not yet send the full
    -- snapshot. The current atomic RPC supplies the complete human-readable list.
    IF NEW.style_snapshot IS NULL OR NEW.style_snapshot = '{}'::jsonb THEN
      NEW.style_snapshot := jsonb_build_object(
        'channel', NEW.content_type,
        'summary', '[]'::jsonb,
        'companyDnaUpdatedAt', v_dna.updated_at,
        'capturedAt', clock_timestamp()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS content_pieces_approval_guard ON content_pieces;
CREATE TRIGGER content_pieces_approval_guard
BEFORE UPDATE ON content_pieces
FOR EACH ROW
EXECUTE FUNCTION enforce_content_piece_approval();

REVOKE ALL ON FUNCTION content_contains_phrase(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION enforce_content_piece_approval() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION content_contains_phrase(TEXT, TEXT) TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('089_content_approval_guard.sql')
ON CONFLICT DO NOTHING;
