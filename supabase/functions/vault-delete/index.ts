/**
 * vault-delete — Authoritative bulk delete of vault items + storage objects
 *
 * Purpose: Deletes one or more vault items and their associated files in
 *          Supabase Storage. Must be an edge function because the service role
 *          key is required for storage admin operations — never expose it client-side.
 *
 * Called by: /api/vault/delete (POST, from VaultClient bulk-delete or single-delete)
 *
 * DB Reads:  vault_items — verify ALL itemIds belong to clientId before any delete
 * DB Writes: deletes rows from vault_items
 * Storage:   deletes objects from 'vault' bucket for pdf/docx items
 *
 * Auth:      Bearer JWT → getUser() → client_admin OR super_admin ONLY (VAs cannot delete)
 * Secrets:   SUPABASE_SERVICE_ROLE_KEY (storage.admin.delete requires service role)
 * Safeguard: Cross-tenant check — all itemIds verified against clientId before ANY deletion
 */

import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { authorizeRequest, checkClientMembership } from "../_shared/auth.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return handleOptions();
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    // Delete is restricted to client_admin/super_admin — the VA role is
    // explicitly blocked at function level too (getUser() is authoritative;
    // getSession() is not safe server-side).
    const auth = await authorizeRequest(req, {
      allowedRoles: ["client_admin", "super_admin"],
      forbiddenMessage: "Forbidden. Only client admins can delete vault items.",
    });
    if (!auth.ok) return auth.response;
    const { admin, role } = auth;

    // ── Validate input ─────────────────────────────────────────────
    // Guard against malformed JSON — req.json() throws on invalid input,
    // which would produce a generic 500. We want a clear 400 instead.
    let body: { itemIds?: unknown; clientId?: unknown };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { itemIds, clientId } = body;

    if (!Array.isArray(itemIds) || itemIds.length === 0 || !clientId) {
      return new Response(JSON.stringify({ error: "Missing itemIds array or clientId." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cap bulk delete at 100 items per request to prevent abuse
    if (itemIds.length > 100) {
      return new Response(JSON.stringify({ error: "Maximum 100 items per delete request." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Client membership check
    const membershipDenied = checkClientMembership(role, auth.userClientId, clientId);
    if (membershipDenied) return membershipDenied;

    // ── Cross-tenant safety check ─────────────────────────────────────────────
    // Fetch ALL requested items and verify every single one belongs to clientId.
    // If any item belongs to a different client, reject the ENTIRE request.
    // This prevents a malicious actor from injecting foreign item IDs.
    const { data: items, error: fetchErr } = await admin
      .from("vault_items")
      .select("id, client_id, storage_path, source_type")
      .in("id", itemIds);

    if (fetchErr) {
      return new Response(JSON.stringify({ error: "Failed to verify items." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fetchedItems = (items ?? []) as Array<{
      id: string;
      client_id: string;
      storage_path: string | null;
      source_type: string;
    }>;

    // Ensure every fetched item belongs to the claimed clientId
    const crossTenantViolation = fetchedItems.some(i => i.client_id !== clientId);
    if (crossTenantViolation) {
      // Log full context for incident response — user, claimed client, actual client(s)
      const actualClients = [...new Set(fetchedItems.map(i => i.client_id))].join(", ");
      console.error(`❌ Cross-tenant delete attempt: user=${auth.authUserId} claimed_client=${clientId} actual_clients=${actualClients}`);
      return new Response(JSON.stringify({ error: "Forbidden. Item ownership mismatch." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Delete storage objects first ──────────────────────────────────────────
    // Storage objects must be removed before DB rows to avoid orphaned files.
    // We collect storage errors but don't fail the whole request — DB delete proceeds.
    const storagePaths = fetchedItems
      .filter(i => i.storage_path && (i.source_type === "pdf" || i.source_type === "docx"))
      .map(i => i.storage_path!);

    const storageErrors: string[] = [];

    if (storagePaths.length > 0) {
      const { error: storageErr } = await admin.storage
        .from("vault")
        .remove(storagePaths);
      if (storageErr) {
        // Log but don't abort — DB rows should still be deleted
        console.error("⚠️ Storage delete partial error:", storageErr.message);
        storageErrors.push(storageErr.message);
      }
    }

    // ── Delete DB rows ────────────────────────────────────────────────────────
    const { error: deleteErr, count } = await admin
      .from("vault_items")
      .delete({ count: "exact" })
      .in("id", itemIds)
      .eq("client_id", clientId); // Second safety net — redundant but intentional

    if (deleteErr) {
      return new Response(JSON.stringify({ error: "Delete failed: " + deleteErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`✅ vault-delete: ${count} items deleted for client ${clientId}`);

    return new Response(JSON.stringify({
      success: true,
      deleted: count ?? itemIds.length,
      storageErrors,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("❌ vault-delete error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Internal server error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
