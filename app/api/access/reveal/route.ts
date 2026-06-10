/**
 * Decrypt a single stored password, on demand.
 *
 * Passwords are never included in list responses — the only way to get one is
 * this endpoint, which checks the caller belongs to the credential's client
 * and writes an audit row (who revealed what, when) before returning the
 * plaintext over the TLS connection.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertClientAccess } from "@/lib/api-auth";
import { withAuth } from "@/lib/api/with-auth";
import { decryptSecret } from "@/lib/crypto/credentials";
import { credentialRevealLimiter, tooManyRequests } from "@/lib/rate-limit";

const schema = z.object({ id: z.string().uuid() });

export const POST = withAuth(async (req, { user }) => {
  // Throttle reveals so a compromised session can't bulk-export the vault.
  const rl = credentialRevealLimiter.check(`reveal:${user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("access_credentials")
    .select("id, client_id, password_enc")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Entry not found." }, { status: 404 });

  const cred = row as { id: string; client_id: string; password_enc: string };
  const denied = assertClientAccess(user, cred.client_id);
  if (denied) return denied;

  let password: string;
  try {
    password = decryptSecret(cred.password_enc);
  } catch {
    return NextResponse.json(
      { error: "Couldn't decrypt this entry. The encryption key may have changed since it was saved." },
      { status: 500 },
    );
  }

  // Audit trail: the client admin can see exactly who viewed which login.
  await admin.from("access_credential_reveals").insert({
    credential_id: cred.id,
    client_id: cred.client_id,
    user_id: user.id,
  });

  return NextResponse.json({ password });
});
