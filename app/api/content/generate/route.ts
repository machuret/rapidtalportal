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
import {
  contentBriefSchema as structuredBriefSchema,
} from "@/lib/content/project-schema";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureError } from "@/lib/error-tracking";

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
  projectId: z.string().uuid().optional(),
  vaultSourceIds: z.array(z.string().uuid()).max(20).optional(),
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
  const rl = await aiGenerateLimiter.check(`content:${auth.user.id}`);
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
  const response = await proxyToEdgeFunction("content-generate", body);

  // The Edge Function owns generation and draft persistence, but the Next
  // boundary records the outcome even when the Edge runtime or provider is
  // unreachable. This lets the project explain and retry its last operation
  // after a refresh instead of falling back to a misleading empty state.
  if (parsed.data.projectId) {
    const projectId = parsed.data.projectId;
    const responseBody = await response.clone().json().catch(() => ({})) as {
      error?: unknown;
      code?: unknown;
      warnings?: unknown;
    };
    const admin = createAdminClient();
    const operationState = response.ok
      ? {
          last_operation: null,
          last_error_code: null,
          last_error_message: null,
          last_error_at: null,
          last_generation_warnings: Array.isArray(responseBody.warnings)
            ? responseBody.warnings.filter((warning): warning is string =>
                typeof warning === "string").slice(0, 20)
            : [],
        }
      : {
          last_operation: "generate",
          last_error_code: typeof responseBody.code === "string"
            ? responseBody.code.slice(0, 120)
            : `HTTP_${response.status}`,
          last_error_message: typeof responseBody.error === "string"
            ? responseBody.error.slice(0, 2000)
            : "The draft could not be generated.",
          last_error_at: new Date().toISOString(),
          last_generation_warnings: Array.isArray(responseBody.warnings)
            ? responseBody.warnings.filter((warning): warning is string =>
                typeof warning === "string").slice(0, 20)
            : [],
        };
    const { error: operationError } = await admin
      .from("content_projects")
      .update(operationState)
      .eq("id", projectId)
      .eq("client_id", parsed.data.clientId);
    if (operationError) {
      captureError("api", operationError, {
        userId: auth.user.id,
        clientId: parsed.data.clientId,
        url: "/api/content/generate",
      });
    }
  }

  return response;
}
