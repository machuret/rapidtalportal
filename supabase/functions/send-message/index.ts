/**
 * Supabase Edge Function: send-message
 *
 * Handles sending a message in the client <-> VA thread.
 * Validates auth, client membership, and body length before inserting.
 * Uses service role to bypass RLS on insert so Realtime subscribers
 * receive the event immediately.
 */

import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { authorizeRequest } from "../_shared/auth.ts";

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
    // super_admins have no client and are blocked from messaging; every other
    // caller must have a users row with a client assigned.
    const auth = await authorizeRequest(req, {
      blockSuperAdmin: true,
      select: "id, role, client_id, full_name, email",
    });
    if (!auth.ok) return auth.response;
    const { admin, role, userClientId, userRow } = auth;
    // No service-key bypass here, so an authorized caller always has a user id.
    const authUserId = auth.authUserId as string;

    const fullName = (userRow as { full_name: string | null; email: string }).full_name
      || (userRow as { email: string }).email;

    // ── Parse + validate body ─────────────────────────────────────────────────
    const body = await req.json();
    const { message, audience: requestedAudience } = body as {
      message?: string;
      audience?: "company" | "client" | "va_team";
    };

    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "Missing message body." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const trimmed = message.trim();
    if (trimmed.length === 0) {
      return new Response(JSON.stringify({ error: "Message cannot be empty." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (trimmed.length > 4000) {
      return new Response(JSON.stringify({ error: "Message exceeds 4000 character limit." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const audience = requestedAudience ?? "company";
    if (!["company", "client", "va_team"].includes(audience)) {
      return new Response(JSON.stringify({ error: "Invalid message audience." }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (role === "va" && audience === "va_team") {
      return new Response(JSON.stringify({ error: "A VA cannot send a VA-team-only message." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (role === "client_admin" && audience === "client") {
      return new Response(JSON.stringify({ error: "A client cannot send a client-only message." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Insert message ────────────────────────────────────────────────────────
    const { data: msg, error: insertError } = await admin
      .from("messages")
      .insert({
        client_id: userClientId,
        sender_id: authUserId,
        sender_name: fullName,
        sender_role: role,
        body: trimmed,
        audience,
        read_by: [authUserId],
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to send message." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Notify teammates (deduped) ───────────────────────────────────────────
    // One unread "new messages" notification per person per client at a time:
    // recipients who already have one unread are skipped, so a chatty thread
    // produces a single badge, not fifty. Best-effort — never fails the send.
    try {
      const { data: teammates } = await admin
        .from("users")
        .select("id,role")
        .eq("client_id", userClientId)
        .neq("id", authUserId);
      const recipientIds = ((teammates ?? []) as { id: string; role: string }[])
        .filter((user) =>
          audience === "company"
          || (audience === "client" && user.role === "client_admin")
          || (audience === "va_team" && user.role === "va")
        )
        .map((user) => user.id);

      if (recipientIds.length > 0) {
        const { data: alreadyUnread } = await admin
          .from("notifications")
          .select("user_id")
          .eq("type", "message")
          .eq("client_id", userClientId)
          .is("read_at", null)
          .in("user_id", recipientIds);
        const skip = new Set(((alreadyUnread ?? []) as { user_id: string }[]).map((n) => n.user_id));
        const toNotify = recipientIds.filter((id) => !skip.has(id));

        if (toNotify.length > 0) {
          await admin.from("notifications").insert(
            toNotify.map((user_id) => ({
              user_id,
              client_id: userClientId,
              type: "message",
              title: `New messages from ${fullName}`,
              body: trimmed.slice(0, 200),
              href: "/messages",
            })),
          );
        }
      }
    } catch (notifyErr) {
      console.warn("send-message notify failed:", notifyErr);
    }

    return new Response(JSON.stringify({ success: true, message: msg }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("❌ send-message error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Internal server error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
