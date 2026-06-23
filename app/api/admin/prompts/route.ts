/**
 * /api/admin/prompts — admin AI-prompt overrides (super_admin only).
 *
 * GET               → every prompt def + its override state.
 * GET ?slug=&history=1 → saved versions of one prompt (for rollback).
 * PATCH {slug, content} → save an override (+ version snapshot). Saving content
 *                         identical to the code default resets instead.
 * DELETE ?slug=     → reset to the code default.
 */
import { NextResponse } from "next/server";
import { serverError } from "@/lib/api/errors";
import { z } from "zod";
import { withSuperAdmin } from "@/lib/api/with-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PROMPTS, getPromptDef, allowedVariables, referencedVariables } from "@/lib/prompts/registry";
import { bustPromptCache } from "@/lib/prompts/server";

export const dynamic = "force-dynamic";

export const GET = withSuperAdmin(async (req) => {
  const admin = createAdminClient();
  const slug = req.nextUrl.searchParams.get("slug");

  if (slug && req.nextUrl.searchParams.get("history")) {
    if (!getPromptDef(slug)) return NextResponse.json({ error: "Unknown prompt." }, { status: 404 });
    const { data } = await admin
      .from("ai_prompt_versions")
      .select("id, content, saved_by, created_at")
      .eq("slug", slug)
      .order("created_at", { ascending: false })
      .limit(20);
    return NextResponse.json({ versions: data ?? [] });
  }

  const [{ data: overrides }, { data: users }] = await Promise.all([
    admin.from("ai_prompts").select("slug, content, updated_by, updated_at"),
    admin.from("users").select("id, full_name, email"),
  ]);
  const userName = new Map(((users ?? []) as { id: string; full_name: string | null; email: string }[])
    .map((u) => [u.id, u.full_name ?? u.email]));
  const bySlug = new Map(((overrides ?? []) as { slug: string; content: string; updated_by: string | null; updated_at: string }[])
    .map((o) => [o.slug, o]));

  const prompts = PROMPTS.map((p) => {
    const o = bySlug.get(p.slug);
    return {
      slug: p.slug,
      title: p.title,
      group: p.group,
      description: p.description,
      model: p.model,
      variables: p.variables,
      defaultTemplate: p.template,
      override: o?.content ?? null,
      updatedAt: o?.updated_at ?? null,
      updatedBy: o?.updated_by ? userName.get(o.updated_by) ?? null : null,
    };
  });
  return NextResponse.json({ prompts });
});

const patchSchema = z.object({
  slug: z.string().min(1).max(100),
  content: z.string().min(1).max(20000),
});

export const PATCH = withSuperAdmin(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Prompt content is required (max 20,000 chars)." }, { status: 422 });

  const def = getPromptDef(parsed.data.slug);
  if (!def) return NextResponse.json({ error: "Unknown prompt." }, { status: 404 });

  // Catch typos before they silently render as empty text at call time.
  const allowed = allowedVariables(def.slug);
  const unknown = referencedVariables(parsed.data.content).filter((v) => !allowed.has(v));
  if (unknown.length > 0) {
    return NextResponse.json({
      error: `Unknown variable${unknown.length > 1 ? "s" : ""}: ${unknown.map((v) => `[[${v}]]`).join(", ")}. This prompt supports: ${Array.from(allowed).map((v) => `[[${v}]]`).join(", ") || "(none)"}.`,
    }, { status: 422 });
  }

  const admin = createAdminClient();
  const content = parsed.data.content;

  // Saving the default back = reset.
  if (content.trim() === def.template.trim()) {
    await admin.from("ai_prompts").delete().eq("slug", def.slug);
    bustPromptCache(def.slug);
    return NextResponse.json({ ok: true, reset: true });
  }

  const { error } = await admin
    .from("ai_prompts")
    .upsert({ slug: def.slug, content, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: "slug" });
  if (error) return serverError(error);

  // Version snapshot — best-effort, never blocks the save.
  void admin.from("ai_prompt_versions").insert({ slug: def.slug, content, saved_by: user.id })
    .then(({ error: e }) => { if (e) console.warn("[ai_prompt_versions]", e.message); });

  bustPromptCache(def.slug);
  return NextResponse.json({ ok: true });
});

export const DELETE = withSuperAdmin(async (req) => {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug || !getPromptDef(slug)) return NextResponse.json({ error: "Unknown prompt." }, { status: 404 });

  const admin = createAdminClient();
  const { error } = await admin.from("ai_prompts").delete().eq("slug", slug);
  if (error) return serverError(error);
  bustPromptCache(slug);
  return NextResponse.json({ ok: true });
});
