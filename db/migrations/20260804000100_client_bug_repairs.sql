-- Client experience repairs: make the Lead Generation -> CRM handoff visible
-- in both products' activity histories. The promotion remains atomic.

CREATE OR REPLACE FUNCTION promote_prospecting_lead_to_crm_v3(
  p_campaign_lead_id UUID,
  p_client_id UUID,
  p_actor_id UUID,
  p_selected_email TEXT DEFAULT NULL,
  p_selected_phone TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_contact_id UUID;
  v_campaign_id UUID;
  v_campaign_name TEXT;
BEGIN
  SELECT pcl.campaign_id, pc.name
    INTO v_campaign_id, v_campaign_name
  FROM prospecting_campaign_leads pcl
  JOIN prospecting_campaigns pc
    ON pc.id = pcl.campaign_id AND pc.client_id = pcl.client_id
  WHERE pcl.id = p_campaign_lead_id
    AND pcl.client_id = p_client_id;

  SELECT promote_prospecting_lead_to_crm_v2(
    p_campaign_lead_id,p_client_id,p_actor_id,p_selected_email,p_selected_phone
  ) INTO v_contact_id;

  INSERT INTO prospecting_activity_events (
    client_id,campaign_id,lead_id,event_type,actor_id,detail
  ) VALUES (
    p_client_id,v_campaign_id,p_campaign_lead_id,'crm_promoted',p_actor_id,
    jsonb_build_object('contactId',v_contact_id)
  );

  INSERT INTO crm_events (contact_id,client_id,user_id,body)
  SELECT
    v_contact_id,
    p_client_id,
    p_actor_id,
    'added this contact from Lead Generation' ||
      CASE WHEN NULLIF(v_campaign_name, '') IS NULL THEN '' ELSE ' · ' || v_campaign_name END
  WHERE NOT EXISTS (
    SELECT 1
    FROM crm_events
    WHERE contact_id = v_contact_id
      AND client_id = p_client_id
      AND body LIKE 'added this contact from Lead Generation%'
  );

  RETURN v_contact_id;
END $$;

REVOKE ALL ON FUNCTION promote_prospecting_lead_to_crm_v3(UUID,UUID,UUID,TEXT,TEXT)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION promote_prospecting_lead_to_crm_v3(UUID,UUID,UUID,TEXT,TEXT)
  TO service_role;

INSERT INTO schema_migrations (version)
VALUES ('20260804000100_client_bug_repairs.sql')
ON CONFLICT DO NOTHING;
