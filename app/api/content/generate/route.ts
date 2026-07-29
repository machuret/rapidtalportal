/**
 * POST /api/content/generate — proxy to the content-generate edge function.
 * Auth is enforced at both hops: proxyToEdgeFunction verifies the caller via
 * getUser() before forwarding, and the edge function re-checks role and tenant
 * membership (client_id). Not an open route despite the thin body.
 *
 * The Edge Function persists the draft. Style authority comes from Company DNA;
 * generation does not infer brand rules from later performance metrics.
 */
import { NextRequest, NextResponse } from "next/server";
import { proxyToEdgeFunction } from "@/lib/edge-proxy";
import { assertClientAccess, requireApiAuth } from "@/lib/api-auth";
import { originRejected } from "@/lib/api/csrf";
import { aiGenerateLimiter, tooManyRequests } from "@/lib/rate-limit";
import { z } from "zod";

const toneSchema = z.enum([
  "professional",
  "friendly",
  "persuasive",
  "casual",
  "authoritative",
  "warm",
  "direct",
  "playful",
]);
const lengthSchema = z.enum(["short", "medium", "long"]);
const marketIntelligenceSchema = z.object({
  version: z.literal(1),
  runId: z.string().uuid(),
  reportSchemaVersion: z.literal(2),
  ideaTitle: z.string().trim().min(1).max(220),
  confidence: z.enum(["low", "medium", "high"]),
  novelty: z.enum(["new", "adjacent", "overlap"]),
  competitorIds: z.array(z.string().uuid()).min(1).max(12),
  competitorSources: z.array(z.object({
    itemId: z.string().uuid(),
    captureVersionId: z.string().uuid(),
    contentHash: z.string().min(16).max(256),
    competitorId: z.string().uuid(),
    competitorName: z.string().trim().min(1).max(300),
    title: z.string().trim().min(1).max(500),
    url: z.string().url(),
    effectiveAt: z.string().datetime(),
    dateBasis: z.enum(["published", "captured"]),
    evidenceQuote: z.string().trim().min(20).max(500),
  })).min(2).max(12),
  companyReferences: z.array(z.object({
    id: z.string().uuid(),
    kind: z.enum(["content_piece", "vault_item"]),
    title: z.string().trim().min(1).max(500),
    contentHash: z.string().min(16).max(256),
  })).max(12),
  generatedAt: z.string().datetime(),
});
const structuredBriefSchema = z.object({
  version: z.literal(1).default(1),
  objective: z.string().trim().min(3).max(4000),
  audience: z.string().trim().max(1000).optional().nullable(),
  keyPoints: z.array(z.string().trim().min(1).max(1000)).max(20).optional(),
  callToAction: z.string().trim().max(1000).optional().nullable(),
  language: z.string().trim().max(100).optional().nullable(),
  tone: toneSchema,
  length: lengthSchema,
  mode: z.enum(["new", "reply"]).optional(),
  inboundContext: z.string().trim().max(8000).optional().nullable(),
  additionalGuidance: z.string().trim().max(2000).optional().nullable(),
  marketIntelligence: marketIntelligenceSchema.optional().nullable(),
  recipient: z.object({
    id: z.string().uuid().optional().nullable(),
    name: z.string().trim().min(1).max(200),
    company: z.string().trim().max(200).optional().nullable(),
  }).optional().nullable(),
});

const bodySchema = z.object({
  clientId: z.string().uuid(),
  contentType: z.enum([
    "email",
    "x",
    "linkedin",
    "facebook",
    "instagram",
    "newsletter",
    "blog",
    "message",
    "other",
  ]),
  title: z.string().trim().min(1).max(300),
  brief: z.union([structuredBriefSchema, z.string().trim().min(1).max(4000)]),
  tone: toneSchema.optional(),
  length: lengthSchema.optional(),
});

export async function POST(req: NextRequest) {
  // Bypasses withAuth (proxies to the edge function, which verifies JWT + role +
  // tenant), so run withAuth's CSRF origin check explicitly here.
  if (originRejected(req)) return NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 });
  // Content generation is a paid LLM call — rate-limit per caller so it can't be
  // hammered into an unbounded bill. Resolve identity here (the proxy re-verifies).
  const auth = await requireApiAuth();
  if ("error" in auth) return auth.error;
  const rl = aiGenerateLimiter.check(`content:${auth.user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);
  let raw: unknown;
  try { raw = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid content brief." }, { status: 422 });
  }
  const denied = assertClientAccess(auth.user, parsed.data.clientId);
  if (denied) return denied;
  const body = {
    ...parsed.data,
    brief: typeof parsed.data.brief === "string"
      ? {
          version: 1,
          objective: parsed.data.brief,
          tone: parsed.data.tone ?? "professional",
          length: parsed.data.length ?? "medium",
        }
      : parsed.data.brief,
  };
  return proxyToEdgeFunction("content-generate", body);
}
