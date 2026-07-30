/**
 * POST /api/vault/verify — fact-safety check for a composed draft.
 *
 * Reuses the dossier figure-verification: extracts every quoted figure (prices,
 * %, day/week counts) from the draft and confirms each literally appears in the
 * client's Vault content (or the author's own brief/context). Anything it can't
 * verify is flagged so a VA double-checks before sending — kills invented prices.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertClientAccess } from "@/lib/api-auth";
import { withAuth } from "@/lib/api/with-auth";
import { verifyFigures } from "@/lib/crawl/classify";
import { serverError } from "@/lib/api/errors";

const schema = z.object({
  clientId: z.string().uuid(),
  text: z.string().min(1).max(20000),
  context: z.string().max(20000).optional(), // the user's own brief/inbound — trusted
});

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });

  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("vault_items")
    .select("raw_content")
    .eq("client_id", parsed.data.clientId)
    .eq("status", "ready")
    .limit(200);
  if (error) return serverError(error, {
    userId: user.id,
    clientId: parsed.data.clientId,
    url: "/api/vault/verify",
  });

  const corpus =
    ((data ?? []) as { raw_content: string | null }[]).map((r) => r.raw_content ?? "").join("\n").slice(0, 400_000) +
    "\n" + (parsed.data.context ?? "");

  const { verified, unverified } = verifyFigures(parsed.data.text, corpus);
  return NextResponse.json({ verified, unverified });
});
