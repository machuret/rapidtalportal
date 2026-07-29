-- ============================================================
-- 094_structured_content_hard_rules.sql
--
-- Natural-language internal guidance remains useful prompt context, but it
-- cannot honestly be described as deterministically enforceable. Hard rules
-- are stored as validated structured records so generation and approval can
-- apply the same exact checks.
-- ============================================================

ALTER TABLE company_dna
  ADD COLUMN IF NOT EXISTS hard_rules JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'company_dna_hard_rules_array_check'
  ) THEN
    ALTER TABLE company_dna
      ADD CONSTRAINT company_dna_hard_rules_array_check
      CHECK (jsonb_typeof(hard_rules) = 'array');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION enforce_content_piece_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_dna company_dna%ROWTYPE;
  v_phrase TEXT;
  v_emoji_policy TEXT;
  v_rule JSONB;
  v_rule_type TEXT;
  v_rule_value TEXT;
  v_rule_limit INT;
  v_word_count INT;
  v_emoji_count INT;
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

    v_word_count := coalesce(array_length(regexp_split_to_array(btrim(NEW.body), E'\\s+'), 1), 0);
    v_emoji_count := regexp_count(NEW.body, '[😀-🙏🌀-🫿]');

    FOR v_rule IN
      SELECT value
      FROM jsonb_array_elements(coalesce(v_dna.hard_rules, '[]'::jsonb))
    LOOP
      IF jsonb_typeof(v_rule) <> 'object' THEN
        CONTINUE;
      END IF;
      IF jsonb_typeof(v_rule->'channels') = 'array'
         AND jsonb_array_length(v_rule->'channels') > 0
         AND NOT (v_rule->'channels' ? NEW.content_type) THEN
        CONTINUE;
      END IF;

      v_rule_type := v_rule->>'type';
      v_rule_value := btrim(coalesce(v_rule->>'value', ''));
      BEGIN
        v_rule_limit := (v_rule->>'limit')::INT;
      EXCEPTION WHEN invalid_text_representation THEN
        v_rule_limit := NULL;
      END;

      IF v_rule_type = 'prohibit_phrase'
         AND content_contains_phrase(NEW.body, v_rule_value) THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
          MESSAGE = format('Content violates hard rule: remove "%s".', v_rule_value);
      ELSIF v_rule_type = 'require_phrase'
         AND NOT content_contains_phrase(NEW.body, v_rule_value) THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
          MESSAGE = format('Content violates hard rule: include "%s".', v_rule_value);
      ELSIF v_rule_type = 'require_prefix'
         AND left(lower(btrim(NEW.body)), length(v_rule_value)) <> lower(v_rule_value) THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
          MESSAGE = format('Content violates hard rule: start with "%s".', v_rule_value);
      ELSIF v_rule_type = 'require_suffix'
         AND right(lower(btrim(NEW.body)), length(v_rule_value)) <> lower(v_rule_value) THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
          MESSAGE = format('Content violates hard rule: end with "%s".', v_rule_value);
      ELSIF v_rule_type = 'min_words'
         AND v_rule_limit IS NOT NULL
         AND v_word_count < v_rule_limit THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
          MESSAGE = format('Content violates hard rule: minimum %s words.', v_rule_limit);
      ELSIF v_rule_type = 'max_words'
         AND v_rule_limit IS NOT NULL
         AND v_word_count > v_rule_limit THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
          MESSAGE = format('Content violates hard rule: maximum %s words.', v_rule_limit);
      ELSIF v_rule_type = 'max_emojis'
         AND v_rule_limit IS NOT NULL
         AND v_emoji_count > v_rule_limit THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
          MESSAGE = format('Content violates hard rule: maximum %s emoji.', v_rule_limit);
      END IF;
    END LOOP;

    IF NEW.style_snapshot IS NULL OR NEW.style_snapshot = '{}'::jsonb THEN
      NEW.style_snapshot := jsonb_build_object(
        'channel', NEW.content_type,
        'summary', '[]'::jsonb,
        'hardRules', v_dna.hard_rules,
        'companyDnaUpdatedAt', v_dna.updated_at,
        'capturedAt', clock_timestamp()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION enforce_content_piece_approval() FROM PUBLIC, anon, authenticated;

INSERT INTO schema_migrations (version)
VALUES ('094_structured_content_hard_rules.sql')
ON CONFLICT DO NOTHING;
