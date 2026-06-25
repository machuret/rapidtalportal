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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "https://rapidtal.online",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const jwt = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Validate JWT — getUser() is authoritative; getSession() is not safe server-side
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: { user: authUser }, error: authError } = await userClient.auth.getUser();
    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: "Unauthorized." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Fetch user row to check role — delete is restricted to client_admin/super_admin
    const { data: userRow } = await admin
      .from("users")
      .select("role, client_id")
      .eq("id", authUser.id)
      .single();

    if (!userRow) {
      return new Response(JSON.stringify({ error: "User record not found." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const role = (userRow as { role: string }).role;

    // VA role is explicitly blocked from deleting — enforce at function level too
    if (role !== "client_admin" && role !== "super_admin") {
      return new Response(JSON.stringify({ error: "Forbidden. Only client admins can delete vault items." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
    const userClientId = (userRow as { client_id: string | null }).client_id;
    if (role !== "super_admin" && userClientId !== clientId) {
      return new Response(JSON.stringify({ error: "Forbidden." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      console.error(`❌ Cross-tenant delete attempt: user=${authUser.id} claimed_client=${clientId} actual_clients=${actualClients}`);
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
