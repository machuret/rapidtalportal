import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DbCompanyDna } from "@/types/database";
import {
  Brain, BookOpen, CheckCircle2, Circle, Building2, Phone, Mail, Globe,
  MapPin, Target, Users, Archive, Sparkles, AlertTriangle,
} from "lucide-react";
import {
  VAULT_CATEGORIES, VAULT_CATEGORY_ORDER, isVaultCategory,
} from "@/lib/taxonomy/vault-categories";
import { KnowledgeGaps } from "@/components/vault/KnowledgeGaps";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { PageIntro } from "@/components/layout/PageIntro";
import { HealthGroupActions } from "@/components/vault/VaultHealthActions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Company Report — RapidTal" };

type VaultItem = {
  id: string;
  title: string;
  category: string | null;
  ai_summary: string | null;
  tags: string[];
  source_type: string;
  updated_at: string | null;
  content_hash: string | null;
};

export default async function CompanyReportPage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user, client } = ctx;
  if (!user.client_id) redirect("/dashboard");

  const admin = createAdminClient();
  const clientId = user.client_id;

  const [{ data: dnaData }, { data: items }, { count: kbCount }, queriesRes] = await Promise.all([
    admin.from("company_dna").select("*").eq("client_id", clientId).maybeSingle(),
    admin
      .from("vault_items")
      .select("id, title, category, ai_summary, tags, source_type, updated_at, content_hash")
      .eq("client_id", clientId)
      .eq("status", "ready")
      .order("updated_at", { ascending: false }),
    admin.from("kb_entries").select("*", { count: "exact", head: true }).eq("client_id", clientId),
    admin
      .from("vault_queries")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  const dna = (dnaData ?? null) as DbCompanyDna | null;
  const vaultItems = (items ?? []) as VaultItem[];

  // ── Knowledge gaps — questions the brain couldn't answer (from vault_queries) ──
  const queries = (queriesRes.error ? [] : (queriesRes.data ?? [])) as { question: string; answered: boolean; dismissed?: boolean }[];
  const askedTotal = queries.length;
  const answeredTotal = queries.filter((q) => q.answered).length;
  const knowledgeGaps: string[] = [];
  const seenGap = new Set<string>();
  for (const q of queries) {
    if (q.answered || q.dismissed) continue;
    const key = q.question.trim().toLowerCase();
    if (!key || seenGap.has(key)) continue;
    seenGap.add(key);
    knowledgeGaps.push(q.question.trim());
    if (knowledgeGaps.length >= 8) break;
  }

  // Group ready items by (normalised) category
  const byCat: Record<string, VaultItem[]> = {};
  for (const it of vaultItems) {
    const c = isVaultCategory(it.category) ? it.category : "general";
    (byCat[c] ??= []).push(it);
  }
  const indexedCount = vaultItems.filter((i) => i.ai_summary).length;

  // ── Vault health — items worth reviewing so the brain stays accurate ──
  const byHash: Record<string, VaultItem[]> = {};
  for (const it of vaultItems) if (it.content_hash) (byHash[it.content_hash] ??= []).push(it);
  const duplicateItems = Object.values(byHash).filter((g) => g.length > 1).flatMap((g) => g.slice(1));
  const STALE_MS = 90 * 24 * 60 * 60 * 1000;
  const staleItems = vaultItems.filter(
    (it) => it.source_type === "url" && it.updated_at && Date.now() - new Date(it.updated_at).getTime() > STALE_MS,
  );
  const DEMO_RE = /\b(demo|lorem ipsum|placeholder|example\.com|test data|sample)\b/i;
  const demoItems = vaultItems.filter((it) => DEMO_RE.test(it.title) || (it.ai_summary ? DEMO_RE.test(it.ai_summary) : false));
  const healthIssues = duplicateItems.length + staleItems.length + demoItems.length;

  const has = (v?: string | null) => !!(v && v.trim());

  // ── Coverage model — what does the brain know about the company? ──
  const areas = [
    {
      label: "Company identity",
      present: has(dna?.company_name) && (has(dna?.values) || has(dna?.target_demographic)),
      hint: "Complete Company DNA — name, values, target audience.",
    },
    {
      label: "Services & products",
      present: has(dna?.services) || (byCat.service?.length ?? 0) > 0,
      hint: "Add a services document to the Vault, or fill in DNA → Services.",
    },
    {
      label: "Contacts",
      present: has(dna?.phone) || has(dna?.email) || (byCat.contact?.length ?? 0) > 0,
      hint: "Add contact details to DNA, or a contacts/suppliers document.",
    },
    {
      label: "Processes & flows",
      present: (byCat.process?.length ?? 0) > 0,
      hint: "Add SOPs / how-to documents so the brain learns your workflows.",
    },
    {
      label: "Policies",
      present: (byCat.policy?.length ?? 0) > 0,
      hint: "Add policy / guideline documents to the Vault.",
    },
    {
      label: "Reference knowledge",
      present: (byCat.reference?.length ?? 0) > 0 || (byCat.general?.length ?? 0) > 0,
      hint: "Add background material, FAQs, or glossaries.",
    },
  ];
  const covered = areas.filter((a) => a.present).length;
  const pct = Math.round((covered / areas.length) * 100);
  const gaps = areas.filter((a) => !a.present);

  // Identity fields (from Company DNA)
  const identity: { icon: typeof Building2; label: string; value: string | null }[] = [
    { icon: Building2, label: "Company",        value: dna?.company_name ?? null },
    { icon: Users,     label: "Founders",       value: dna?.founders ?? null },
    { icon: MapPin,    label: "Location",       value: dna?.location ?? null },
    { icon: Phone,     label: "Phone",          value: dna?.phone ?? null },
    { icon: Mail,      label: "Email",          value: dna?.email ?? null },
    { icon: Globe,     label: "Website",        value: dna?.website ?? null },
    { icon: Target,    label: "Target audience",value: dna?.target_demographic ?? null },
    { icon: Sparkles,  label: "Client type",    value: dna?.client_type ?? null },
  ];
  const identityKnown = identity.filter((f) => has(f.value));

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
          <Brain className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Company Report</h1>
          <p className="text-zinc-400 text-sm mt-1">
            What the Vault knows about {client?.name ?? "your company"} — the more you add, the more complete it gets.
          </p>
        </div>
      </div>

      <PageIntro id="company-report" />

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <StatCard icon={Archive} tint="text-blue-400" label="Vault items" value={String(vaultItems.length)} />
        <StatCard icon={Sparkles} tint="text-purple-400" label="AI-indexed" value={`${indexedCount}/${vaultItems.length}`} />
        <StatCard icon={BookOpen} tint="text-green-400" label="KB answers" value={String(kbCount ?? 0)} />
        <StatCard icon={Brain} tint="text-amber-400" label="Coverage" value={`${pct}%`} />
      </div>

      {/* Coverage meter */}
      <section className="surface-card p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Knowledge coverage</h2>
          <span className="text-sm text-zinc-400">{covered} of {areas.length} areas</span>
        </div>
        <ProgressBar value={pct} trackClassName="h-2.5 w-full mb-5" barClassName="bg-gradient-to-r from-blue-500 to-purple-500" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2.5">
          {areas.map((a) => (
            <div key={a.label} className="flex items-start gap-2.5">
              {a.present ? (
                <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-zinc-600 mt-0.5 shrink-0" />
              )}
              <div className="min-w-0">
                <p className={a.present ? "text-sm text-zinc-200" : "text-sm text-zinc-400"}>{a.label}</p>
                {!a.present && <p className="text-xs text-zinc-500 mt-0.5">{a.hint}</p>}
              </div>
            </div>
          ))}
        </div>
        {gaps.length > 0 && (
          <p className="text-xs text-zinc-500 mt-5">
            💡 Add the {gaps.length} missing area{gaps.length !== 1 ? "s" : ""} above to make the brain more useful to your VAs.
          </p>
        )}
      </section>

      {/* Knowledge gaps — what the team asked that the brain couldn't answer */}
      {askedTotal > 0 && (
        <section className="surface-card p-6 mb-8">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg font-semibold text-white">Knowledge gaps</h2>
            <span className="text-sm text-zinc-400">{answeredTotal}/{askedTotal} questions answered</span>
          </div>
          <p className="text-xs text-zinc-500 mb-4">
            Questions your team asked that the brain couldn&apos;t answer — add docs covering these to close the gaps.
          </p>
          <KnowledgeGaps
            gaps={knowledgeGaps}
            clientId={clientId}
            canCurate={user.role === "client_admin" || user.role === "super_admin"}
          />
        </section>
      )}

      {/* Vault health — items worth reviewing */}
      {healthIssues > 0 && (
        <section className="surface-card p-6 mb-8">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h2 className="text-lg font-semibold text-white">Vault health</h2>
          </div>
          <p className="text-xs text-zinc-500 mb-4">
            {healthIssues} item{healthIssues !== 1 ? "s" : ""} worth a look so answers stay accurate.
          </p>
          <div className="space-y-4">
            <HealthGroupActions label="Possible demo / placeholder" hint="Looks like seed data — delete if it isn't real." items={demoItems} clientId={clientId} deletable />
            <HealthGroupActions label="Duplicates" hint="Same content as another item — these copies can go." items={duplicateItems} clientId={clientId} deletable />
            <HealthGroupActions label="Possibly stale links" hint="A URL not refreshed in 90+ days — verify it's still accurate." items={staleItems} clientId={clientId} deletable={false} />
          </div>
        </section>
      )}

      {/* Identity */}
      <section className="mb-8">
        <SectionHeader icon={Building2} title="Identity" subtitle="Who the company is" count={identityKnown.length} />
        {identityKnown.length === 0 ? (
          <EmptyHint text="No Company DNA captured yet. Fill in Company DNA to establish the basics." />
        ) : (
          <div className="surface-card p-6 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            {identityKnown.map((f) => (
              <div key={f.label} className="flex items-start gap-3">
                <f.icon className="w-4 h-4 text-zinc-500 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="label-section">{f.label}</p>
                  <p className="text-sm text-zinc-200 break-words">{f.value}</p>
                </div>
              </div>
            ))}
            {has(dna?.values) && <WideField label="Values" value={dna!.values!} />}
            {has(dna?.services) && <WideField label="Services (summary)" value={dna!.services!} />}
          </div>
        )}
      </section>

      {/* Category sections */}
      {VAULT_CATEGORY_ORDER.map((cat) => {
        const list = byCat[cat] ?? [];
        const meta = VAULT_CATEGORIES[cat];
        if (list.length === 0) return null;
        return (
          <section key={cat} className="mb-8">
            <SectionHeader icon={meta.icon} title={meta.fullLabel} subtitle={meta.blurb} count={list.length} />
            <div className="grid grid-cols-1 gap-3">
              {list.map((item) => (
                <div key={item.id} className="surface-card p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <meta.icon className="w-4 h-4 text-zinc-500 shrink-0" />
                    <p className="font-medium text-zinc-100 truncate">{item.title}</p>
                    <span className="text-[10px] uppercase tracking-wide text-zinc-600 ml-auto shrink-0">
                      {item.source_type}
                    </span>
                  </div>
                  {item.ai_summary ? (
                    <p className="text-sm text-zinc-400 leading-relaxed">{item.ai_summary}</p>
                  ) : (
                    <p className="text-xs text-amber-500/80 italic">
                      Awaiting AI summary — reprocess this item in the Vault to add it to the brain.
                    </p>
                  )}
                  {item.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {item.tags.slice(0, 8).map((t) => (
                        <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {vaultItems.length === 0 && (
        <EmptyHint text="The Vault is empty. Add documents, paste text, or import a URL — each item makes this report richer." />
      )}
    </div>
  );
}

/* ── Small presentational helpers ────────────────────────────────────── */

function StatCard({ icon: Icon, tint, label, value }: { icon: typeof Brain; tint: string; label: string; value: string }) {
  return (
    <div className="surface-card px-5 py-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 shrink-0 ${tint}`} />
        <span className="label-section">{label}</span>
      </div>
      <p className="stat-value text-white">{value}</p>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, subtitle, count }: { icon: typeof Brain; title: string; subtitle: string; count: number }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className="w-9 h-9 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-zinc-300" />
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="text-lg font-semibold text-white leading-tight">{title}</h2>
        <p className="text-xs text-zinc-500">{subtitle}</p>
      </div>
      <span className="text-sm font-semibold text-zinc-400 shrink-0">{count}</span>
    </div>
  );
}

function WideField({ label, value }: { label: string; value: string }) {
  return (
    <div className="sm:col-span-2">
      <p className="label-section">{label}</p>
      <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap break-words">{value}</p>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/50 p-8 text-center">
      <p className="text-sm text-zinc-500">{text}</p>
    </div>
  );
}
