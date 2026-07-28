"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BrainFeedback } from "@/components/brain/BrainFeedback";
import { cn } from "@/lib/utils";
import type { ContentBrief, ContentSourceReference, ContentType } from "@/types/content";
import {
  Wand2, Loader2, Copy, Check, RefreshCw, Reply, Mail, MessageSquare, Megaphone,
  FileText, Sparkles, Users, ChevronDown, X, ShieldCheck, AlertTriangle, Save,
} from "lucide-react";

export interface ComposeContact { id: string; name: string; company: string | null; email: string | null }

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

interface Variant {
  id: string | null;
  updatedAt: string | null;
  text: string;
  loading: boolean;
  sources: ContentSourceReference[];
  appliedStyle: string[];
}

function splitEmail(text: string): { subject: string | null; body: string } {
  const m = text.match(/^\s*subject:\s*(.+?)\r?\n([\s\S]*)$/i);
  return m ? { subject: m[1].trim(), body: m[2].trim() } : { subject: null, body: text };
}

export function ComposeClient({
  clientId, companyName, contacts = [],
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

  const [task, setTask] = useState("");
  const [inbound, setInbound] = useState("");
  const [guidance, setGuidance] = useState("");

  // Recipient personalization (optional; can pick from CRM).
  const [recipient, setRecipient] = useState<ComposeContact | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");

  const [variants, setVariants] = useState<Variant[]>([]);
  const [active, setActive] = useState(0);
  const [refine, setRefine] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  // Fact-safety check (per active variant index → result)
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<{ idx: number; unverified: string[] } | null>(null);

  const busy = variants.some((v) => v.loading);
  const platformMeta = PLATFORMS.find((p) => p.id === platform)!;
  const limit = channel === "social" ? platformMeta.limit : null;

  function resolvedContentType(): ContentType {
    if (channel === "social") return platform.toLowerCase() as ContentType;
    return channel;
  }

  const canCompose = mode === "new" ? task.trim().length >= 5 : inbound.trim().length >= 5;

  async function compose() {
    if (busy || !canCompose) return;
    setActive(0);
    setRefine("");
    setVariants([{ id: null, updatedAt: null, text: "", loading: true, sources: [], appliedStyle: [] }]);

    const contentType = resolvedContentType();
    const objective = mode === "reply"
      ? guidance.trim() || "Reply helpfully to the inbound message."
      : task.trim();
    const brief: ContentBrief = {
      version: 1,
      objective,
      audience: recipient
        ? `${recipient.name}${recipient.company ? ` at ${recipient.company}` : ""}`
        : null,
      keyPoints: [],
      callToAction: null,
      language: language === "Auto" ? null : language,
      tone: tone.toLowerCase() as ContentBrief["tone"],
      length: length === "standard" ? "medium" : length === "detailed" ? "long" : "short",
      mode,
      inboundContext: mode === "reply" ? inbound.trim() : null,
      additionalGuidance: guidance.trim() || null,
      recipient: recipient
        ? { id: recipient.id, name: recipient.name, company: recipient.company }
        : null,
    };
    const title = mode === "reply"
      ? `Reply to ${recipient?.name ?? "customer"}`
      : task.trim().split("\n")[0].slice(0, 120);

    try {
      const result = await api.post<{
        id: string;
        updatedAt?: string | null;
        body: string;
        sources?: ContentSourceReference[];
        appliedStyle?: string[];
      }>("/content/generate", { clientId, contentType, title, brief });
      setVariants([{
        id: result.id,
        updatedAt: result.updatedAt ?? null,
        text: result.body,
        loading: false,
        sources: result.sources ?? [],
        appliedStyle: result.appliedStyle ?? [],
      }]);
      toast.success("Draft created and saved to Content.");
    } catch {
      setVariants([]);
    }
  }

  async function doRefine() {
    const current = variants[active];
    if (refine.trim().length < 2 || busy || !current?.id) return;
    const instruction = refine.trim();
    setRefine("");
    setVariants((prev) => prev.map((v, i) => (i === active ? { ...v, loading: true } : v)));
    try {
      const result = await api.post<{ body: string; updated_at?: string; sources?: ContentSourceReference[] }>(
        "/content/rewrite",
        {
          client_id: clientId,
          id: current.id,
          scope: "full",
          instruction,
          expected_updated_at: current.updatedAt,
        },
      );
      setVariants((prev) => prev.map((variant, index) =>
        index === active
          ? {
              ...variant,
              text: result.body,
              updatedAt: result.updated_at ?? variant.updatedAt,
              loading: false,
              sources: result.sources ?? variant.sources,
            }
          : variant));
    } catch {
      setVariants((prev) => prev.map((variant, index) =>
        index === active ? { ...variant, loading: false } : variant));
    }
  }

  async function copyText(key: string, text: string) {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(key);
    toast.success("Copied to clipboard.");
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
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
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
          <Wand2 className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Compose</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Channel-aware drafts in {companyName}&apos;s voice — choose a format, tone and length, then create one ready-to-edit artifact.
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

      {/* Tone + length + language */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
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
        {mode === "reply" ? "Draft reply" : "Draft it"}
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
                    <span className="inline-flex items-center gap-1.5 text-xs text-green-400">
                      <Save className="w-3.5 h-3.5" /> Saved to Content
                    </span>
                  </>
                )}
                {current && !current.loading && (
                  <BrainFeedback clientId={clientId} surface="compose"
                    artifactId={current.id}
                    artifactText={email ? email.body : current?.text ?? ""}
                    context={{ channel, platform: channel === "social" ? platform : null }} />
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
              <div className="mt-3">
                <p className="text-xs font-medium text-zinc-500 mb-1.5">Vault sources</p>
                <div className="flex flex-wrap gap-1.5">
                  {current.sources.map((source) => (
                    <span key={`${source.kind}:${source.itemId}`} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-400" title={source.excerpt}>
                      <span className="text-3xs uppercase tracking-wide text-zinc-500">{source.kind === "semantic" ? "Relevant" : "Vault"}</span>
                      <span className="truncate max-w-[14rem]">{source.title}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {current && current.appliedStyle.length > 0 && (
              <div className="mt-3 rounded-lg border border-purple-500/20 bg-purple-500/5 px-3 py-2">
                <p className="text-xs font-medium text-purple-300 mb-1">Applied Company DNA</p>
                {current.appliedStyle.map((rule) => (
                  <p key={rule} className="text-xs text-zinc-500">{rule}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
