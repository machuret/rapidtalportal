/**
 * POST /api/content/generate — proxy to the content-generate edge function.
 * Auth is enforced at both hops: proxyToEdgeFunction verifies the caller via
 * getUser() before forwarding, and the edge function re-checks role and tenant
 * membership (client_id). Not an open route despite the thin body.
 */
import { NextRequest } from "next/server";
import { proxyToEdgeFunction } from "@/lib/edge-proxy";

export async function POST(req: NextRequest) {
  const body = await req.json();
  return proxyToEdgeFunction("content-generate", body);
}
