import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureError } from "@/lib/error-tracking";

/**
 * Fire-and-forget activity-trail entry on a CRM contact (table crm_events).
 * Shared by the contacts and notes routes so the timeline covers every event.
 * Never throws; a dropped insert is reported to /admin/errors rather than lost.
 */
export function logCrm(contactId: string, clientId: string, userId: string, body: string): void {
  const admin = createAdminClient();
  void admin
    .from("crm_events")
    .insert({ contact_id: contactId, client_id: clientId, user_id: userId, body })
    .then(({ error }) => {
      if (error) captureError("api", new Error(`crm activity insert: ${error.message}`), { url: "crm:events", userId });
    });
}
