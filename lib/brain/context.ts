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
import { selectFields } from "./profile-fields";
import {
  memoryAppliesToSurfaces,
  normalizeBrainScopes,
  signalSurfacesFor,
} from "../../supabase/functions/_shared/brain-surfaces";

type Admin = SupabaseClient;

/** Company self-model fields for prompt injection — the `prompt` concern of the
 * canonical registry (lib/brain/profile-fields.ts), in model-useful order. */
const PROFILE_FIELDS: { key: string; label: string }[] = selectFields("prompt").map((f) => ({
  key: f.key,
  label: f.promptLabel,
}));

const CONTENT_STYLE_FIELDS = [
  { key: "preferred_terms", label: "Preferred words and phrases" },
  { key: "prohibited_terms", label: "Prohibited words and phrases" },
  { key: "emoji_policy", label: "Emoji policy" },
  { key: "humour_policy", label: "Humour policy" },
  { key: "spelling_locale", label: "Spelling and locale" },
  { key: "default_cta_style", label: "Default CTA style" },
  { key: "approved_claims", label: "Approved claims" },
  { key: "prohibited_claims", label: "Prohibited claims" },
] as const;

const PROFILE_SELECT = [
  ...PROFILE_FIELDS.map((f) => f.key),
  ...CONTENT_STYLE_FIELDS.map((f) => f.key),
  "channel_styles",
  "hard_rules",
].join(", ");

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
  opts: { surfaces?: string[]; vaultCharLimit?: number; maxMemory?: number } = {},
): Promise<BrainContext> {
  const vaultCharLimit = opts.vaultCharLimit ?? VAULT_CHAR_LIMIT;
  const maxMemory = opts.maxMemory ?? 40;
  // Use one canonical vocabulary for both short-term signals and durable memory.
  const taskSurfaces = normalizeBrainScopes(opts.surfaces ?? ["content"]);
  const effectiveSurfaces = taskSurfaces.length ? taskSurfaces : normalizeBrainScopes(["content"]);
  const scopedSignalSurfaces = signalSurfacesFor(effectiveSurfaces);
  const today = new Date().toISOString().slice(0, 10);
  const [dnaRes, vaultRes, posTopicsRes, negTopicsRes, signalsRes, memoryRes] = await Promise.all([
    admin.from("company_dna").select(PROFILE_SELECT).eq("client_id", clientId).maybeSingle(),
    admin
      .from("vault_items")
      .select("title, raw_content, category, ai_summary")
      .eq("client_id", clientId)
      .eq("status", "ready")
      .eq("evidence_role", "factual")
      .eq("knowledge_status", "active")
      .eq("has_conflict", false)
      .or(`valid_from.is.null,valid_from.lte.${today}`)
      .or(`valid_until.is.null,valid_until.gte.${today}`)
      .or(`review_due_at.is.null,review_due_at.gt.${today}`)
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
    // Recent 👎 signals only from surfaces relevant to this generation.
    admin
      .from("brain_signals")
      .select("artifact_text, reason")
      .eq("client_id", clientId)
      .eq("rating", -1)
      .in("surface", scopedSignalSurfaces)
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
    .filter((m) => memoryAppliesToSurfaces(m.scope, effectiveSurfaces))
    .slice(0, maxMemory);

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
    const styleBlock = CONTENT_STYLE_FIELDS
      .map(({ key, label }) => {
        const value = dna[key];
        return typeof value === "string" && value.trim() ? `${label}: ${value.trim()}` : "";
      })
      .filter(Boolean)
      .join("\n");
    if (styleBlock) {
      hasProfile = true;
      text += `=== CONTENT STYLE RULES ===\n${styleBlock}\n\n`;
    }
    if (Array.isArray(dna.hard_rules) && dna.hard_rules.length) {
      hasProfile = true;
      text += `=== STRUCTURED CONTENT HARD RULES ===\n${JSON.stringify(dna.hard_rules).slice(0, 6000)}\n\n`;
    }
    const channelStyles = dna.channel_styles;
    if (channelStyles && typeof channelStyles === "object" && !Array.isArray(channelStyles)) {
      const styleLines = Object.entries(channelStyles as Record<string, unknown>)
        .filter(([, value]) => typeof value === "string" && value.trim())
        .map(([channel, value]) => `${channel}: ${(value as string).trim()}`);
      if (styleLines.length) {
        hasProfile = true;
        text += `=== CHANNEL WRITING STYLES ===\n${styleLines.join("\n")}\n\n`;
      }
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
      if (chars + entry.length > vaultCharLimit) break;
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
