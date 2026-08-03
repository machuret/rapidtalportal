export const PROSPECTING_ACTIVITY = Object.freeze({
  campaignCreated: "campaign_created",
  campaignArchived: "campaign_archived",
  campaignRestored: "campaign_restored",
  campaignOwnerChanged: "campaign_owner_changed",
  campaignUnowned: "campaign_unowned",
  matchingRulesUpdated: "matching_rules_updated",
  collectionStarted: "collection_started",
  enrichmentStarted: "enrichment_started",
  leadAssigned: "lead_assigned",
  leadUnassigned: "lead_unassigned",
  leadStatusChanged: "lead_status_changed",
  crmPromoted: "crm_promoted",
  jobCompleted: "job_completed",
  jobFailed: "job_failed",
  jobCancelled: "job_cancelled",
} as const);

export type ProspectingActivityEventType =
  (typeof PROSPECTING_ACTIVITY)[keyof typeof PROSPECTING_ACTIVITY];

const ACTIVITY_LABELS: Readonly<Record<ProspectingActivityEventType, string>> = Object.freeze({
  campaign_created: "created a campaign",
  campaign_archived: "archived a campaign",
  campaign_restored: "restored a campaign",
  campaign_owner_changed: "changed the campaign owner",
  campaign_unowned: "removed the campaign owner",
  matching_rules_updated: "updated the matching rules",
  collection_started: "started lead collection",
  enrichment_started: "started company enrichment",
  lead_assigned: "assigned a lead",
  lead_unassigned: "unassigned a lead",
  lead_status_changed: "changed a lead status",
  crm_promoted: "added a lead to CRM",
  job_completed: "completed a lead-generation job",
  job_failed: "recorded a failed lead-generation job",
  job_cancelled: "cancelled a lead-generation job",
});

export function prospectingActivityLabel(eventType: ProspectingActivityEventType): string {
  return ACTIVITY_LABELS[eventType];
}

export function isProspectingActivityEventType(value: string): value is ProspectingActivityEventType {
  return Object.values(PROSPECTING_ACTIVITY).some((eventType) => eventType === value);
}
