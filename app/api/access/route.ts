/**
 * Access section API — encrypted shared logins per client.
 * GET    — list entries for a client (passwords NEVER included).
 * POST   — create an entry (client_admin / super_admin). Password is encrypted
 *          with AES-256-GCM before it touches the database.
 * PATCH  — update an entry; password only re-encrypted when a new one is sent.
 * DELETE — remove an entry.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertClientAccess } from "@/lib/api-auth";
import { withAuth } from "@/lib/api/with-auth";
import { encryptSecret, isEncryptionConfigured } from "@/lib/crypto/credentials";

const ADMIN_ROLES = ["client_admin", "super_admin"];

// Safe columns only — password_enc must never leave the server in a list.
const SAFE_SELECT = "id, client_id, created_by, site, category, url, username, created_at, updated_at";

const createSchema = z.object({
  clientId: z.string().uuid(),
  site: z.string().min(1).max(200),
  category: z.string().min(1).max(100),
  url: z.string().max(2000).optional().default(""),
  username: z.string().max(500).optional().default(""),
  password: z.string().min(1).max(5000),
});

const patchSchema = z.object({
  id: z.string().uuid(),
  site: z.string().min(1).max(200).optional(),
  category: z.string().min(1).max(100).optional(),
  url: z.string().max(2000).optional(),
  username: z.string().max(500).optional(),
  password: z.string().min(1).max(5000).optional(),
});

const deleteSchema = z.object({ id: z.string().uuid() });

function encryptionNotConfigured() {
  return NextResponse.json(
    { error: "Credential encryption is not configured. Set CREDENTIALS_ENCRYPTION_KEY (openssl rand -base64 32) and redeploy." },
    { status: 503 },
  );
}

export const GET = withAuth(async (req, { user }) => {
  const clientId = req.nextUrl.searchParams.get("clientId") ?? user.client_id;
  if (!clientId) return NextResponse.json({ error: "No client." }, { status: 400 });
  const denied = assertClientAccess(user, clientId);
  if (denied) return denied;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("access_credentials")
    .select(SAFE_SELECT)
    .eq("client_id", clientId)
    .order("category")
    .order("site");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
});

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input.", issues: parsed.error.flatten() }, { status: 422 });

  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;
  if (!isEncryptionConfigured()) return encryptionNotConfigured();

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("access_credentials")
    .insert({
      client_id: parsed.data.clientId,
      created_by: user.id,
      site: parsed.data.site.trim(),
      category: parsed.data.category.trim(),
      url: parsed.data.url.trim(),
      username: parsed.data.username.trim(),
      password_enc: encryptSecret(parsed.data.password),
      updated_at: new Date().toISOString(),
    })
    .select(SAFE_SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}, { roles: ADMIN_ROLES });

export const PATCH = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input.", issues: parsed.error.flatten() }, { status: 422 });

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (admin as any)
    .from("access_credentials")
    .select("id, client_id")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "Entry not found." }, { status: 404 });

  const denied = assertClientAccess(user, (existing as { client_id: string }).client_id);
  if (denied) return denied;

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.site !== undefined) updates.site = parsed.data.site.trim();
  if (parsed.data.category !== undefined) updates.category = parsed.data.category.trim();
  if (parsed.data.url !== undefined) updates.url = parsed.data.url.trim();
  if (parsed.data.username !== undefined) updates.username = parsed.data.username.trim();
  if (parsed.data.password !== undefined) {
    if (!isEncryptionConfigured()) return encryptionNotConfigured();
    updates.password_enc = encryptSecret(parsed.data.password);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("access_credentials")
    .update(updates)
    .eq("id", parsed.data.id)
    .select(SAFE_SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}, { roles: ADMIN_ROLES });

export const DELETE = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (admin as any)
    .from("access_credentials")
    .select("id, client_id")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "Entry not found." }, { status: 404 });

  const denied = assertClientAccess(user, (existing as { client_id: string }).client_id);
  if (denied) return denied;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any).from("access_credentials").delete().eq("id", parsed.data.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}, { roles: ADMIN_ROLES });
