/**
 * POST /api/vault/crawl — proxy to the vault-crawl edge function.
 * Not unauthenticated despite the thin body: proxyToEdgeFunction verifies the
 * caller via getUser() before forwarding, and the edge function re-checks role
 * and tenant membership (client_id) against the request. Auth is enforced at
 * both hops — do not assume this route is open.
 */
import { NextRequest } from "next/server";
import { proxyToEdgeFunction } from "@/lib/edge-proxy";

export async function POST(req: NextRequest) {
  const body = await req.json();
  return proxyToEdgeFunction("vault-crawl", body);
}
