"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BrainFeedback } from "@/components/brain/BrainFeedback";
import { LocalTime } from "@/components/ui/LocalTime";
import { cn } from "@/lib/utils";
import {
  Wand2, Loader2, Copy, Check, RefreshCw, Reply, Mail, MessageSquare, Megaphone,
  FileText, Bookmark, Trash2, Sparkles, Users, ChevronDown, X, ShieldCheck, AlertTriangle,
} from "lucide-react";

export interface ComposeContact { id: string; name: string; company: string | null; email: string | null }

interface Source { n: number; kind: string; kindLabel: string; title: string; itemId: string | null }
interface AskResponse { answer: string; sources: Source[] }

type Channel = "email" | "message" | "social" | "other";
type Mode = "new" | "reply";

// Built-in starting points — one click pre-fills channel, tone and a brief.
const TEMPLATES: { id: string; label: string; channel: Channel; tone: string; task: string }[] = [
  { id: "booking", label: "Booking confirmation", channel: "email", tone: "Warm", task: "Confirm a customer's booking. Thank them, restate the key details (what, date, people, price), and add what happens next." },
  { id: "refund", label: "Refund / apology", channel: "email", tone: "Professional", task: "Apologise for an issue and explain the refund or resolution clearly and reassuringly." },
  { id: "followup", label: "Follow-up", channel: "email", tone: "Friendly", task: "Follow up with a prospect who enquired but hasn't booked yet — gentle nudge, offer to help, restate the value." },
  { id: "quote", label: "Quote / proposal", channel: "email", tone: "Professional", task: "Send a clear quote for the requested service, including what's included and the next step to proceed." },
  { id: "review", label: "Review request", channel: "message", tone: "Friendly", task: "Ask a happy customer to leave a review, briefly and warmly, with a clear link placeholder." },
  { id: "welcome", label: "Welcome / onboarding", channel: "email", tone: "Warm", task: "Welcome a new customer, set expectations, and tell them how to get started or reach us." },
  { id: "announce", label: "Social announcement", channel: "social", tone: "Playful", task: "Announce a new offer or update in an engaging social post." },
];

const LANGUAGES = ["Auto", "English", "Spanish", "French", "Portuguese", "German", "Italian", "Dutch"] as const;

const CHANNELS: { id: Channel; label: string; icon: typeof Mail }[] = [
  { id: "email", label: "Email", icon: Mail },
  { id: "message", label: "Message", icon: MessageSquare },
  { id: "social", label: "Social post", icon: Megaphone },
  { id: "other", label: "Other", icon: FileText },
];

const PLATFORMS: { id: string; label: string; limit: number }[] = [
  { id: "X", label: "X / Twitter", limit: 280 },
  { id: "LinkedIn", label: "LinkedIn", limit: 3000 },
  { id: "Instagram", label: "Instagram", limit: 2200 },
  { id: "Facebook", label: "Facebook", limit: 2000 },
];

const TONES = ["Friendly", "Professional", "Warm", "Direct", "Playful"] as const;
const LENGTHS: { id: string; label: string; hint: string }[] = [
  { id: "short", label: "Short", hint: "2–4 short sentences" },
  { id: "standard", label: "Standard", hint: "a few concise paragraphs" },
  { id: "detailed", label: "Detailed", hint: "thorough and well-structured" },
];

interface Variant { text: string; loading: boolean; sources: Source[] }
interface SavedDraft { id: string; label: string; text: string; ts: number }

function splitEmail(text: string): { subject: string | null; body: string } {
  const m = text.match(/^\s*subject:\s*(.+?)\r?\n([\s\S]*)$/i);
  return m ? { subject: m[1].trim(), body: m[2].trim() } : { subject: null, body: text };
}

/** Stream a draft from /api/vault/ask-stream, calling onText with the growing text. */
async function streamDraft(
  clientId: string,
  question: string,
  history: { question: string; answer: string }[],
  onText: (t: string) => void,
): Promise<{ ok: boolean; text: string; sources: Source[] }> {
  let text = "";
  let sources: Source[] = [];
  try {
    const res = await fetch("/api/vault/ask-stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, question, history }),
    });
    if (!res.ok || !res.body) return { ok: false, text: "", sources: [] };
    const sh = res.headers.get("X-Vault-Sources");
    if (sh) { try { sources = JSON.parse(decodeURIComponent(escape(atob(sh)))); } catch { /* ignore */ } }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const l = line.trim();
        if (!l.startsWith("data:")) continue;
        const d = l.slice(5).trim();
        if (d === "[DONE]") continue;
        try { const delta = JSON.parse(d)?.choices?.[0]?.delta?.content; if (delta) { text += delta; onText(text); } }
        catch { /* partial */ }
      }
    }
    return { ok: text.length > 0, text, sources };
  } catch {
    return { ok: false, text: "", sources: [] };
  }
}

export function ComposeClient({
  clientId, companyName, brandVoice, signOff, contacts = [],
}: {
  clientId: string;
  companyName: string;
  brandVoice?: string | null;
  signOff?: string | null;
  contacts?: ComposeContact[];
}) {
  const [mode, setMode] = useState<Mode>("new");
  const [channel, setChannel] = useState<Channel>("email");
  const [platform, setPlatform] = useState(PLATFORMS[0].id);
  const [tone, setTone] = useState<string>("Professional");
  const [length, setLength] = useState("standard");
  const [language, setLanguage] = useState<string>("Auto");
  const [count, setCount] = useState<1 | 3>(1);

  const [task, setTask] = useState("");
  const [inbound, setInbound] = useState("");
  const [guidance, setGuidance] = useState("");

  // Recipient personalization (optional; can pick from CRM).
  const [recipient, setRecipient] = useState<ComposeContact | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");

  const [variants, setVariants] = useState<Variant[]>([]);
  const [active, setActive] = useState(0);
  const [lastInstruction, setLastInstruction] = useState("");
  const [refine, setRefine] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const [saved, setSaved] = useState<SavedDraft[]>([]);
  const storeKey = `compose-drafts:${clientId}`;

  // Fact-safety check (per active variant index → result)
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<{ idx: number; unverified: string[] } | null>(null);
  const [promoting, setPromoting] = useState(false);

  useEffect(() => {
    try { setSaved(JSON.parse(localStorage.getItem(storeKey) ?? "[]")); } catch { /* ignore */ }
  }, [storeKey]);

  const busy = variants.some((v) => v.loading);
  const platformMeta = PLATFORMS.find((p) => p.id === platform)!;
  const limit = channel === "social" ? platformMeta.limit : null;

  // ── Prompt building ──────────────────────────────────────────────────────
  function channelNoun(): string {
    if (channel === "email") return "email";
    if (channel === "social") return `${platform} post`;
    if (channel === "message") return "message";
    return "message";
  }
  function constraints(): string {
    const lengthHint = LENGTHS.find((l) => l.id === length)!.hint;
    const parts = [`Tone: ${tone}.`, `Length: ${lengthHint}.`];
    if (channel === "email") parts.push("Start with a single line 'Subject: <concise subject>', then a blank line, then the email body.");
    if (channel === "social") parts.push(`Keep it under ${limit} characters. Add 2–4 relevant hashtags at the end.`);
    if (channel === "message") parts.push("Keep it conversational and brief, suitable for a chat/WhatsApp message.");
    if (language === "Auto") {
      if (mode === "reply") parts.push("Reply in the same language the customer wrote in.");
    } else {
      parts.push(`Write it in ${language}.`);
    }
    if (recipient?.name) parts.push(`Address the recipient by name: ${recipient.name}${recipient.company ? ` (${recipient.company})` : ""}.`);
    if (brandVoice?.trim()) parts.push(`Match this brand voice: ${brandVoice.trim()}`);
    if (signOff?.trim()) parts.push(`Sign off as: ${signOff.trim()}`);
    return parts.join(" ");
  }
  function baseInstruction(): string {
    const noun = channelNoun();
    if (mode === "reply") {
      return `A customer or contact sent ${companyName} this message:
"""
${inbound.trim()}
"""
${guidance.trim() ? `Extra guidance for the reply: ${guidance.trim()}\n` : ""}Draft a helpful, professional ${noun} reply on behalf of ${companyName}, in our voice and tone, addressing their specific questions using our real services, details and policies from the company knowledge. ${constraints()} Plain text only — no markdown. If a specific detail isn't in our knowledge, leave a clear [placeholder] instead of inventing it. Output only the reply.`;
    }
    return `You are drafting a ${noun} on behalf of ${companyName}.
Task: ${task.trim()}

Write a polished, ready-to-send ${noun} in ${companyName}'s voice, using our real services, details and policies from the company knowledge. ${constraints()} Plain text only — no markdown. If a specific detail (a name, date or price) isn't in our knowledge, leave a clear [placeholder] instead of inventing it. Output only the draft.`;
  }

  const canCompose = mode === "new" ? task.trim().length >= 5 : inbound.trim().length >= 5;

  async function compose() {
    if (busy || !canCompose) return;
    const instruction = baseInstruction();
    setLastInstruction(instruction);
    setActive(0);
    setRefine("");

    if (count === 1) {
      setVariants([{ text: "", loading: true, sources: [] }]);
      const r = await streamDraft(clientId, instruction, [], (t) =>
        setVariants([{ text: t, loading: true, sources: [] }]));
      if (r.ok) setVariants([{ text: r.text, loading: false, sources: r.sources }]);
      else {
        // Fallback to non-streaming.
        try {
          const res = await api.post<AskResponse>(ROUTES.vault.ask(), { clientId, question: instruction });
          setVariants([{ text: res.answer, loading: false, sources: res.sources ?? [] }]);
        } catch { setVariants([]); }
      }
    } else {
      setVariants([0, 1, 2].map(() => ({ text: "", loading: true, sources: [] })));
      const nudge = ["", "\n\nGive a distinctly different angle from a standard version.", "\n\nTake a third, noticeably different approach in structure and wording."];
      await Promise.all([0, 1, 2].map(async (i) => {
        try {
          const res = await api.post<AskResponse>(ROUTES.vault.ask(), { clientId, question: instruction + nudge[i] });
          setVariants((prev) => prev.map((v, idx) => (idx === i ? { text: res.answer, loading: false, sources: res.sources ?? [] } : v)));
        } catch {
          setVariants((prev) => prev.map((v, idx) => (idx === i ? { ...v, loading: false, text: "Couldn't generate this option." } : v)));
        }
      }));
    }
  }

  async function doRefine() {
    if (refine.trim().length < 2 || busy || !variants[active]) return;
    const instruction = `Refine the draft based on this instruction, keeping it ready to send and respecting the same channel and tone: ${refine.trim()}`;
    const history = [{ question: lastInstruction, answer: variants[active].text }];
    setRefine("");
    setVariants((prev) => prev.map((v, i) => (i === active ? { ...v, loading: true } : v)));
    const r = await streamDraft(clientId, instruction, history, (t) =>
      setVariants((prev) => prev.map((v, i) => (i === active ? { ...v, text: t } : v))));
    setVariants((prev) => prev.map((v, i) => (i === active ? { text: r.ok ? r.text : v.text, loading: false, sources: r.sources.length ? r.sources : v.sources } : v)));
  }

  async function copyText(key: string, text: string) {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(key);
    toast.success("Copied to clipboard.");
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
  }

  function saveDraft() {
    const cur = variants[active];
    if (!cur?.text) return;
    const label = (channel === "email" ? splitEmail(cur.text).subject : null)
      ?? cur.text.split("\n").find(Boolean)?.slice(0, 60) ?? "Draft";
    const entry: SavedDraft = { id: `${Date.now()}`, label, text: cur.text, ts: Date.now() };
    const next = [entry, ...saved].slice(0, 20);
    setSaved(next);
    try { localStorage.setItem(storeKey, JSON.stringify(next)); } catch { /* ignore */ }
    toast.success("Draft saved.");
  }
  function removeSaved(id: string) {
    const next = saved.filter((s) => s.id !== id);
    setSaved(next);
    try { localStorage.setItem(storeKey, JSON.stringify(next)); } catch { /* ignore */ }
  }
  function restore(d: SavedDraft) {
    setVariants([{ text: d.text, loading: false, sources: [] }]);
    setActive(0);
  }

  async function checkDraft() {
    const cur = variants[active];
    if (!cur?.text || checking) return;
    setChecking(true);
    setCheckResult(null);
    try {
      const context = [task, inbound, guidance].filter(Boolean).join("\n");
      const r = await api.post<{ unverified: string[] }>(ROUTES.vault.verify(),
        { clientId, text: cur.text, context }, { showErrorToast: false });
      setCheckResult({ idx: active, unverified: r.unverified });
    } catch {
      toast.error("Couldn't run the check.");
    } finally {
      setChecking(false);
    }
  }

  async function promoteToContent() {
    const cur = variants[active];
    if (!cur?.text || promoting) return;
    setPromoting(true);
    try {
      const e = channel === "email" ? splitEmail(cur.text) : null;
      const title = e?.subject ?? cur.text.split("\n").find(Boolean)?.slice(0, 120) ?? "Untitled draft";
      const content_type = channel === "social" ? "social" : channel === "email" ? "email" : "other";
      await api.post(ROUTES.content.pieces(), {
        client_id: clientId, content_type, title, brief: task || guidance || null, body: cur.text,
      });
      toast.success("Saved to Content as a draft — review & approve it there.");
    } catch { /* api-client toasts */ } finally {
      setPromoting(false);
    }
  }

  function applyTemplate(t: typeof TEMPLATES[number]) {
    setMode("new");
    setChannel(t.channel);
    setTone(t.tone);
    setTask(t.task);
  }

  const filteredContacts = pickerQuery.trim()
    ? contacts.filter((c) => `${c.name} ${c.company ?? ""}`.toLowerCase().includes(pickerQuery.toLowerCase())).slice(0, 8)
    : contacts.slice(0, 8);

  const current = variants[active];
  const email = current && channel === "email" ? splitEmail(current.text) : null;
  const charCount = current ? (email?.body ?? current.text).length : 0;

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
          <Wand2 className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Compose</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Channel-aware drafts in {companyName}&apos;s voice — pick a format, tone and length, get options to choose from.
          </p>
        </div>
      </div>

      {/* Mode */}
      <div className="flex gap-1.5 mb-4">
        {([["new", "New draft", Wand2], ["reply", "Reply to a message", Reply]] as const).map(([m, label, Icon]) => (
          <button key={m} onClick={() => setMode(m)}
            className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
              mode === m ? "bg-zinc-700 text-white border-zinc-700" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200")}>
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* Channel */}
      <p className="label-section mb-1.5">Channel</p>
      <div className="flex gap-1.5 flex-wrap mb-3">
        {CHANNELS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setChannel(id)}
            className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
              channel === id ? "bg-zinc-700 text-white border-zinc-700" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200")}>
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* Platform (social only) */}
      {channel === "social" && (
        <div className="flex gap-1.5 flex-wrap mb-3">
          {PLATFORMS.map((p) => (
            <button key={p.id} onClick={() => setPlatform(p.id)}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
                platform === p.id ? "bg-zinc-700 text-white border-zinc-700" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200")}>
              {p.label} <span className="text-zinc-500">· {p.limit}</span>
            </button>
          ))}
        </div>
      )}

      {/* Tone + length + language + count */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div>
          <p className="label-section mb-1.5">Tone</p>
          <select value={tone} onChange={(e) => setTone(e.target.value)} className="w-full h-9 rounded-md border border-zinc-700 bg-zinc-800 text-zinc-100 px-3 text-sm">
            {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <p className="label-section mb-1.5">Length</p>
          <select value={length} onChange={(e) => setLength(e.target.value)} className="w-full h-9 rounded-md border border-zinc-700 bg-zinc-800 text-zinc-100 px-3 text-sm">
            {LENGTHS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </div>
        <div>
          <p className="label-section mb-1.5">Language</p>
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full h-9 rounded-md border border-zinc-700 bg-zinc-800 text-zinc-100 px-3 text-sm">
            {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <p className="label-section mb-1.5">Options</p>
          <div className="flex gap-1.5">
            {([1, 3] as const).map((n) => (
              <button key={n} onClick={() => setCount(n)}
                className={cn("flex-1 h-9 rounded-md border text-sm font-medium transition-colors",
                  count === n ? "bg-zinc-700 text-white border-zinc-700" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200")}>
                {n === 1 ? "1" : "3"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Recipient (optional, personalizes the draft) */}
      <div className="relative mb-4">
        {recipient ? (
          <div className="inline-flex items-center gap-2 px-3 h-9 rounded-md border border-zinc-700 bg-zinc-800 text-sm text-zinc-200">
            <Users className="w-3.5 h-3.5 text-zinc-400" />
            To: {recipient.name}{recipient.company ? ` · ${recipient.company}` : ""}
            <button onClick={() => setRecipient(null)} className="text-zinc-500 hover:text-white"><X className="w-3.5 h-3.5" /></button>
          </div>
        ) : contacts.length > 0 ? (
          <>
            <button onClick={() => setPickerOpen((o) => !o)}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md border border-zinc-700 bg-zinc-800 text-sm text-zinc-400 hover:text-zinc-200">
              <Users className="w-3.5 h-3.5" /> Personalize for a contact <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {pickerOpen && (
              <div className="absolute z-10 mt-1 w-72 rounded-lg border border-zinc-700 bg-zinc-900 shadow-lg p-2">
                <Input value={pickerQuery} onChange={(e) => setPickerQuery(e.target.value)} placeholder="Search contacts…"
                  className="bg-zinc-800 border-zinc-700 h-8 text-sm mb-1.5" />
                <div className="max-h-56 overflow-y-auto flex flex-col">
                  {filteredContacts.length === 0 ? (
                    <p className="text-xs text-zinc-500 px-2 py-3 text-center">No matches.</p>
                  ) : filteredContacts.map((c) => (
                    <button key={c.id} onClick={() => { setRecipient(c); setPickerOpen(false); setPickerQuery(""); }}
                      className="text-left px-2 py-1.5 rounded hover:bg-zinc-800 text-sm text-zinc-200">
                      {c.name}{c.company ? <span className="text-zinc-500"> · {c.company}</span> : ""}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>

      {/* Templates (new draft only) */}
      {mode === "new" && (
        <div className="mb-3">
          <p className="label-section mb-1.5">Start from a template</p>
          <div className="flex gap-1.5 flex-wrap">
            {TEMPLATES.map((t) => (
              <button key={t.id} onClick={() => applyTemplate(t)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-600 hover:text-white transition-colors">
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      {mode === "new" ? (
        <Textarea value={task} onChange={(e) => setTask(e.target.value)} rows={3}
          placeholder="e.g. Confirm a customer's booking for the A Strait Day tour, 2 people, next Saturday."
          className="bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 mb-3" />
      ) : (
        <>
          <label className="label-section mb-1.5 block">Paste the message you received</label>
          <Textarea value={inbound} onChange={(e) => setInbound(e.target.value)} rows={5}
            placeholder="Paste the customer's email or message here…"
            className="bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 mb-3" />
          <Input value={guidance} onChange={(e) => setGuidance(e.target.value)}
            placeholder="Optional: how to handle it — e.g. offer the 2-day tour, be apologetic…"
            className="bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 mb-3" />
        </>
      )}

      <Button onClick={compose} disabled={busy || !canCompose} className="gap-1.5">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {mode === "reply" ? "Draft reply" : "Draft it"}{count === 3 ? " ×3" : ""}
      </Button>

      {/* Output */}
      {variants.length > 0 && (
        <div className="mt-6">
          {/* Variation tabs */}
          {variants.length > 1 && (
            <div className="flex gap-1.5 mb-3">
              {variants.map((v, i) => (
                <button key={i} onClick={() => setActive(i)}
                  className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors inline-flex items-center gap-1.5",
                    active === i ? "bg-zinc-700 text-white border-zinc-700" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200")}>
                  {v.loading && <Loader2 className="w-3 h-3 animate-spin" />} Option {i + 1}
                </button>
              ))}
            </div>
          )}

          <div className="surface-card p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="label-section">Draft</p>
              <div className="flex items-center gap-3">
                {current?.text && !current.loading && (
                  <>
                    <button onClick={checkDraft} disabled={checking} className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors">
                      {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />} Check facts
                    </button>
                    <button onClick={promoteToContent} disabled={promoting} className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors">
                      {promoting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />} Save to Content
                    </button>
                    <button onClick={saveDraft} className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors">
                      <Bookmark className="w-3.5 h-3.5" /> Save
                    </button>
                  </>
                )}
                {current && !current.loading && (
                  <BrainFeedback clientId={clientId} surface="compose"
                    artifactText={email ? email.body : current?.text ?? ""}
                    context={{ channel }} />
                )}
                <button onClick={() => copyText("all", email ? `${email.subject ? `Subject: ${email.subject}\n\n` : ""}${email.body}` : current?.text ?? "")}
                  className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors">
                  {copied === "all" ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied === "all" ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            {/* Email subject */}
            {email?.subject && (
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-zinc-800">
                <span className="text-2xs uppercase tracking-wide text-zinc-500 shrink-0">Subject</span>
                <span className="text-sm text-zinc-100 font-medium flex-1">{email.subject}</span>
                <button onClick={() => copyText("subj", email.subject!)} className="text-zinc-500 hover:text-white">
                  {copied === "subj" ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}

            <p className="text-sm text-zinc-100 leading-relaxed whitespace-pre-wrap min-h-[1.5rem]">
              {email ? email.body : current?.text}
              {current?.loading && <span className="ml-0.5 animate-pulse">▍</span>}
            </p>

            {/* Char count for social/message */}
            {current && !current.loading && (channel === "social" || channel === "message") && (
              <p className={cn("text-xs mt-2 text-right", limit && charCount > limit ? "text-red-400" : "text-zinc-500")}>
                {charCount}{limit ? ` / ${limit}` : ""} characters
              </p>
            )}

            {/* Fact-safety result */}
            {checkResult && checkResult.idx === active && (
              checkResult.unverified.length === 0 ? (
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-2 text-xs text-green-300">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" /> Every figure in this draft was found in your Vault.
                </div>
              ) : (
                <div className="mt-3 rounded-lg bg-amber-500/10 border border-amber-500/25 px-3 py-2">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-amber-300 mb-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Verify before sending — these figures aren&apos;t in your Vault:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {checkResult.unverified.map((f, i) => (
                      <span key={i} className="text-2xs font-mono text-amber-200 bg-amber-500/10 rounded px-1.5 py-0.5">{f}</span>
                    ))}
                  </div>
                </div>
              )
            )}

            {/* Refine */}
            {current && !current.loading && (
              <div className="mt-4 pt-3 border-t border-zinc-800 flex gap-2">
                <Input value={refine} onChange={(e) => setRefine(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") doRefine(); }}
                  placeholder="Refine this option — warmer, shorter, add the cancellation policy…"
                  className="bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 h-9 text-sm" />
                <Button onClick={doRefine} disabled={refine.trim().length < 2} variant="outline" size="sm" className="border-zinc-700 gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5" /> Refine
                </Button>
              </div>
            )}

            {/* Sources */}
            {current && current.sources.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {current.sources.map((s) => (
                  <span key={s.n} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-400" title={s.kindLabel}>
                    <span className="text-3xs uppercase tracking-wide text-zinc-500">{s.kindLabel}</span>
                    <span className="truncate max-w-[14rem]">{s.title}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Saved drafts */}
      {saved.length > 0 && (
        <div className="mt-6">
          <p className="label-section mb-2">Saved drafts</p>
          <div className="flex flex-col gap-1.5">
            {saved.map((d) => (
              <div key={d.id} className="surface-card flex items-center gap-3 px-3.5 py-2.5">
                <button onClick={() => restore(d)} className="flex-1 min-w-0 text-left">
                  <p className="text-sm text-zinc-200 truncate">{d.label}</p>
                  <LocalTime value={d.ts} opts={{ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }} className="text-2xs text-zinc-500" />
                </button>
                <button onClick={() => removeSaved(d.id)} className="text-zinc-600 hover:text-red-400 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
