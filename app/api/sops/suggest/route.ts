/**
 * POST /api/sops/suggest — topic → 3-5 SOP framings to choose from.
 * Lets the author steer the angle before generating the full SOP. Admin-only.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { sopAiLimiter, tooManyRequests } from "@/lib/rate-limit";
import { authorizeSopScope, clientContext, llmJson, SUGGEST_MODEL } from "@/lib/sops/ai";

const schema = z.object({
  topic: z.string().min(3).max(300),
  category: z.string().max(100).optional(),
  clientId: z.string().uuid().nullable().optional(),
});

interface Suggestion { title: string; scope: string; stepCount: number }

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Enter a topic (3+ characters)." }, { status: 422 });

  const clientId = parsed.data.clientId ?? null;
  const denied = authorizeSopScope(user, clientId);
  if (denied) return denied;

  const rl = sopAiLimiter.check(`sop-ai:${user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  const ctx = await clientContext(clientId);
  const system = `You help an operations lead frame Standard Operating Procedures before writing them. Given a topic, propose 3-5 DISTINCT angles a useful SOP could take — different scopes, not reworded duplicates. Return JSON: {"suggestions":[{"title":"concise SOP title","scope":"one line on what it covers","stepCount":<realistic integer>}]}. Titles are specific and action-oriented. No prose outside the JSON.${ctx}`;
  const result = await llmJson<{ suggestions: Suggestion[] }>(
    SUGGEST_MODEL,
    system,
    `Topic: ${parsed.data.topic}${parsed.data.category ? `\nCategory: ${parsed.data.category}` : ""}`,
    900,
  );

  if (!result.data?.suggestions?.length) {
    return NextResponse.json({ error: result.error ?? "Couldn't generate suggestions. Try rephrasing the topic." }, { status: 502 });
  }

  const suggestions = result.data.suggestions
    .filter((s) => s.title?.trim())
    .slice(0, 5)
    .map((s) => ({ title: String(s.title).slice(0, 200), scope: String(s.scope ?? "").slice(0, 300), stepCount: Math.min(40, Math.max(1, Number(s.stepCount) || 6)) }));

  return NextResponse.json({ suggestions });
}, { roles: ["client_admin", "super_admin"] });
