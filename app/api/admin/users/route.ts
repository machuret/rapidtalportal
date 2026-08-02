import { NextResponse } from "next/server";
import { serverError } from "@/lib/api/errors";
import { z } from "zod";
import { withSuperAdmin } from "@/lib/api/with-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { invalidateCachedIdentity } from "@/lib/auth-cache";

// ── POST /api/admin/users — Invite / create a new user ──────────────
const createSchema = z.object({
  email:     z.string().email().max(200),
  full_name: z.string().min(1).max(120),
  role:      z.enum(["super_admin", "client_admin", "va"]),
  client_id: z.string().uuid().nullable().optional(),
  password:  z.string().min(8).max(100).optional(),
});

export const POST = withSuperAdmin(async (req) => {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const admin = createAdminClient();

  // 1. Create auth user via Supabase Admin Auth.
  // Fallback uses cryptographically strong entropy (the admin sets a real
  // password or the user resets) rather than weak Math.random().
  const password = parsed.data.password || `${crypto.randomUUID()}${crypto.randomUUID()}Aa1!`;
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: parsed.data.full_name,
    },
  });

  if (authError) {
    console.error("[admin/users POST] Auth error:", authError.message);
    if (authError.message?.includes("already been registered")) {
      return NextResponse.json({ error: "Email already registered." }, { status: 409 });
    }
    return serverError(authError);
  }

  // 2. Write the public.users profile row.
  // UPSERT (not insert) because many Supabase projects have an on-signup trigger
  // (handle_new_user) that already created a bare public.users row when the auth
  // user was created above — a plain insert then collides on users_pkey. Upsert
  // updates that row with the chosen role/client/name, and still inserts cleanly
  // if no such trigger exists.
  const { data: userRow, error: dbError } = await admin
    .from("users")
    .upsert(
      {
        id: authUser.user.id,
        email: parsed.data.email,
        full_name: parsed.data.full_name,
        role: parsed.data.role,
        client_id: parsed.data.client_id ?? null,
      },
      { onConflict: "id" },
    )
    .select("id, email, full_name, role, client_id, created_at")
    .single();

  if (dbError) {
    console.error("[admin/users POST] DB error:", dbError.message);
    // Attempt cleanup: delete the auth user we just created (cascades any
    // trigger-created profile row via the FK).
    await admin.auth.admin.deleteUser(authUser.user.id);
    return serverError(dbError);
  }

  return NextResponse.json(userRow, { status: 201 });
});

// ── PATCH /api/admin/users — Update any user ────────────────────────
const patchSchema = z.object({
  id:        z.string().uuid(),
  email:     z.string().email().max(200).optional(),
  full_name: z.string().min(1).max(120).optional(),
  role:      z.enum(["super_admin", "client_admin", "va"]).optional(),
  client_id: z.string().uuid().nullable().optional(),
});

export const PATCH = withSuperAdmin(async (req) => {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const { id, ...updates } = parsed.data;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 422 });
  }

  const admin = createAdminClient();

  // Fetch current state for the lockout guard + email rollback.
  const { data: current } = await admin
    .from("users")
    .select("role, email")
    .eq("id", id)
    .single();
  if (!current) return NextResponse.json({ error: "User not found." }, { status: 404 });
  const cur = current as { role: string; email: string };

  // Guard: never demote the last remaining super_admin (avoids locking everyone
  // out of admin).
  if (updates.role && updates.role !== "super_admin" && cur.role === "super_admin") {
    const { count } = await admin
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("role", "super_admin");
    if ((count ?? 0) <= 1) {
      return NextResponse.json({ error: "Cannot demote the last super admin." }, { status: 400 });
    }
  }

  // Update the public.users row first.
  const { data, error } = await admin
    .from("users")
    .update(updates)
    .eq("id", id)
    .select("id, email, full_name, role, client_id, created_at")
    .single();

  if (error) {
    console.error("[admin/users PATCH]", error.code, error.message);
    return serverError(error);
  }

  // Sync the auth email only when it actually changed; roll the row back on
  // failure so public.users and auth.users never desync.
  if (updates.email && updates.email !== cur.email) {
    const { error: authError } = await admin.auth.admin.updateUserById(id, { email: updates.email });
    if (authError) {
      console.error("[admin/users PATCH] Auth email update error:", authError.message);
      await admin.from("users").update({ email: cur.email }).eq("id", id);
      return NextResponse.json({ error: "Failed to update email in auth: " + authError.message }, { status: 500 });
    }
  }

  // Role/client may have changed — drop the cached identity so it takes effect
  // immediately on this instance (other warm instances catch up within the TTL).
  invalidateCachedIdentity(id);
  return NextResponse.json(data);
});

// ── DELETE /api/admin/users — Remove a user ─────────────────────────
const deleteSchema = z.object({
  id: z.string().uuid(),
});

export const DELETE = withSuperAdmin(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  // Prevent self-deletion
  if (parsed.data.id === user.id) {
    return NextResponse.json({ error: "Cannot delete yourself." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Guard: never delete the last remaining super_admin.
  const { data: victim } = await admin
    .from("users")
    .select("role")
    .eq("id", parsed.data.id)
    .single();
  if (victim && (victim as { role: string }).role === "super_admin") {
    const { count } = await admin
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("role", "super_admin");
    if ((count ?? 0) <= 1) {
      return NextResponse.json({ error: "Cannot delete the last super admin." }, { status: 400 });
    }
  }

  // Delete from public.users first
  const { error: dbError } = await admin
    .from("users")
    .delete()
    .eq("id", parsed.data.id);

  if (dbError) {
    console.error("[admin/users DELETE] DB:", dbError.message);
    return serverError(dbError);
  }

  // Then delete auth user
  const { error: authError } = await admin.auth.admin.deleteUser(parsed.data.id);
  if (authError) {
    console.error("[admin/users DELETE] Auth:", authError.message);
    // User row already deleted — log but don't fail
  }

  invalidateCachedIdentity(parsed.data.id);
  return NextResponse.json({ success: true });
});
