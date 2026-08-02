import { NextResponse } from "next/server";
import { withSuperAdmin } from "@/lib/api/with-auth";
import { serverError } from "@/lib/api/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { businessLibraryTransitionSchema } from "@/lib/business-library/shared";
import { loadBusinessLibraryEntry } from "@/lib/business-library/admin";
import { proxyToEdgeFunction } from "@/lib/edge-proxy";

export const dynamic = "force-dynamic";

type Params = { id: string };

export const POST = withSuperAdmin<Params>(async (request, { user, params }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = businessLibraryTransitionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({
      error: parsed.error.issues[0]?.message ?? "Choose a valid Library action.",
    }, { status: 422 });
  }

  const admin = createAdminClient();
  const { data: versionId, error } = await admin.rpc(
    "transition_business_library_version",
    {
      p_entry_id: params.id,
      p_version_id: parsed.data.versionId,
      p_action: parsed.data.action,
      p_actor_id: user.id,
    },
  );

  if (error) {
    if (
      error.message.includes("Only")
      || error.message.includes("must be reviewed")
      || error.message.includes("not found")
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return serverError(error);
  }

  const entry = await loadBusinessLibraryEntry(admin, params.id);
  if (!entry) {
    return NextResponse.json({ error: "Library entry not found." }, { status: 404 });
  }
  let indexing: "not_requested" | "complete" | "incomplete" | "recoverable_failure" = "not_requested";
  if (parsed.data.action === "publish" && versionId) {
    const indexResponse = await proxyToEdgeFunction("business-library-index", {
      versionId, limit: 100,
    });
    let indexResult: { ok?: boolean; failed?: number; remaining?: number } = {};
    try { indexResult = await indexResponse.json(); } catch { /* unexpected payload is recoverable */ }
    indexing = !indexResponse.ok || (indexResult.failed ?? 0) > 0
      ? "recoverable_failure"
      : (indexResult.remaining ?? 0) > 0
        ? "incomplete"
        : indexResult.ok === true ? "complete" : "recoverable_failure";
  }
  return NextResponse.json({ entry, versionId, indexing });
});
