/**
 * /api/my-job/contract/document — the signed contract PDF on a VA's record.
 *
 * POST   (multipart) → admin uploads/replaces the PDF for ?userId (stored in
 *          the `vault` bucket under contracts/<clientId>/, recorded on
 *          va_job_contracts.contract_path/name).
 * GET    ?userId? → a short-lived signed download URL. A VA gets their own; an
 *          admin gets any VA in their client.
 * DELETE ?userId → admin removes the stored PDF.
 *
 * Service-role storage + table access, scoped in code (assertClientAccess).
 */
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ADMIN = ["client_admin", "super_admin"];
const MAX_SIZE = 15 * 1024 * 1024; // 15 MB

/** Resolve a target VA's client_id and existing contract path, enforcing access. */
async function resolveTarget(
  admin: ReturnType<typeof createAdminClient>,
  caller: { id: string; role: string; client_id: string | null },
  targetId: string,
  requireAdmin: boolean,
): Promise<{ clientId: string | null; contractPath: string | null; contractName: string | null } | NextResponse> {
  if (targetId !== caller.id) {
    if (!ADMIN.includes(caller.role)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  } else if (requireAdmin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const { data: target } = await admin.from("users").select("client_id").eq("id", targetId).maybeSingle();
  const clientId = (target as { client_id: string | null } | null)?.client_id ?? null;
  if (targetId !== caller.id) {
    const denied = assertClientAccess(caller, clientId ?? "");
    if (denied) return denied;
  }
  const { data: contract } = await admin
    .from("va_job_contracts")
    .select("contract_path, contract_name")
    .eq("user_id", targetId)
    .maybeSingle();
  const c = contract as { contract_path: string | null; contract_name: string | null } | null;
  return { clientId, contractPath: c?.contract_path ?? null, contractName: c?.contract_name ?? null };
}

export const POST = withAuth(async (req, { user }) => {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const userId = (form.get("userId") as string) || "";
  if (!file || !userId) return NextResponse.json({ error: "Missing file or user." }, { status: 400 });
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Upload a PDF." }, { status: 422 });
  }
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "PDF exceeds the 15MB limit." }, { status: 422 });

  const admin = createAdminClient();
  const target = await resolveTarget(admin, user, userId, /* requireAdmin */ true);
  if (target instanceof NextResponse) return target;

  const storagePath = `contracts/${target.clientId ?? "no-client"}/${userId}-${Date.now()}.pdf`;
  const { error: upErr } = await admin.storage.from("vault").upload(storagePath, file, { contentType: "application/pdf" });
  if (upErr) return NextResponse.json({ error: "Upload failed: " + upErr.message }, { status: 500 });

  const { error: dbErr } = await admin.from("va_job_contracts").upsert(
    { user_id: userId, client_id: target.clientId, contract_path: storagePath, contract_name: file.name.slice(0, 200), updated_by: user.id, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (dbErr) {
    await admin.storage.from("vault").remove([storagePath]);
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  // Drop the previous file so storage doesn't accumulate orphans.
  if (target.contractPath && target.contractPath !== storagePath) {
    await admin.storage.from("vault").remove([target.contractPath]);
  }
  return NextResponse.json({ contract_name: file.name.slice(0, 200) });
});

export const GET = withAuth(async (req, { user }) => {
  const targetId = req.nextUrl.searchParams.get("userId") || user.id;
  const admin = createAdminClient();
  const target = await resolveTarget(admin, user, targetId, /* requireAdmin */ false);
  if (target instanceof NextResponse) return target;
  if (!target.contractPath) return NextResponse.json({ error: "No contract on file." }, { status: 404 });

  const { data, error } = await admin.storage.from("vault").createSignedUrl(target.contractPath, 300);
  if (error || !data) return NextResponse.json({ error: "Couldn't generate a download link." }, { status: 500 });
  return NextResponse.json({ url: data.signedUrl, name: target.contractName });
});

export const DELETE = withAuth(async (req, { user }) => {
  const targetId = req.nextUrl.searchParams.get("userId") || "";
  if (!targetId) return NextResponse.json({ error: "Missing user." }, { status: 400 });
  const admin = createAdminClient();
  const target = await resolveTarget(admin, user, targetId, /* requireAdmin */ true);
  if (target instanceof NextResponse) return target;

  if (target.contractPath) await admin.storage.from("vault").remove([target.contractPath]);
  await admin.from("va_job_contracts").update({ contract_path: null, contract_name: null, updated_by: user.id, updated_at: new Date().toISOString() }).eq("user_id", targetId);
  return NextResponse.json({ ok: true });
}, { roles: ADMIN });
