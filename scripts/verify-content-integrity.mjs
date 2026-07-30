#!/usr/bin/env node

/**
 * Destructive-but-self-cleaning production smoke test for migration 113.
 *
 * API keys are read from stdin so they never appear in command arguments,
 * logs, or repository files:
 *   supabase projects api-keys --project-ref <ref> -o json |
 *     SUPABASE_PROJECT_REF=<ref> node scripts/verify-content-integrity.mjs
 */
import process from "node:process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const projectRef = process.env.SUPABASE_PROJECT_REF;
if (!projectRef) throw new Error("SUPABASE_PROJECT_REF is required.");

let stdin = "";
for await (const chunk of process.stdin) stdin += chunk;
const decoded = JSON.parse(stdin);
const keys = Array.isArray(decoded) ? decoded : decoded.api_keys ?? decoded.data ?? [];
const keyValue = (entry) => entry.api_key ?? entry.key ?? entry.value;
const serviceEntry = keys.find((entry) =>
  entry.name === "service_role" || entry.type === "secret" || entry.name === "secret");
const anonEntry = keys.find((entry) =>
  entry.name === "anon" || entry.type === "publishable" || entry.name === "publishable");
const serviceKey = serviceEntry && keyValue(serviceEntry);
const anonKey = anonEntry && keyValue(anonEntry);
if (!serviceKey || !anonKey) {
  throw new Error("The project API-key response did not include usable service and anonymous keys.");
}

const url = `https://${projectRef}.supabase.co`;
const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const suffix = randomUUID().slice(0, 12);
const password = `${randomUUID()}Aa1!`;
const adminEmail = `content-integrity-admin-${suffix}@example.invalid`;
const vaEmail = `content-integrity-va-${suffix}@example.invalid`;
let clientId = null;
const authUserIds = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function createAuthUser(email) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error(`Could not create ${email}.`);
  authUserIds.push(data.user.id);
  return data.user.id;
}

try {
  const { data: client, error: clientError } = await admin
    .from("clients")
    .insert({ name: `Content integrity ${suffix}`, slug: `content-integrity-${suffix}` })
    .select("id")
    .single();
  if (clientError || !client) throw clientError ?? new Error("Could not create the test tenant.");
  clientId = client.id;

  const adminId = await createAuthUser(adminEmail);
  const vaId = await createAuthUser(vaEmail);
  // Portal's auth trigger may already create these rows. Upsert makes the
  // fixture correct for both trigger-managed and manually managed projects.
  const { error: userError } = await admin.from("users").upsert([
    { id: adminId, email: adminEmail, full_name: "Integrity admin", role: "client_admin", client_id: clientId },
    { id: vaId, email: vaEmail, full_name: "Integrity VA", role: "va", client_id: clientId },
  ], { onConflict: "id" });
  if (userError) throw userError;

  const { data: project, error: projectError } = await admin
    .from("content_projects")
    .insert({
      client_id: clientId,
      title: "Lease concurrency test",
      status: "active",
      current_step: "generate",
      idea_snapshot: { title: "Lease concurrency test", channel: "linkedin" },
      content_brief: { version: 1, objective: "Verify generation lease integrity" },
      created_by: adminId,
    })
    .select("id")
    .single();
  if (projectError || !project) throw projectError ?? new Error("Could not create the test project.");

  const claimArgs = {
    p_client_id: clientId,
    p_project_id: project.id,
    p_actor_id: adminId,
    p_lease_seconds: 60,
  };
  const [first, second] = await Promise.all([
    admin.rpc("claim_content_project_generation", claimArgs).single(),
    admin.rpc("claim_content_project_generation", claimArgs).single(),
  ]);
  const winners = [first, second].filter((result) => !result.error && result.data?.lease_token);
  const losers = [first, second].filter((result) => result.error);
  assert(winners.length === 1, `Expected one lease winner; found ${winners.length}.`);
  assert(
    losers.length === 1 && ["55P03", "40001"].includes(losers[0].error.code),
    "The overlapping lease request was not rejected with a concurrency error.",
  );

  const leaseToken = winners[0].data.lease_token;
  const { error: renewError } = await admin.rpc("renew_content_project_generation", {
    ...claimArgs,
    p_lease_token: leaseToken,
  });
  if (renewError) throw renewError;
  const { data: released, error: releaseError } = await admin.rpc(
    "release_content_project_generation",
    {
      p_client_id: clientId,
      p_project_id: project.id,
      p_actor_id: adminId,
      p_lease_token: leaseToken,
    },
  );
  if (releaseError) throw releaseError;
  assert(released === true, "The winning lease could not be released.");
  const { data: reclaimed, error: reclaimError } = await admin
    .rpc("claim_content_project_generation", claimArgs)
    .single();
  if (reclaimError || !reclaimed?.lease_token) {
    throw reclaimError ?? new Error("The project could not be claimed after release.");
  }

  const { data: piece, error: pieceError } = await admin
    .from("content_pieces")
    .insert({
      client_id: clientId,
      project_id: project.id,
      content_type: "linkedin",
      title: "RLS lifecycle test",
      body: "A draft that must remain a draft.",
      status: "draft",
      created_by: adminId,
    })
    .select("id")
    .single();
  if (pieceError || !piece) throw pieceError ?? new Error("Could not create the test draft.");

  const va = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await va.auth.signInWithPassword({
    email: vaEmail,
    password,
  });
  if (signInError) throw signInError;
  const { data: visible, error: selectError } = await va
    .from("content_pieces")
    .select("id,status")
    .eq("id", piece.id);
  if (selectError) throw selectError;
  assert(visible?.length === 1, "The tenant VA could not read its own content.");

  await va.from("content_pieces").update({ status: "approved" }).eq("id", piece.id);
  const { data: unchanged, error: readError } = await admin
    .from("content_pieces")
    .select("status")
    .eq("id", piece.id)
    .single();
  if (readError) throw readError;
  assert(unchanged.status === "draft", "A VA bypassed the API and changed the content lifecycle.");

  const { error: vaRpcError } = await admin.rpc("update_content_piece_atomic", {
    p_client_id: clientId,
    p_piece_id: piece.id,
    p_actor_id: vaId,
    p_status: "approved",
  });
  assert(vaRpcError?.code === "42501", "The actor-aware lifecycle RPC did not reject a VA.");

  console.log("PASS: concurrent lease exclusion, renewal/release, tenant read access, and VA lifecycle denial.");
} finally {
  if (clientId) await admin.from("clients").delete().eq("id", clientId);
  for (const id of authUserIds) await admin.auth.admin.deleteUser(id);
}
