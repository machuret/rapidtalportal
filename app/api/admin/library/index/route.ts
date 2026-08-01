import { NextResponse } from "next/server";
import { withSuperAdmin } from "@/lib/api/with-auth";
import { proxyToEdgeFunction } from "@/lib/edge-proxy";

export const dynamic = "force-dynamic";

export const POST = withSuperAdmin(async (request) => {
  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }
  const versionId = body && typeof body === "object" && "versionId" in body
    && typeof body.versionId === "string" ? body.versionId : undefined;
  const response = await proxyToEdgeFunction("business-library-index", {
    ...(versionId ? { versionId } : {}), limit: 100,
  });
  if (response.status === 401 || response.status === 403) {
    return NextResponse.json({ error: "Library indexing was not authorised." }, { status: response.status });
  }
  return response;
});
