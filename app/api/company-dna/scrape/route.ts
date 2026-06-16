/**
 * POST /api/company-dna/scrape — scrape a company website to draft DNA fields.
 *
 * Guards the call before proxying to the company-dna-scrape edge function:
 * withAuth + Zod + assertClientAccess + an https/private-IP (SSRF) check, so it
 * matches every sibling route. The edge function re-checks role and tenant too.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { proxyToEdgeFunction } from "@/lib/edge-proxy";

const schema = z.object({
  clientId: z.string().uuid(),
  url: z.string().url(),
});

const PRIVATE_IP_RE = /^(localhost|127\.|0\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|::1|fc00:|fe80:)/i;
function isBlockedUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol !== "https:" || PRIVATE_IP_RE.test(u.hostname);
  } catch {
    return true;
  }
}

export const POST = withAuth(async (req: NextRequest, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Provide a client and a valid https URL." }, { status: 422 });

  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;

  if (isBlockedUrl(parsed.data.url)) {
    return NextResponse.json({ error: "Only public https URLs can be scraped." }, { status: 422 });
  }

  return proxyToEdgeFunction("company-dna-scrape", parsed.data);
});
