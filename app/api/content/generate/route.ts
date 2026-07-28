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
import { requireApiAuth } from "@/lib/api-auth";
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
