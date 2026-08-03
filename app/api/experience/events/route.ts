import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientExperienceLimiter, tooManyRequests } from "@/lib/rate-limit";
import { CLIENT_EXPERIENCE_EVENTS } from "@/lib/client-experience";
import type { Json } from "@/types/database";
import { CLIENT_DISCOVERY_KINDS } from "@/lib/discovery/types";

const MAX_BATCH_SIZE = 20;
const destinationSources = [
  "command_palette_search", "command_palette_goal", "command_palette_no_match",
  "guide_goal", "guide_article",
] as const;
const metadataSchemas: Record<(typeof CLIENT_EXPERIENCE_EVENTS)[number], z.ZodTypeAny> = {
  page_ready: z.object({ stage: z.literal("route_shell") }).strict(),
  feature_ready: z.object({ feature: z.string().regex(/^[a-z0-9_:-]+$/).max(80) }).strict(),
  feature_error: z.object({ feature: z.string().regex(/^[a-z0-9_:-]+$/).max(80) }).strict(),
  page_slow: z.object({}).strict(),
  page_retry: z.object({ from: z.enum(["error", "loading"]).optional() }).strict(),
  page_error: z.object({ hasReference: z.boolean().optional() }).strict(),
  navigation_search_opened: z.object({ source: z.literal("command_palette") }).strict(),
  navigation_destination_opened: z.object({
    source: z.enum(destinationSources),
    query_token_count: z.number().int().min(0).max(50),
    result_count: z.number().int().min(0).max(100),
    result_kind: z.enum(["destination", ...CLIENT_DISCOVERY_KINDS]).optional(),
  }).strict(),
  guide_search_used: z.object({
    source: z.enum(["guide", "navigation_handoff"]),
    query_token_count: z.number().int().min(1).max(50),
    result_count: z.number().int().min(0).max(100),
  }).strict(),
  contextual_help_opened: z.object({ source: z.literal("floating_help") }).strict(),
};

const eventSchema = z.object({
  eventType: z.enum(CLIENT_EXPERIENCE_EVENTS),
  path: z.string().startsWith("/").max(300),
  targetPath: z.string().startsWith("/").max(300).optional(),
  durationMs: z.number().int().min(0).max(300_000).optional(),
  metadata: z.record(z.string().max(80), z.unknown()).optional(),
  eventId: z.string().uuid().optional(),
  navigationId: z.string().uuid().optional(),
  interactionId: z.string().uuid().optional(),
  attempt: z.number().int().min(0).max(20).optional(),
}).strict().superRefine((value, context) => {
  const metadata = metadataSchemas[value.eventType].safeParse(value.metadata ?? {});
  if (!metadata.success) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["metadata"], message: "Invalid metadata for this event." });
  }
  if (value.eventType === "navigation_destination_opened") {
    if (!value.targetPath || !value.interactionId || !value.navigationId) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Destination events require a correlated target." });
    }
  } else if (value.targetPath || value.interactionId) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Only destination events accept a target interaction." });
  }
});

const requestSchema = z.union([
  eventSchema.transform((event) => [event]),
  z.object({ events: z.array(eventSchema).min(1).max(MAX_BATCH_SIZE) }).strict().transform(({ events }) => events),
]);

const STATIC_CLIENT_PATHS = [
  "/dashboard", "/team", "/reports", "/crm", "/vault", "/lead-generation",
  "/content/quick", "/content/ideas", "/content/competitors", "/content/projects",
  "/content/library", "/content/style", "/content", "/compose",
  "/company-dna/competitors", "/company-dna", "/competitors",
  "/brain/analytics", "/brain/learning", "/brain", "/brain-analytics", "/company-report",
  "/supervision", "/ask", "/tasks", "/messages",
  "/notebook", "/daily-log", "/my-job", "/sops", "/tools", "/guide", "/profile", "/access",
].sort((left, right) => right.length - left.length);

/** Keep only known product routes. Query strings and arbitrary dynamic
 * segments are discarded before persistence, so paths cannot become a covert
 * field for client-entered text. */
function canonicalPortalPath(rawPath: string): string | null {
  if (!rawPath.startsWith("/") || rawPath.startsWith("//")) return null;
  let pathname: string;
  try { pathname = new URL(rawPath, "https://portal.invalid").pathname; } catch { return null; }
  pathname = pathname.replace(/\/+$/, "") || "/";
  const exact = STATIC_CLIENT_PATHS.find((path) => pathname === path);
  if (exact) return exact;
  const parent = STATIC_CLIENT_PATHS.find((path) => pathname.startsWith(`${path}/`));
  return parent ? `${parent}/:item` : null;
}

export const POST = withAuth(async (request, { user }) => {
  if (!user.client_id) return new NextResponse(null, { status: 204 });

  const rate = await clientExperienceLimiter.check(`experience:${user.id}`);
  if (!rate.allowed) return tooManyRequests(rate.retryAfterSeconds);

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid experience event." }, { status: 422 });

  const rows = [];
  const actorRole: "client_admin" | "va" | "super_admin" | "unknown" = user.role === "client_admin" || user.role === "va" || user.role === "super_admin"
    ? user.role
    : "unknown";
  for (const event of parsed.data) {
    const path = canonicalPortalPath(event.path);
    const targetPath = event.targetPath ? canonicalPortalPath(event.targetPath) : null;
    if (!path || (event.targetPath && !targetPath)) {
      return NextResponse.json({ error: "Invalid experience route." }, { status: 422 });
    }
    const metadata = metadataSchemas[event.eventType].parse(event.metadata ?? {}) as Json;
    rows.push({
      id: event.eventId ?? crypto.randomUUID(),
      client_id: user.client_id,
      user_id: user.id,
      actor_role: actorRole,
      event_type: event.eventType,
      path,
      target_path: targetPath,
      duration_ms: event.durationMs ?? null,
      metadata,
      navigation_id: event.navigationId ?? null,
      interaction_id: event.interactionId ?? null,
      attempt: event.attempt ?? 0,
    });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("portal_experience_events")
    .upsert(rows, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw error;

  return new NextResponse(null, { status: 204 });
});
