/**
 * POST /api/vault/delete — Bulk delete vault items + storage objects.
 * Proxies to vault-delete edge function which handles cross-tenant verification
 * and storage cleanup using the service role key (safe — never client-exposed).
 * Auth: client_admin or super_admin only (enforced by edge function).
 */

import { NextRequest, NextResponse } from "next/server";
import { proxyToEdgeFunction } from "@/lib/edge-proxy";
import { originRejected } from "@/lib/api/csrf";

export async function POST(req: NextRequest) {
  // This route bypasses withAuth (it proxies straight to the edge function, which
  // verifies the JWT + role + cross-tenant ownership), so the CSRF origin check
  // that withAuth applies must be run explicitly here.
  if (originRejected(req)) return NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 });
  const body = await req.json();
  return proxyToEdgeFunction("vault-delete", body);
}
