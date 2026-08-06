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
import { scrapeLimiter, tooManyRequests } from "@/lib/rate-limit";
import { proxyToEdgeFunction } from "@/lib/edge-proxy";
import { isBlockedUrl } from "@/lib/security/ssrf";

const schema = z.object({
  clientId: z.string().uuid(),
  url: z.string().url(),
});

// SSRF guard is shared + hardened in lib/security/ssrf.ts (isBlockedUrl).

export const POST = withAuth(async (req: NextRequest, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Provide a client and a valid https URL." }, { status: 422 });

  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;

  const rl = await scrapeLimiter.check(`dna:${user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  if (isBlockedUrl(parsed.data.url)) {
    return NextResponse.json({ error: "Only public https URLs can be scraped." }, { status: 422 });
  }

  return proxyToEdgeFunction("company-dna-scrape", parsed.data);
});
