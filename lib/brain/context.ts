/**
 * The Brain context builder — the ONE place that assembles what every AI surface
 * should know about a client before it generates anything.
 *
 * The Vault is static, indexed knowledge. The Brain is smarter: it layers the
 * company self-model (DNA + the expanded profile fields) on top of Vault
 * highlights AND the feedback it has accumulated — recent approvals/👍 as
 * positive examples, recent rejections/flags/👎 as anti-patterns to avoid. That
 * feedback conditioning is how the Brain "learns from its mistakes" without any
 * model retraining: every generation is steered by what worked and what didn't.
 *
 * 🔒 Invariant: the Brain is sourced only from Vault + DNA + feedback. It must
 * NEVER read Notebook content — Notebook is private to the client/VA and RLS
 * keeps it invisible to RapidTal admins. Do not add a Notebook query here.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Admin = SupabaseClient;

/** Company self-model fields, in the order they're most useful to the model. */
const PROFILE_FIELDS: { key: string; label: string }[] = [
  { key: "company_name", label: "Company" },
  { key: "client_type", label: "Type" },
  { key: "services", label: "Services" },
  { key: "values", label: "Values" },
  { key: "target_demographic", label: "Target demographic" },
  { key: "business_goals", label: "Business goals" },
  { key: "marketing_goals", label: "Marketing goals" },
  { key: "team", label: "Team" },
  { key: "tools_used", label: "Tools they use" },
  { key: "website_content", label: "Website content" },
  { key: "brand_voice", label: "Brand voice & tone" },
  { key: "content_style", label: "Content tone & style" },
  { key: "internal_rules", label: "Internal rules (must follow)" },
];

const PROFILE_SELECT = PROFILE_FIELDS.map((f) => f.key).join(", ");

interface VaultRow { title: string; raw_content: string | null; category: string | null; ai_summary: string | null }
interface TopicRow { title: string; description: string | null; flag_reason: string | null }
interface SignalRow { artifact_text: string; reason: string | null }
interface MemoryRow { kind: string; content: string; scope: { surfaces?: string[] } | null }

const MEMORY_LABELS: Record<string, string> = {
  preference: "Prefer",
  anti_pattern: "Avoid",
  rule: "Rule",
};

export interface BrainContext {
  /** The assembled prompt block to inject into a system/user message. */
  text: string;
  hasProfile: boolean;
  hasVault: boolean;
  /** Counts of the feedback the Brain is conditioning on (for transparency/UI). */
  positives: number;
  negatives: number;
  /** Number of distilled memory lessons applied. */
  memories: number;
  /** Raw example texts, for embedding-based fit scoring (Phase 4). */
  positiveExamples: string[];
  negativeExamples: string[];
}

const VAULT_CHAR_LIMIT = 12000; // ~3k tokens
const MAX_EXAMPLES = 8;

/**
 * Build the Brain context for a client. Pure read; safe to call from any route
 * that has already authorised the caller for this client_id.
 */
export async function buildBrainContext(
  admin: Admin,
  clientId: string,
  opts: { surfaces?: string[] } = {},
): Promise<BrainContext> {
  // Which surfaces this task counts as — used to inject only relevant lessons.
  const taskSurfaces = new Set([...(opts.surfaces ?? ["content"]), "all"]);
  const [dnaRes, vaultRes, posTopicsRes, negTopicsRes, signalsRes, memoryRes] = await Promise.all([
    admin.from("company_dna").select(PROFILE_SELECT).eq("client_id", clientId).maybeSingle(),
    admin
      .from("vault_items")
      .select("title, raw_content, category, ai_summary")
      .eq("client_id", clientId)
      .eq("status", "ready")
      .order("created_at", { ascending: false })
      .limit(30),
    // Positives: topics the client approved — what "good" looks like here.
    admin
      .from("content_topics")
      .select("title, description, flag_reason")
      .eq("client_id", clientId)
      .eq("status", "approved")
      .order("updated_at", { ascending: false })
      .limit(MAX_EXAMPLES),
    // Negatives: topics rejected or flagged as nonsense — what to avoid.
    admin
      .from("content_topics")
      .select("title, description, flag_reason")
      .eq("client_id", clientId)
      .or("status.eq.rejected,flagged.eq.true")
      .order("updated_at", { ascending: false })
      .limit(MAX_EXAMPLES),
    // Cross-surface 👎 signals with reasons — generalised anti-patterns.
    admin
      .from("brain_signals")
      .select("artifact_text, reason")
      .eq("client_id", clientId)
      .eq("rating", -1)
      .order("created_at", { ascending: false })
      .limit(MAX_EXAMPLES),
    // Distilled, curated lessons — the Brain's long-term memory (pinned first).
    admin
      .from("brain_memory")
      .select("kind, content, scope")
      .eq("client_id", clientId)
      .eq("active", true)
      .order("pinned", { ascending: false })
      .order("confidence", { ascending: false })
      .limit(60),
  ]);

  const dna = (dnaRes.data ?? null) as Record<string, unknown> | null;
  const vault = (vaultRes.data ?? []) as VaultRow[];
  const posTopics = (posTopicsRes.data ?? []) as TopicRow[];
  const negTopics = (negTopicsRes.data ?? []) as TopicRow[];
  const negSignals = (signalsRes.data ?? []) as SignalRow[];
  const memoryAll = (memoryRes.data ?? []) as MemoryRow[];
  // Keep only lessons relevant to this task: global (no scope) or overlapping.
  const memory = memoryAll
    .filter((m) => {
      const s = m.scope?.surfaces;
      if (!s || s.length === 0) return true;
      return s.some((x) => taskSurfaces.has(x));
    })
    .slice(0, 40);

  let text = "";
  let hasProfile = false;

  if (dna) {
    let block = "";
    for (const { key, label } of PROFILE_FIELDS) {
      const v = dna[key];
      if (typeof v === "string" && v.trim()) {
        block += `${label}: ${v.trim()}\n`;
      }
    }
    if (block) {
      hasProfile = true;
      text += `=== COMPANY BRAIN PROFILE ===\n${block}\n`;
    }
  }

  if (vault.length > 0) {
    let chars = 0;
    const sorted = [...vault].sort((a, b) => (a.ai_summary && !b.ai_summary ? -1 : !a.ai_summary && b.ai_summary ? 1 : 0));
    let block = "";
    for (const item of sorted) {
      const snippet = item.ai_summary ?? item.raw_content?.slice(0, 3000) ?? "";
      if (!snippet.trim()) continue;
      const entry = `[${item.category?.toUpperCase() ?? "DOC"}] ${item.title}\n${snippet}\n\n`;
      if (chars + entry.length > VAULT_CHAR_LIMIT) break;
      block += entry;
      chars += entry.length;
    }
    if (block) text += `=== VAULT KNOWLEDGE ===\n${block}`;
  }

  // Positive examples — lean into these.
  if (posTopics.length > 0) {
    text += "=== WHAT WORKS HERE (approved before — favour this style/angle) ===\n";
    for (const t of posTopics) {
      text += `• ${t.title}${t.description ? ` — ${t.description.slice(0, 140)}` : ""}\n`;
    }
    text += "\n";
  }

  // Negative examples — explicit anti-patterns the Brain has learned.
  const negatives = [
    ...negTopics.map((t) => `${t.title}${t.flag_reason ? ` (reason: ${t.flag_reason})` : ""}`),
    ...negSignals.map((s) => `${s.artifact_text.slice(0, 120)}${s.reason ? ` (reason: ${s.reason})` : ""}`),
  ];
  if (negatives.length > 0) {
    text += "=== WHAT TO AVOID (rejected/flagged before — do NOT repeat these or anything similar) ===\n";
    for (const n of negatives) text += `• ${n}\n`;
    text += "\n";
  }

  // Distilled memory — the durable lessons learned from feedback over time.
  if (memory.length > 0) {
    text += "=== WHAT THE BRAIN HAS LEARNED (apply these lessons) ===\n";
    for (const m of memory) {
      text += `• ${MEMORY_LABELS[m.kind] ?? "Note"}: ${m.content}\n`;
    }
    text += "\n";
  }

  return {
    text,
    hasProfile,
    hasVault: vault.length > 0,
    positives: posTopics.length,
    negatives: negatives.length,
    memories: memory.length,
    positiveExamples: posTopics.map((t) => `${t.title}${t.description ? ` — ${t.description}` : ""}`),
    negativeExamples: negatives,
  };
}
