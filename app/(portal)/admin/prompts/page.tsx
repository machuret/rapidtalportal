import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PROMPTS } from "@/lib/prompts/registry";
import { PromptsManager, type PromptRow } from "@/components/admin/PromptsManager";
import { SlidersHorizontal } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI Prompts — RapidTal" };

export default async function AdminPromptsPage() {
  await requireSuperAdmin();

  const admin = createAdminClient();
  const [{ data: overrides }, { data: users }] = await Promise.all([
    admin.from("ai_prompts").select("slug, content, updated_by, updated_at"),
    admin.from("users").select("id, full_name, email"),
  ]);
  const userName = new Map(((users ?? []) as { id: string; full_name: string | null; email: string }[])
    .map((u) => [u.id, u.full_name ?? u.email]));
  const bySlug = new Map(((overrides ?? []) as { slug: string; content: string; updated_by: string | null; updated_at: string }[])
    .map((o) => [o.slug, o]));

  const prompts: PromptRow[] = PROMPTS.map((p) => {
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

  return (
    <div className="max-w-6xl">
      <AdminPageHeader icon={SlidersHorizontal} gradient="from-violet-500 to-purple-600 shadow-violet-500/20"
        title="AI Prompts"
        subtitle="Every system prompt behind the VA features. Edit one and it goes live within seconds — no deploy. Reset returns to the built-in default." />

      <PromptsManager initial={prompts} />
    </div>
  );
}
