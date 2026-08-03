-- Atomic provider-job startup plus tenant-safe collaboration ownership and
-- activity history for client/VA lead workflows.

ALTER TABLE prospecting_campaigns ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE prospecting_campaign_leads ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id) ON DELETE SET NULL;

UPDATE prospecting_campaigns campaign SET owner_id = campaign.created_by
WHERE campaign.owner_id IS NULL
  AND EXISTS (
    SELECT 1 FROM users person
    WHERE person.id = campaign.created_by AND person.client_id = campaign.client_id
  );

CREATE INDEX IF NOT EXISTS prospecting_campaigns_owner_idx
  ON prospecting_campaigns (client_id, owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS prospecting_campaign_leads_assignee_idx
  ON prospecting_campaign_leads (client_id, assigned_to, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS prospecting_activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  campaign_id UUID,
  lead_id UUID,
  job_id UUID,
  event_type TEXT NOT NULL CHECK (char_length(event_type) BETWEEN 3 AND 80),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  subject_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (
    jsonb_typeof(detail) = 'object' AND octet_length(detail::TEXT) <= 10000
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, client_id),
  FOREIGN KEY (campaign_id, client_id) REFERENCES prospecting_campaigns(id, client_id) ON DELETE CASCADE,
  FOREIGN KEY (lead_id, client_id) REFERENCES prospecting_campaign_leads(id, client_id) ON DELETE CASCADE,
  FOREIGN KEY (job_id, client_id) REFERENCES prospecting_jobs(id, client_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS prospecting_activity_client_idx
  ON prospecting_activity_events (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS prospecting_activity_lead_idx
  ON prospecting_activity_events (client_id, lead_id, created_at DESC) WHERE lead_id IS NOT NULL;

ALTER TABLE prospecting_activity_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prospecting_activity_events_super_admin_all ON prospecting_activity_events;
CREATE POLICY prospecting_activity_events_super_admin_all ON prospecting_activity_events
FOR ALL USING (current_user_role() = 'super_admin') WITH CHECK (current_user_role() = 'super_admin');
DROP POLICY IF EXISTS prospecting_activity_events_tenant_select ON prospecting_activity_events;
CREATE POLICY prospecting_activity_events_tenant_select ON prospecting_activity_events
FOR SELECT USING (client_id = current_user_client_id());

CREATE OR REPLACE FUNCTION initialise_prospecting_campaign_owner()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.owner_id IS NULL AND EXISTS (
    SELECT 1 FROM users person WHERE person.id = NEW.created_by AND person.client_id = NEW.client_id
  ) THEN
    NEW.owner_id := NEW.created_by;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS prospecting_campaign_owner_default ON prospecting_campaigns;
CREATE TRIGGER prospecting_campaign_owner_default
BEFORE INSERT ON prospecting_campaigns FOR EACH ROW EXECUTE FUNCTION initialise_prospecting_campaign_owner();

CREATE OR REPLACE FUNCTION record_new_prospecting_campaign()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  INSERT INTO prospecting_activity_events (
    client_id, campaign_id, event_type, actor_id, subject_user_id, detail
  ) VALUES (
    NEW.client_id, NEW.id, 'campaign_created', NEW.created_by, NEW.owner_id,
    jsonb_build_object('name', NEW.name, 'source', NEW.source)
  );
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS prospecting_campaign_created_event ON prospecting_campaigns;
CREATE TRIGGER prospecting_campaign_created_event
AFTER INSERT ON prospecting_campaigns FOR EACH ROW EXECUTE FUNCTION record_new_prospecting_campaign();

-- The payload and hash are the immutable record of what was submitted to the
-- provider. Runtime status updates must never rewrite that evidence.
CREATE OR REPLACE FUNCTION protect_prospecting_job_input_snapshot()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.input_payload IS NOT NULL AND (
    NEW.input_payload IS DISTINCT FROM OLD.input_payload
    OR NEW.input_hash IS DISTINCT FROM OLD.input_hash
    OR NEW.actor_provider_id IS DISTINCT FROM OLD.actor_provider_id
    OR NEW.actor_build_requested IS DISTINCT FROM OLD.actor_build_requested
  ) THEN
    RAISE EXCEPTION 'Prospecting provider input snapshots are immutable.' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS prospecting_job_input_snapshot_immutable ON prospecting_jobs;
CREATE TRIGGER prospecting_job_input_snapshot_immutable
BEFORE UPDATE OF input_payload,input_hash,actor_provider_id,actor_build_requested ON prospecting_jobs
FOR EACH ROW EXECUTE FUNCTION protect_prospecting_job_input_snapshot();

CREATE OR REPLACE FUNCTION record_prospecting_activity(
  p_client_id UUID,
  p_actor_id UUID,
  p_event_type TEXT,
  p_campaign_id UUID DEFAULT NULL,
  p_lead_id UUID DEFAULT NULL,
  p_job_id UUID DEFAULT NULL,
  p_subject_user_id UUID DEFAULT NULL,
  p_detail JSONB DEFAULT '{}'::jsonb
) RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  IF char_length(trim(COALESCE(p_event_type,''))) NOT BETWEEN 3 AND 80
     OR jsonb_typeof(COALESCE(p_detail,'{}'::jsonb)) <> 'object'
     OR octet_length(COALESCE(p_detail,'{}'::jsonb)::TEXT) > 10000
     OR NOT EXISTS (
       SELECT 1 FROM users WHERE id = p_actor_id AND (role = 'super_admin' OR client_id = p_client_id)
     ) THEN
    RAISE EXCEPTION 'Invalid activity event.' USING ERRCODE = '42501';
  END IF;
  IF p_campaign_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM prospecting_campaigns WHERE id = p_campaign_id AND client_id = p_client_id
  ) THEN RAISE EXCEPTION 'Campaign not found.' USING ERRCODE = 'P0001'; END IF;
  IF p_lead_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM prospecting_campaign_leads WHERE id = p_lead_id AND client_id = p_client_id
  ) THEN RAISE EXCEPTION 'Lead not found.' USING ERRCODE = 'P0001'; END IF;
  IF p_subject_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM users WHERE id = p_subject_user_id AND client_id = p_client_id
  ) THEN RAISE EXCEPTION 'Assignee does not belong to this client.' USING ERRCODE = '42501'; END IF;
  INSERT INTO prospecting_activity_events (
    client_id, campaign_id, lead_id, job_id, event_type, actor_id, subject_user_id, detail
  ) VALUES (
    p_client_id, p_campaign_id, p_lead_id, p_job_id, trim(p_event_type), p_actor_id,
    p_subject_user_id, COALESCE(p_detail,'{}'::jsonb)
  ) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION reserve_prepare_claim_prospecting_job(
  p_campaign_id UUID,
  p_client_id UUID,
  p_actor_id UUID,
  p_actor_identifier TEXT,
  p_actor_provider_id TEXT,
  p_actor_build_requested TEXT,
  p_adapter_version INT,
  p_input_payload JSONB,
  p_input_hash TEXT,
  p_max_charge_usd NUMERIC,
  p_daily_run_limit INT DEFAULT 10,
  p_daily_result_limit INT DEFAULT 500
) RETURNS SETOF prospecting_jobs
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE v_job prospecting_jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM reserve_prospecting_job(
    p_campaign_id, p_client_id, p_actor_id, p_actor_identifier, p_adapter_version,
    p_max_charge_usd, p_daily_run_limit, p_daily_result_limit
  );
  SELECT * INTO v_job FROM prepare_prospecting_job(
    v_job.id, p_client_id, p_actor_provider_id, p_actor_build_requested, p_input_payload, p_input_hash
  );
  SELECT * INTO v_job FROM claim_prospecting_job(v_job.id, p_client_id, 120);
  IF v_job.id IS NULL OR v_job.lease_token IS NULL THEN
    RAISE EXCEPTION 'New collection job could not be claimed.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO prospecting_activity_events (
    client_id, campaign_id, job_id, event_type, actor_id, detail
  ) VALUES (
    p_client_id, p_campaign_id, v_job.id, 'collection_started', p_actor_id,
    jsonb_build_object('source',v_job.source,'requestedResults',v_job.requested_results)
  );
  RETURN NEXT v_job;
END $$;

CREATE OR REPLACE FUNCTION reserve_prepare_claim_prospecting_enrichment(
  p_lead_id UUID,
  p_client_id UUID,
  p_actor_id UUID,
  p_actor_identifier TEXT,
  p_actor_provider_id TEXT,
  p_actor_build_requested TEXT,
  p_adapter_version INT,
  p_input_payload JSONB,
  p_input_hash TEXT,
  p_max_charge_usd NUMERIC,
  p_daily_enrichment_limit INT DEFAULT 50
) RETURNS SETOF prospecting_jobs
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE v_job prospecting_jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM reserve_prospecting_enrichment(
    p_lead_id, p_client_id, p_actor_id, p_actor_identifier, p_adapter_version,
    p_max_charge_usd, p_daily_enrichment_limit
  );
  SELECT * INTO v_job FROM prepare_prospecting_job(
    v_job.id, p_client_id, p_actor_provider_id, p_actor_build_requested, p_input_payload, p_input_hash
  );
  SELECT * INTO v_job FROM claim_prospecting_job(v_job.id, p_client_id, 120);
  IF v_job.id IS NULL OR v_job.lease_token IS NULL THEN
    RAISE EXCEPTION 'New enrichment job could not be claimed.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO prospecting_activity_events (
    client_id, campaign_id, lead_id, job_id, event_type, actor_id, detail
  ) VALUES (
    p_client_id, v_job.campaign_id, p_lead_id, v_job.id, 'enrichment_started', p_actor_id,
    jsonb_build_object('website',p_input_payload#>>'{startUrls,0,url}')
  );
  RETURN NEXT v_job;
END $$;

-- A definitive no-run release must refund quota regardless of whether the job
-- had reached queued, running or error. actor_run_id remains the hard safety
-- boundary preventing refunds for a run that may have cost money.
CREATE OR REPLACE FUNCTION release_prospecting_job_reservation(
  p_job_id UUID,
  p_client_id UUID
) RETURNS SETOF prospecting_jobs
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE v_job prospecting_jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM prospecting_jobs
  WHERE id = p_job_id AND client_id = p_client_id FOR UPDATE;
  IF v_job.id IS NULL OR v_job.job_type <> 'collection' THEN
    RAISE EXCEPTION 'Collection job not found.' USING ERRCODE = 'P0001';
  END IF;
  IF v_job.actor_run_id IS NOT NULL OR v_job.reservation_released_at IS NOT NULL THEN
    RETURN NEXT v_job; RETURN;
  END IF;
  UPDATE prospecting_usage SET
    results_reserved = greatest(0, results_reserved - v_job.requested_results),
    updated_at = clock_timestamp()
  WHERE client_id = v_job.client_id AND usage_date = v_job.usage_date;
  UPDATE prospecting_jobs SET
    status = 'error', error_code = COALESCE(error_code,'provider_not_started'),
    error_message = COALESCE(error_message,'Lead collection did not start. No result allowance was used.'),
    completed_at = COALESCE(completed_at,clock_timestamp()), reservation_released_at = clock_timestamp(),
    lease_token = NULL, lease_until = NULL
  WHERE id = v_job.id RETURNING * INTO v_job;
  UPDATE prospecting_campaigns SET status = 'failed' WHERE id = v_job.campaign_id;
  RETURN NEXT v_job;
END $$;

CREATE OR REPLACE FUNCTION update_prospecting_lead_workflow(
  p_lead_id UUID,
  p_client_id UUID,
  p_actor_id UUID,
  p_status TEXT DEFAULT NULL,
  p_set_assignee BOOLEAN DEFAULT FALSE,
  p_assigned_to UUID DEFAULT NULL
) RETURNS SETOF prospecting_campaign_leads
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_before prospecting_campaign_leads%ROWTYPE;
  v_after prospecting_campaign_leads%ROWTYPE;
BEGIN
  SELECT * INTO v_before FROM prospecting_campaign_leads
  WHERE id = p_lead_id AND client_id = p_client_id FOR UPDATE;
  IF v_before.id IS NULL THEN RAISE EXCEPTION 'Lead not found.' USING ERRCODE = 'P0001'; END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_actor_id AND (role='super_admin' OR client_id=p_client_id)) THEN
    RAISE EXCEPTION 'Actor does not belong to this client.' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('new','shortlisted','dismissed') THEN
    RAISE EXCEPTION 'Invalid lead status.' USING ERRCODE = '22023';
  END IF;
  IF v_before.status = 'imported' AND p_status IS NOT NULL THEN
    RAISE EXCEPTION 'This lead is already in CRM.' USING ERRCODE = 'P0001';
  END IF;
  IF p_set_assignee AND p_assigned_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM users WHERE id = p_assigned_to AND client_id = p_client_id
  ) THEN RAISE EXCEPTION 'Assignee does not belong to this client.' USING ERRCODE = '42501'; END IF;

  UPDATE prospecting_campaign_leads SET
    status = COALESCE(p_status,status),
    assigned_to = CASE WHEN p_set_assignee THEN p_assigned_to ELSE assigned_to END
  WHERE id = p_lead_id RETURNING * INTO v_after;

  IF p_status IS NOT NULL AND p_status <> v_before.status THEN
    INSERT INTO prospecting_activity_events (
      client_id,campaign_id,lead_id,event_type,actor_id,detail
    ) VALUES (
      p_client_id,v_after.campaign_id,v_after.id,'lead_status_changed',p_actor_id,
      jsonb_build_object('from',v_before.status,'to',v_after.status)
    );
  END IF;
  IF p_set_assignee AND p_assigned_to IS DISTINCT FROM v_before.assigned_to THEN
    INSERT INTO prospecting_activity_events (
      client_id,campaign_id,lead_id,event_type,actor_id,subject_user_id,detail
    ) VALUES (
      p_client_id,v_after.campaign_id,v_after.id,
      CASE WHEN p_assigned_to IS NULL THEN 'lead_unassigned' ELSE 'lead_assigned' END,
      p_actor_id,p_assigned_to,jsonb_build_object('previousAssignee',v_before.assigned_to)
    );
  END IF;
  RETURN NEXT v_after;
END $$;

CREATE OR REPLACE FUNCTION update_prospecting_campaign_workflow(
  p_campaign_id UUID,
  p_client_id UUID,
  p_actor_id UUID,
  p_set_owner BOOLEAN DEFAULT FALSE,
  p_owner_id UUID DEFAULT NULL,
  p_archived BOOLEAN DEFAULT NULL
) RETURNS SETOF prospecting_campaigns
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_before prospecting_campaigns%ROWTYPE;
  v_after prospecting_campaigns%ROWTYPE;
BEGIN
  SELECT * INTO v_before FROM prospecting_campaigns
  WHERE id=p_campaign_id AND client_id=p_client_id FOR UPDATE;
  IF v_before.id IS NULL THEN RAISE EXCEPTION 'Campaign not found.' USING ERRCODE='P0001'; END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id=p_actor_id AND (role='super_admin' OR client_id=p_client_id)) THEN
    RAISE EXCEPTION 'Actor does not belong to this client.' USING ERRCODE='42501';
  END IF;
  IF p_set_owner AND p_owner_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM users WHERE id=p_owner_id AND client_id=p_client_id
  ) THEN RAISE EXCEPTION 'Owner does not belong to this client.' USING ERRCODE='42501'; END IF;
  IF p_archived = TRUE AND EXISTS (
    SELECT 1 FROM prospecting_jobs WHERE campaign_id=p_campaign_id
      AND status IN ('queued','running','ingesting')
  ) THEN RAISE EXCEPTION 'Campaign has active work.' USING ERRCODE='P0001'; END IF;

  UPDATE prospecting_campaigns SET
    owner_id = CASE WHEN p_set_owner THEN p_owner_id ELSE owner_id END,
    archived_at = CASE WHEN p_archived IS TRUE THEN clock_timestamp()
                       WHEN p_archived IS FALSE THEN NULL ELSE archived_at END,
    status = CASE WHEN p_archived IS TRUE THEN 'archived'
                  WHEN p_archived IS FALSE THEN 'ready' ELSE status END
  WHERE id=p_campaign_id RETURNING * INTO v_after;

  IF p_set_owner AND p_owner_id IS DISTINCT FROM v_before.owner_id THEN
    INSERT INTO prospecting_activity_events (
      client_id,campaign_id,event_type,actor_id,subject_user_id,detail
    ) VALUES (
      p_client_id,p_campaign_id,
      CASE WHEN p_owner_id IS NULL THEN 'campaign_unowned' ELSE 'campaign_owner_changed' END,
      p_actor_id,p_owner_id,jsonb_build_object('previousOwner',v_before.owner_id)
    );
  END IF;
  IF p_archived IS NOT NULL AND v_after.archived_at IS DISTINCT FROM v_before.archived_at THEN
    INSERT INTO prospecting_activity_events (
      client_id,campaign_id,event_type,actor_id,detail
    ) VALUES (
      p_client_id,p_campaign_id,CASE WHEN p_archived THEN 'campaign_archived' ELSE 'campaign_restored' END,
      p_actor_id,'{}'::jsonb
    );
  END IF;
  RETURN NEXT v_after;
END $$;

CREATE OR REPLACE FUNCTION promote_prospecting_lead_to_crm_v3(
  p_campaign_lead_id UUID,
  p_client_id UUID,
  p_actor_id UUID,
  p_selected_email TEXT DEFAULT NULL,
  p_selected_phone TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE v_contact_id UUID; v_campaign_id UUID;
BEGIN
  SELECT campaign_id INTO v_campaign_id FROM prospecting_campaign_leads
  WHERE id=p_campaign_lead_id AND client_id=p_client_id;
  SELECT promote_prospecting_lead_to_crm_v2(
    p_campaign_lead_id,p_client_id,p_actor_id,p_selected_email,p_selected_phone
  ) INTO v_contact_id;
  INSERT INTO prospecting_activity_events (
    client_id,campaign_id,lead_id,event_type,actor_id,detail
  ) VALUES (
    p_client_id,v_campaign_id,p_campaign_lead_id,'crm_promoted',p_actor_id,
    jsonb_build_object('contactId',v_contact_id)
  );
  RETURN v_contact_id;
END $$;

CREATE OR REPLACE FUNCTION record_prospecting_job_terminal_event()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('done','error','cancelled') AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO prospecting_activity_events (
      client_id,campaign_id,lead_id,job_id,event_type,actor_id,detail
    ) VALUES (
      NEW.client_id,NEW.campaign_id,NEW.lead_id,NEW.id,
      CASE WHEN NEW.status='done' THEN 'job_completed' WHEN NEW.status='cancelled' THEN 'job_cancelled' ELSE 'job_failed' END,
      NEW.created_by,jsonb_strip_nulls(jsonb_build_object(
        'jobType',NEW.job_type,'returnedResults',NEW.returned_results,'errorCode',NEW.error_code
      ))
    );
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS prospecting_job_terminal_activity ON prospecting_jobs;
CREATE TRIGGER prospecting_job_terminal_activity
AFTER UPDATE OF status ON prospecting_jobs
FOR EACH ROW EXECUTE FUNCTION record_prospecting_job_terminal_event();

REVOKE ALL ON FUNCTION record_prospecting_activity(UUID,UUID,TEXT,UUID,UUID,UUID,UUID,JSONB) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION reserve_prepare_claim_prospecting_job(UUID,UUID,UUID,TEXT,TEXT,TEXT,INT,JSONB,TEXT,NUMERIC,INT,INT) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION reserve_prepare_claim_prospecting_enrichment(UUID,UUID,UUID,TEXT,TEXT,TEXT,INT,JSONB,TEXT,NUMERIC,INT) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION update_prospecting_lead_workflow(UUID,UUID,UUID,TEXT,BOOLEAN,UUID) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION update_prospecting_campaign_workflow(UUID,UUID,UUID,BOOLEAN,UUID,BOOLEAN) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION promote_prospecting_lead_to_crm_v3(UUID,UUID,UUID,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION record_prospecting_activity(UUID,UUID,TEXT,UUID,UUID,UUID,UUID,JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION reserve_prepare_claim_prospecting_job(UUID,UUID,UUID,TEXT,TEXT,TEXT,INT,JSONB,TEXT,NUMERIC,INT,INT) TO service_role;
GRANT EXECUTE ON FUNCTION reserve_prepare_claim_prospecting_enrichment(UUID,UUID,UUID,TEXT,TEXT,TEXT,INT,JSONB,TEXT,NUMERIC,INT) TO service_role;
GRANT EXECUTE ON FUNCTION update_prospecting_lead_workflow(UUID,UUID,UUID,TEXT,BOOLEAN,UUID) TO service_role;
GRANT EXECUTE ON FUNCTION update_prospecting_campaign_workflow(UUID,UUID,UUID,BOOLEAN,UUID,BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION promote_prospecting_lead_to_crm_v3(UUID,UUID,UUID,TEXT,TEXT) TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('20260803000312_prospecting_collaboration_and_atomic_start.sql')
ON CONFLICT (version) DO NOTHING;
