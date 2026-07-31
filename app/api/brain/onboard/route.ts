/**
 * POST /api/brain/onboard — effortless onboarding (Brain 2.0, Milestone F).
 *
 * Drafts values for empty, draftable company-profile fields from a required
 * official Brain Context snapshot. The Library is deliberately excluded:
 * generic guidance must never become a company fact.
 *
 * Admins only. Never invents: a field is omitted if the documents don't support it.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { aiGenerateLimiter, tooManyRequests } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { profileGaps } from "@/lib/brain/gaps";
import { chatProvider, chatModel } from "@/lib/brain/llm";
import {
  persistNodeBrainContextSnapshot,
  resolveNodeBrainContext,
} from "@/lib/brain/resolver";

const schema = z.object({ client_id: z.string().uuid() });
const modelDraftSchema = z.object({
  drafts: z.record(z.string(), z.string().trim().min(1).max(4_000)),
});

const PROMPT_VERSION = "brain-onboarding-v2-official-context";

export const POST = withAuth(async (req, { user }) => {
  let raw: unknown;
  try { raw = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;
  if (user.role !== "client_admin" && user.role !== "super_admin") {
    return NextResponse.json({ error: "Only admins can edit the company profile." }, { status: 403 });
  }

  const rl = aiGenerateLimiter.check(`onboard:${user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  const llm = chatProvider();
  const admin = createAdminClient();
  const clientId = parsed.data.client_id;
  const model = llm ? chatModel("BRAIN_DISTILL_MODEL") : null;
  let resolved: Awaited<ReturnType<typeof resolveNodeBrainContext>>;
  try {
    resolved = await resolveNodeBrainContext({
      admin,
      clientId,
      request: {
        surface: "onboard",
        topic: "Complete missing Company DNA fields",
        objective: "Draft missing company facts for administrator review",
        intent: "Use only verified company evidence to draft missing Company DNA fields",
        selectedVaultSourceIds: [],
        includeMarketIntelligence: false,
      },
      model,
      promptVersion: PROMPT_VERSION,
      maxKnowledge: 20,
      maxLibrary: 0,
      maxMemory: 0,
    });
  } catch (error) {
    console.error("[brain/onboard] context", error);
    return NextResponse.json({
      error: "The Brain could not retrieve company evidence. Please try again.",
      code: "BRAIN_CONTEXT_UNAVAILABLE",
      recoverable: true,
    }, { status: 503 });
  }

  let brainContextSnapshotId: string;
  try {
    const snapshot = await persistNodeBrainContextSnapshot({
      admin,
      context: resolved.context,
      artifactKind: "brain_onboarding_draft",
      createdBy: user.id,
    });
    brainContextSnapshotId = snapshot.id;
  } catch (error) {
    console.error("[brain/onboard] snapshot", error);
    return NextResponse.json({
      error: "The Brain could not save its evidence snapshot. Please try again.",
      code: "BRAIN_SNAPSHOT_REQUIRED",
      recoverable: true,
    }, { status: 503 });
  }

  const targets = profileGaps(resolved.context.company.fields).draftableGaps;
  if (targets.length === 0) {
    return NextResponse.json({
      drafts: {},
      complete: true,
      brainContextSnapshotId,
    });
  }

  if (resolved.context.knowledge.sources.length === 0) {
    return NextResponse.json({
      drafts: {},
      noVault: true,
      brainContextSnapshotId,
    });
  }

  if (!llm || !model) {
    return NextResponse.json({
      error: "The Brain's drafting service is temporarily unavailable. Please try again.",
      code: "BRAIN_ONBOARD_AI_UNAVAILABLE",
      recoverable: true,
      brainContextSnapshotId,
    }, { status: 503 });
  }

  const fieldList = targets.map((field) => `- ${field.key}: ${field.question}`).join("\n");
  const companyEvidence = resolved.context.knowledge.sources
    .map((source, index) => `[V${index + 1}] ${source.title}\n${source.excerpt}`)
    .join("\n\n");
  const prompt = [
    "Draft concise values for the missing Company DNA fields below.",
    "Use only facts explicitly supported by COMPANY VAULT EVIDENCE.",
    "Existing Company DNA may disambiguate names or terminology, but it does not support a missing fact by itself.",
    "Omit any field the Vault evidence does not support. Never infer or guess.",
    "",
    "FIELDS TO DRAFT:",
    fieldList,
    "",
    "=== EXISTING COMPANY DNA (REFERENCE ONLY) ===",
    JSON.stringify(resolved.context.company.fields),
    "",
    "=== COMPANY VAULT EVIDENCE ===",
    companyEvidence,
    "",
    'Return JSON: { "drafts": { "<field_key>": "<short value>", ... } }.',
    "Keep each value to 1-3 sentences.",
  ].join("\n");

  let responseContent: string;
  try {
    const res = await fetch(llm.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${llm.key}` },
      body: JSON.stringify({
        model, temperature: 0.3, max_tokens: 1500,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "Draft an accurate company profile strictly from the supplied Company Vault evidence. Never use generic knowledge, invent facts, or fill unsupported fields.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) {
      const providerBody = (await res.text()).slice(0, 1_000);
      console.error("[brain/onboard] provider", llm.provider, res.status, providerBody);
      return NextResponse.json({
        error: "The Brain could not draft the profile right now. Please try again.",
        code: "BRAIN_ONBOARD_PROVIDER_FAILED",
        recoverable: true,
        brainContextSnapshotId,
      }, { status: 502 });
    }
    const json = await res.json() as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("Provider returned no draft content.");
    }
    responseContent = content;
  } catch (e) {
    console.error("[brain/onboard] provider", e);
    return NextResponse.json({
      error: "The Brain could not draft the profile right now. Please try again.",
      code: "BRAIN_ONBOARD_PROVIDER_FAILED",
      recoverable: true,
      brainContextSnapshotId,
    }, { status: 502 });
  }

  let modelDrafts: Record<string, string>;
  try {
    modelDrafts = modelDraftSchema.parse(JSON.parse(responseContent)).drafts;
  } catch (error) {
    console.error("[brain/onboard] invalid response", error);
    return NextResponse.json({
      error: "The Brain returned an incomplete draft. Please retry.",
      code: "BRAIN_ONBOARD_INVALID_RESPONSE",
      recoverable: true,
      brainContextSnapshotId,
    }, { status: 502 });
  }

  const drafts: Record<string, string> = {};
  for (const field of targets) {
    const value = modelDrafts[field.key];
    if (value?.trim()) drafts[field.key] = value.trim();
  }

  return NextResponse.json({
    drafts,
    fields: targets.filter((f) => drafts[f.key]).map((f) => ({ key: f.key, label: f.label })),
    brainContextSnapshotId,
  });
});
