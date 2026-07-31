/**
 * Supabase Edge Function: send-message
 *
 * Handles sending a message in the client <-> VA thread.
 * Validates auth, client membership, and body length before inserting.
 * Uses service role to bypass RLS on insert so Realtime subscribers
 * receive the event immediately.
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

    // Verify JWT
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

    // Fetch user row — need role, client_id, and full_name
    const { data: userRow } = await admin
      .from("users")
      .select("id, role, client_id, full_name, email")
      .eq("id", authUser.id)
      .single();

    if (!userRow) {
      return new Response(JSON.stringify({ error: "User record not found." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const role = (userRow as { role: string }).role;
    const userClientId = (userRow as { client_id: string | null }).client_id;
    const fullName = (userRow as { full_name: string | null; email: string }).full_name
      || (userRow as { email: string }).email;

    // super_admin has no client — block messaging
    if (role === "super_admin") {
      return new Response(JSON.stringify({ error: "Super admins cannot send messages." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!userClientId) {
      return new Response(JSON.stringify({ error: "User has no client assigned." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
        sender_id: authUser.id,
        sender_name: fullName,
        sender_role: role,
        body: trimmed,
        audience,
        read_by: [authUser.id],
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
        .neq("id", authUser.id);
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
