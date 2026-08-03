"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DbCompanyDna } from "@/types/database";
import { useDna } from "@/hooks/useDna";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { profileGaps } from "@/lib/brain/gaps";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Copy, Check, Globe, Loader2, Brain, Sparkles } from "lucide-react";
import { LocalTime } from "@/components/ui/LocalTime";
import { FieldTip } from "@/components/ui/tooltip";
import { HardRulesEditor } from "./HardRulesEditor";
import type { ContentHardRule } from "@/supabase/functions/_shared/content-style";
import { COMPANY_VOICE_UPDATED_EVENT } from "@/lib/content/style-analysis";

interface DnaFormProps {
  initialData: DbCompanyDna | null;
  clientId: string;
  readOnly: boolean;
  focusMode?: "company" | "voice" | null;
  sectionMode?: "all" | "profile" | "voice";
}

// Static decile width classes (Tailwind JIT needs literals; inline styles are
// disallowed by the styles guard). Mirrors the dashboard setup meter.
const PCT_WIDTH = ["w-0", "w-[10%]", "w-[20%]", "w-[30%]", "w-[40%]", "w-[50%]", "w-[60%]", "w-[70%]", "w-[80%]", "w-[90%]", "w-full"];

const FACT_FIELDS: { key: keyof DbCompanyDna; label: string; multiline?: boolean; hint?: string; tip?: string }[] = [
  { key: "company_name", label: "Company Name" },
  { key: "company_description", label: "Company Description", multiline: true },
  { key: "founders", label: "Founders" },
  { key: "location", label: "Location" },
  { key: "address", label: "Street Address" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "website", label: "Website" },
  { key: "client_type", label: "Client Type", tip: "Who you sell to (e.g. property investors, dental practices). Shapes the examples, tone and benefits the AI leads with." },
  { key: "target_demographic", label: "Target Demographic", tip: "The audience profile behind your marketing. Drafts are written for these people, not a generic reader." },
  { key: "values", label: "Company Values", multiline: true },
  { key: "services", label: "Services Offered", multiline: true },
  { key: "business_goals", label: "Business Goals", multiline: true },
  { key: "marketing_goals", label: "Marketing Goals", multiline: true },
  { key: "team", label: "Team", multiline: true },
  { key: "tools_used", label: "Tools the Company Uses", multiline: true, tip: "Your real stack (CRM, ad platforms, analytics…). The AI references the tools you actually use instead of generic software." },
  { key: "website_content", label: "Website Content", multiline: true, tip: "Key text from your website — about, services, pricing. Long-form facts the Brain can quote when the Vault has gaps." },
];

const ESSENTIAL_PROFILE_KEYS = new Set<keyof DbCompanyDna>([
  "company_name",
  "company_description",
  "services",
  "target_demographic",
  "business_goals",
  "website",
]);
const ESSENTIAL_FACT_FIELDS = FACT_FIELDS.filter((field) => ESSENTIAL_PROFILE_KEYS.has(field.key));
const ADDITIONAL_FACT_FIELDS = FACT_FIELDS.filter((field) => !ESSENTIAL_PROFILE_KEYS.has(field.key));

const VOICE_FIELDS: { key: keyof DbCompanyDna; label: string; multiline?: boolean; hint?: string; tip?: string }[] = [
  { key: "brand_voice", label: "Brand Voice & Tone", multiline: true },
  { key: "content_style", label: "Content Tone & Style", multiline: true },
  { key: "internal_rules", label: "Priority Editorial Guidance", multiline: true, hint: "Guidance that needs human judgement. Use Deterministic hard rules for requirements the system must enforce automatically." },
  { key: "preferred_terms", label: "Preferred Words & Phrases", multiline: true },
  { key: "prohibited_terms", label: "Words & Phrases to Avoid", multiline: true, hint: "Enter one term per line. Commas and semicolons are also supported for existing lists." },
  { key: "emoji_policy", label: "Emoji Policy", multiline: true, tip: "How and when the brand uses emoji. The style engine follows this before any per-draft request." },
  { key: "humour_policy", label: "Humour Policy", multiline: true, tip: "Where humour is welcome, where it isn't, and how dry it can be. Applied to every draft." },
  { key: "spelling_locale", label: "Language & Spelling Standard", tip: "e.g. Australian English (colour, organise) vs US English. Applied to every draft and tool output." },
  { key: "default_cta_style", label: "Default Call-to-Action Style", multiline: true },
  { key: "approved_claims", label: "Approved Claims & Proof Points", multiline: true, tip: "Claims the AI may make verbatim — numbers, results, guarantees you can prove. Drafts are grounded in these instead of inventing proof." },
  { key: "prohibited_claims", label: "Prohibited Claims", multiline: true, hint: "Enter one complete claim per line. These are checked before approval.", tip: "Claims the AI must never make. Checked deterministically before any draft is approved." },
  { key: "sign_off", label: "Default Sign-off" },
];

const fields = [...FACT_FIELDS, ...VOICE_FIELDS];

const SOCIAL_LINK_FIELDS = [
  { key: "linkedin", label: "LinkedIn" },
  { key: "facebook", label: "Facebook" },
  { key: "instagram", label: "Instagram" },
  { key: "x", label: "X / Twitter" },
  { key: "youtube", label: "YouTube" },
] as const;

const CHANNEL_STYLE_FIELDS = [
  { key: "x", label: "X / Twitter", hint: "e.g. concise and specific, one idea, no hashtag stuffing, within 280 characters" },
  { key: "linkedin", label: "LinkedIn", hint: "e.g. authoritative, practical, strong hook, no emojis, end with a discussion question" },
  { key: "facebook", label: "Facebook", hint: "e.g. warm, local and conversational, light emojis, one clear action" },
  { key: "instagram", label: "Instagram", hint: "e.g. punchy caption, visual direction, restrained relevant hashtags" },
  { key: "email", label: "Email", hint: "e.g. concise, personal greeting, short paragraphs, direct CTA, approved sign-off" },
  { key: "blog", label: "Blog", hint: "e.g. expert but accessible, evidence-led, practical sections, no filler" },
  { key: "newsletter", label: "Newsletter", hint: "e.g. editorial and useful, recurring sections, one primary CTA" },
] as const;

type ProvenanceEntry = { source: "scrape" | "vault_draft"; at: string };
type ProvenanceMap = Record<string, ProvenanceEntry>;

function ProvenanceBadge({ entry }: { entry: ProvenanceEntry | undefined }) {
  if (!entry) return null;
  const label = entry.source === "scrape" ? "Auto-filled from website" : "Drafted from Vault";
  return (
    <span
      title={`${label} on ${entry.at.slice(0, 10)} — review it; any edit makes it yours.`}
      className="ml-2 inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-2xs font-medium text-sky-300"
    >
      <Sparkles className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

export function DnaForm({
  initialData,
  clientId,
  readOnly,
  focusMode = null,
  sectionMode = "all",
}: DnaFormProps) {
  const router = useRouter();
  const { saveDna, isSaving: saving, scrapeDna, isScraping } = useDna();
  const [form, setForm] = useState<Partial<DbCompanyDna>>(initialData ?? {});
  const [updatedAt, setUpdatedAt] = useState(initialData?.updated_at ?? null);
  const [copied, setCopied] = useState(false);
  const [scrapingUrl, setScrapingUrl] = useState("");
  const [isDrafting, setIsDrafting] = useState(false);
  const hardRules = Array.isArray(form.hard_rules) ? form.hard_rules : [];
  const provenance = (form.field_provenance ?? {}) as ProvenanceMap;

  const factFieldKeys = (sectionMode === "profile" ? ESSENTIAL_FACT_FIELDS : FACT_FIELDS)
    .map((field) => String(field.key));
  const gaps = profileGaps(
    form as Record<string, unknown>,
    sectionMode === "profile" ? factFieldKeys : undefined,
  );

  function set(key: keyof DbCompanyDna, value: string) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      // A human edit makes the value theirs — drop its auto-fill provenance.
      if (f.field_provenance?.[key as string]) {
        const rest = { ...(f.field_provenance as ProvenanceMap) };
        delete rest[key as string];
        next.field_provenance = rest;
      }
      return next;
    });
  }

  function markProvenance(keys: string[], source: ProvenanceEntry["source"]) {
    if (!keys.length) return;
    const at = new Date().toISOString();
    setForm((f) => ({
      ...f,
      field_provenance: {
        ...((f.field_provenance ?? {}) as ProvenanceMap),
        ...Object.fromEntries(keys.map((k) => [k, { source, at }])),
      },
    }));
  }

  function setChannelStyle(channel: string, value: string) {
    setForm((f) => ({
      ...f,
      channel_styles: {
        ...((f.channel_styles ?? {}) as Record<string, string>),
        [channel]: value,
      },
    }));
  }

  function setSocialLink(channel: string, value: string) {
    setForm((f) => ({
      ...f,
      social_links: {
        ...((f.social_links ?? {}) as Record<string, string>),
        [channel]: value,
      },
    }));
  }

  // Brain 2.0 (F): draft the empty profile fields from the client's Vault docs.
  // Fills only blanks — the admin reviews and Saves as usual.
  async function handleDraftFromVault() {
    setIsDrafting(true);
    try {
      const data = await api.post<{
        drafts: Record<string, string>;
        noVault?: boolean;
        complete?: boolean;
        brainContextSnapshotId: string;
      }>(ROUTES.brain.onboard(), { client_id: clientId }, { showErrorToast: false });

      if (data.complete) { toast.message("Your profile already covers the key fields."); return; }
      if (data.noVault) { toast.message("Add some documents to the Vault first — then the Brain can draft your profile."); return; }

      const keys = Object.keys(data.drafts ?? {}).filter((key) =>
        sectionMode !== "profile" || factFieldKeys.includes(key));
      if (keys.length === 0) { toast.message("Couldn't draft new fields from your documents yet."); return; }

      // Only blanks get drafted — track exactly which fields the AI wrote so
      // they carry a "Drafted from Vault" badge until a human edits them.
      const appliedKeys = keys.filter((k) => {
        const cur = (form as Record<string, unknown>)[k];
        return typeof cur !== "string" || !cur.trim();
      });
      setForm((prev) => {
        const next = { ...prev } as Record<string, unknown>;
        for (const k of keys) {
          const cur = (prev as Record<string, unknown>)[k];
          if (typeof cur !== "string" || !cur.trim()) next[k] = data.drafts[k];
        }
        return next as Partial<DbCompanyDna>;
      });
      markProvenance(appliedKeys, "vault_draft");
      toast.success(`Drafted ${appliedKeys.length} field${appliedKeys.length === 1 ? "" : "s"} from your Vault — review and Save.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to draft from Vault");
    } finally {
      setIsDrafting(false);
    }
  }

  async function handleUrlScrape(e?: React.FormEvent) {
    if (e) e.preventDefault();

    if (!scrapingUrl.trim()) {
      toast.error("Please enter a valid URL");
      return;
    }

    try {
      const data = await scrapeDna({ url: scrapingUrl.trim(), clientId });

      // Update form with scraped data
      const scrapedData = data.data;
      setForm(prev => ({
        ...prev,
        company_name: scrapedData.company_name || prev.company_name,
        company_description: scrapedData.company_description || prev.company_description,
        services: scrapedData.services || prev.services,
        values: scrapedData.values || prev.values,
        location: scrapedData.location || prev.location,
        address: scrapedData.address || prev.address,
        phone: scrapedData.phone || prev.phone,
        email: scrapedData.email || prev.email,
        website: scrapedData.website || prev.website,
        founders: scrapedData.founders || prev.founders,
        target_demographic: scrapedData.target_demographic || prev.target_demographic,
        client_type: scrapedData.client_type || prev.client_type,
        business_goals: scrapedData.business_goals || prev.business_goals,
        marketing_goals: scrapedData.marketing_goals || prev.marketing_goals,
        team: scrapedData.team || prev.team,
        tools_used: scrapedData.tools_used || prev.tools_used,
        brand_voice: scrapedData.brand_voice || prev.brand_voice,
        content_style: scrapedData.content_style || prev.content_style,
        website_content: scrapedData.website_content || prev.website_content,
      }));
      markProvenance(
        (["company_name", "services", "values", "phone", "email", "website", "founders", "target_demographic", "client_type"] as const)
          .filter((k) => typeof scrapedData[k] === "string" && scrapedData[k].trim()),
        "scrape",
      );

      setUpdatedAt(scrapedData.updated_at ?? null);
      toast.success(`Company information extracted successfully (${data.tokensUsed} tokens used)`);
      setScrapingUrl("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to extract company information");
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const canContinue = focusMode === "company"
      ? [form.company_name, form.services, form.target_demographic, form.business_goals]
          .every((value) => typeof value === "string" && value.trim().length > 0)
      : focusMode === "voice"
        ? [form.brand_voice, form.content_style]
            .some((value) => typeof value === "string" && value.trim().length > 0)
        : true;
    if (!canContinue) {
      toast.error(focusMode === "company"
        ? "Complete the four starter answers before continuing."
        : "Describe your brand voice or content style before continuing.");
      return;
    }
    try {
      await saveDna({ form, clientId, onboardingMilestone: focusMode ?? undefined });
      toast.success(sectionMode === "voice" || focusMode === "voice"
        ? "Voice settings saved."
        : "Company profile saved.");
      setUpdatedAt(new Date().toISOString());
      if (sectionMode === "voice" || focusMode === "voice") {
        window.dispatchEvent(new CustomEvent(COMPANY_VOICE_UPDATED_EVENT, {
          detail: { clientId },
        }));
      }
      if (focusMode) {
        router.push("/dashboard");
        router.refresh();
      }
    } catch (err) {
      toast.error("Failed to save: " + (err instanceof Error ? err.message : "error"));
    }
  }

  async function copyAll() {
    const visibleFields = sectionMode === "voice"
      ? VOICE_FIELDS
      : sectionMode === "profile"
        ? FACT_FIELDS
        : fields;
    const profileText = visibleFields
      .map(({ key, label }) => `${label}: ${(form[key] as string) ?? "—"}`)
      .join("\n");
    const channelText = CHANNEL_STYLE_FIELDS
      .map(({ key, label }) => `${label}: ${form.channel_styles?.[key] ?? "Uses the global brand voice"}`)
      .join("\n");
    await navigator.clipboard.writeText(sectionMode === "profile"
      ? profileText
      : `${profileText}\n\nChannel Writing Styles\n${channelText}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Read-only card view for VA
  if (readOnly) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex justify-end">
          <button
            onClick={copyAll}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-zinc-700 hover:bg-zinc-800"
          >
            {copied
              ? <><Check className="w-3.5 h-3.5 text-green-400" />Copied!</>
              : <><Copy className="w-3.5 h-3.5" />{sectionMode === "voice" ? "Copy voice settings" : "Copy profile"}</>}
          </button>
        </div>

        {sectionMode !== "voice" && (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <h2 className="text-sm font-semibold text-white mb-1">The facts</h2>
          <p className="text-xs text-zinc-500 mb-3">Who the company is and what it does — quoted as facts in every AI answer.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(sectionMode === "profile" ? ESSENTIAL_FACT_FIELDS : FACT_FIELDS).map(({ key, label, multiline }) => {
              const value = (form[key] as string) ?? "";
              return (
                <div key={key} className={`rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 ${multiline ? "sm:col-span-2" : ""}`}>
                  <p className="text-xs font-medium text-zinc-500 mb-1">
                    {label}
                    <ProvenanceBadge entry={provenance[key as string]} />
                  </p>
                  <p className={`text-sm text-zinc-200 ${!value ? "text-zinc-600 italic" : ""} ${multiline ? "whitespace-pre-wrap" : ""}`}>
                    {value || "Not set"}
                  </p>
                </div>
              );
            })}
          </div>
          {sectionMode === "profile" && (
            <details className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/30">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-zinc-300 hover:text-white">
                Additional company details
              </summary>
              <div className="grid grid-cols-1 gap-3 border-t border-zinc-800 p-4 sm:grid-cols-2">
                {ADDITIONAL_FACT_FIELDS.map(({ key, label, multiline }) => {
                  const value = (form[key] as string) ?? "";
                  return (
                    <div key={key} className={`rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 ${multiline ? "sm:col-span-2" : ""}`}>
                      <p className="mb-1 text-xs font-medium text-zinc-500">{label}</p>
                      <p className={`text-sm ${value ? "text-zinc-200" : "italic text-zinc-600"} ${multiline ? "whitespace-pre-wrap" : ""}`}>
                        {value || "Not set"}
                      </p>
                    </div>
                  );
                })}
              </div>
            </details>
          )}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-4 mt-3">
            <p className="text-xs font-medium text-zinc-500 mb-3">Owned Social Channels</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SOCIAL_LINK_FIELDS.map(({ key, label }) => {
                const value = form.social_links?.[key] ?? "";
                return (
                  <div key={key}>
                    <p className="text-xs text-zinc-500 mb-1">{label}</p>
                    <p className={`text-sm break-all ${value ? "text-zinc-200" : "text-zinc-600 italic"}`}>
                      {value || "Not set"}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
        )}

        {sectionMode !== "profile" && (
        <section className="rounded-xl border border-purple-500/25 bg-purple-500/5 p-4">
          <h2 className="text-sm font-semibold text-white mb-1">Voice &amp; editorial policy</h2>
          <p className="text-xs text-zinc-400 mb-3">How the company sounds and what it may claim — applied to every draft.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {VOICE_FIELDS.map(({ key, label, multiline }) => {
              const value = (form[key] as string) ?? "";
              return (
                <div key={key} className={`rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 ${multiline ? "sm:col-span-2" : ""}`}>
                  <p className="text-xs font-medium text-zinc-500 mb-1">
                    {label}
                    <ProvenanceBadge entry={provenance[key as string]} />
                  </p>
                  <p className={`text-sm text-zinc-200 ${!value ? "text-zinc-600 italic" : ""} ${multiline ? "whitespace-pre-wrap" : ""}`}>
                    {value || "Not set"}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-4 mt-3">
            <p className="text-xs font-medium text-zinc-500 mb-3">Channel Writing Styles</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CHANNEL_STYLE_FIELDS.map(({ key, label }) => {
                const value = form.channel_styles?.[key] ?? "";
                return (
                  <div key={key}>
                    <p className="text-xs text-zinc-500 mb-1">{label}</p>
                    <p className={`text-sm whitespace-pre-wrap ${value ? "text-zinc-200" : "text-zinc-600 italic"}`}>
                      {value || "Uses the global brand voice"}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-4 mt-3">
            <p className="text-xs font-medium text-zinc-500 mb-3">Deterministic Hard Rules</p>
            <HardRulesEditor value={hardRules} onChange={() => {}} readOnly />
          </div>
        </section>
        )}

        {updatedAt && (
          <p className="text-xs text-zinc-600">Last updated: <LocalTime value={updatedAt} /></p>
        )}
      </div>
    );
  }

  if (focusMode) {
    const focusCanContinue = focusMode === "company"
      ? [form.company_name, form.services, form.target_demographic, form.business_goals]
          .every((value) => typeof value === "string" && value.trim().length > 0)
      : [form.brand_voice, form.content_style]
          .some((value) => typeof value === "string" && value.trim().length > 0);
    const focusFields = focusMode === "company"
      ? ([
          { key: "company_name", label: "What is your company called?", multiline: false, placeholder: "Company name" },
          { key: "services", label: "What do you sell or provide?", multiline: true, placeholder: "Your main products or services" },
          { key: "target_demographic", label: "Who do you help?", multiline: true, placeholder: "Your ideal customers and what they need" },
          { key: "business_goals", label: "What matters most right now?", multiline: true, placeholder: "Your current business priorities" },
        ] as const)
      : ([
          { key: "brand_voice", label: "How should your company sound?", multiline: true, placeholder: "For example: confident, practical and warm—not corporate or pushy" },
          { key: "content_style", label: "What should your content feel like?", multiline: true, placeholder: "For example: strong opening, short paragraphs, useful detail and one clear next step" },
          { key: "spelling_locale", label: "Which language style should we use?", multiline: false, placeholder: "For example: Australian English" },
          { key: "default_cta_style", label: "How should content invite action?", multiline: true, placeholder: "For example: finish with a natural discussion question" },
        ] as const);

    return (
      <form onSubmit={handleSave} className="mx-auto max-w-2xl space-y-5">
        <section className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-zinc-900 to-zinc-950 p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">
            Step {focusMode === "company" ? "1" : "3"} of 6
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            {focusMode === "company" ? "Confirm your company" : "Choose how your content should sound"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            {focusMode === "company"
              ? "Four short answers are enough to get started. You can add addresses, social links and detailed settings later."
              : "Give RapidTal a simple direction now. Detailed channel rules and style analysis remain available later under Company → Voice."}
          </p>
          <p className="mt-3 text-xs text-zinc-500">
            {focusMode === "company"
              ? "All four answers are needed to confirm this step."
              : "Describe either your brand voice or content style. Language and CTA settings are optional refinements."}
          </p>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <div className="space-y-5">
            {focusFields.map(({ key, label, multiline, placeholder }) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`setup-${key}`}>{label}</Label>
                {multiline ? (
                  <Textarea
                    id={`setup-${key}`}
                    value={(form[key] as string) ?? ""}
                    onChange={(event) => set(key, event.target.value)}
                    rows={3}
                    placeholder={placeholder}
                    className="bg-zinc-950/60 border-zinc-700"
                  />
                ) : (
                  <Input
                    id={`setup-${key}`}
                    value={(form[key] as string) ?? ""}
                    onChange={(event) => set(key, event.target.value)}
                    placeholder={placeholder}
                    className="bg-zinc-950/60 border-zinc-700"
                  />
                )}
              </div>
            ))}
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/dashboard" className={cn(buttonVariants({ variant: "ghost" }), "text-zinc-400")}>
            Back to your journey
          </Link>
          <Button type="submit" disabled={saving || !focusCanContinue}>
            {saving ? "Saving…" : "Save and continue"}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-5">
      {/* Completeness meter — always shown so progress (and "done") is tangible;
          this profile powers every AI answer, draft and tool. */}
      {sectionMode !== "voice" && (() => {
        const pct = gaps.completionPct;
        const complete = gaps.gaps.length === 0;
        return (
          <div className={cn("rounded-xl border p-4", complete ? "border-green-500/30 bg-green-500/5" : "border-orange-500/30 bg-orange-500/5")}>
            <div className="flex items-center gap-2 mb-1">
              <Brain className={cn("w-4 h-4", complete ? "text-green-400" : "text-orange-400")} />
              <h3 className="text-sm font-semibold text-white flex-1">
                {complete ? "Your company profile is complete 🎉" : "Complete your company profile"}
              </h3>
              <span className="text-xs font-semibold tabular-nums text-zinc-200">{pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden my-2">
              <div className={cn("h-full rounded-full transition-all", complete ? "bg-green-400" : "bg-orange-400", PCT_WIDTH[Math.max(0, Math.min(10, Math.round(pct / 10)))])} />
            </div>
            {complete ? (
              <p className="text-xs text-zinc-400">The essential company details are filled. Keep them current as the business changes.</p>
            ) : (
              <>
                <p className="text-xs text-zinc-400 mb-2">A few quick answers fill the biggest gaps — each one makes every AI feature sharper:</p>
                <ul className="flex flex-col gap-1">
                  {gaps.gaps.slice(0, 4).map((g) => (
                    <li key={g.key} className="text-xs text-zinc-300 flex items-start gap-1.5">
                      <span className="text-orange-400">•</span>{g.question}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        );
      })()}

      {/* Auto-fill — both gap-fillers in one place, with provenance badges
          on everything they write so you always know what to review. */}
      {sectionMode !== "voice" && (
      <details className="rounded-xl border border-zinc-800 bg-zinc-900/50" open={sectionMode === "all" ? true : undefined}>
        <summary className="cursor-pointer p-4 text-sm font-semibold text-white hover:text-orange-200">
          Fill gaps automatically <span className="ml-2 text-xs font-normal text-zinc-500">Optional</span>
        </summary>
        <div className="border-t border-zinc-800 p-4">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-orange-400" />
          <h3 className="text-sm font-semibold text-white">Choose an auto-fill method</h3>
        </div>
        <p className="text-xs text-zinc-400 mb-4">
          Two ways to pre-fill empty fields — everything they write gets an auto-fill badge so you can review it before it becomes company truth. You always Save.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
            <p className="text-xs font-semibold text-white mb-1">Draft from your Vault</p>
            <p className="text-2xs text-zinc-500 mb-3">The Brain drafts empty fields from the documents you&apos;ve uploaded.</p>
            <Button
              type="button"
              onClick={() => void handleDraftFromVault()}
              disabled={isDrafting}
              variant="outline"
              size="sm"
              className="border-orange-500/50 text-orange-400 hover:bg-orange-400/10"
            >
              {isDrafting ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Drafting…</>
              ) : (
                <><Sparkles className="w-4 h-4 mr-2" />Draft empty fields</>
              )}
            </Button>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
            <p className="text-xs font-semibold text-white mb-1">Auto-populate from Website</p>
            <p className="text-2xs text-zinc-500 mb-3">Extract company information from a website URL using AI.</p>
            {/* NOTE: intentionally NOT a <form> — it lives inside the Save DNA
                form and nested forms are invalid HTML. */}
            <div className="flex gap-2">
              <Input
                type="url"
                placeholder="https://example.com"
                value={scrapingUrl}
                onChange={(e) => setScrapingUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleUrlScrape(); } }}
                className="flex-1 bg-zinc-800 border-zinc-600 h-9 text-sm"
                disabled={isScraping}
              />
              <Button
                type="button"
                size="sm"
                onClick={() => void handleUrlScrape()}
                disabled={isScraping || !scrapingUrl.trim()}
                variant="outline"
                className="border-blue-500/50 text-blue-400 hover:bg-orange-400/10"
              >
                {isScraping ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Extracting...</>
                ) : (
                  "Extract"
                )}
              </Button>
            </div>
          </div>
        </div>
        </div>
      </details>
      )}

      {/* ── The facts ─────────────────────────────────────────────── */}
      {sectionMode !== "voice" && (
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="text-base font-semibold text-white">Company essentials</h2>
        <p className="mt-1 mb-5 text-xs text-zinc-500">
          Who the company is and what it does. The AI quotes these as facts in answers, drafts and tools — accuracy here matters more than anywhere else.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(sectionMode === "profile" ? ESSENTIAL_FACT_FIELDS : FACT_FIELDS).map(({ key, label, multiline, hint, tip }) => (
            <div key={key} className={cn("flex flex-col gap-1.5", multiline && "sm:col-span-2")}>
              <Label>
                {label}
                <ProvenanceBadge entry={provenance[key as string]} />
                {tip && <FieldTip text={tip} />}
              </Label>
              {hint && <p className="text-xs text-zinc-500">{hint}</p>}
              {multiline ? (
                <Textarea value={(form[key] as string) ?? ""} onChange={(e) => set(key, e.target.value)} rows={4} className="bg-zinc-900 border-zinc-700" />
              ) : (
                <Input value={(form[key] as string) ?? ""} onChange={(e) => set(key, e.target.value)} className="bg-zinc-900 border-zinc-700" />
              )}
            </div>
          ))}
        </div>

        {sectionMode === "all" && (
          <div className="mt-5 rounded-xl border border-sky-500/25 bg-sky-500/5 p-4">
            <div className="mb-4 flex items-center gap-2">
              <Globe className="h-4 w-4 text-sky-400" />
              <h3 className="text-sm font-semibold text-white">Owned social channels</h3>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {SOCIAL_LINK_FIELDS.map(({ key, label }) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <Label htmlFor={`social-link-${key}`}>{label}</Label>
                  <Input
                    id={`social-link-${key}`}
                    type="url"
                    value={form.social_links?.[key] ?? ""}
                    onChange={(event) => setSocialLink(key, event.target.value)}
                    placeholder={`https://${key === "x" ? "x.com" : `www.${key}.com`}/…`}
                    className="bg-zinc-900 border-zinc-700 text-sm"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {sectionMode === "profile" && (
        <details className="mt-5 rounded-xl border border-zinc-800 bg-zinc-950/30">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-zinc-300 hover:text-white">
            Additional company details and social links
          </summary>
          <div className="space-y-5 border-t border-zinc-800 p-4">
        <div className="rounded-xl border border-sky-500/25 bg-sky-500/5 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Globe className="w-4 h-4 text-sky-400" />
            <h3 className="text-sm font-semibold text-white">Owned Social Channels</h3>
          </div>
          <p className="text-xs text-zinc-400 mb-4">
            Official company profiles. Admins can collect public LinkedIn posts as channel-style examples from the Admin Vault.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {SOCIAL_LINK_FIELDS.map(({ key, label }) => (
              <div key={key} className="flex flex-col gap-1.5">
                <Label htmlFor={`social-link-${key}`}>{label}</Label>
                <Input
                  id={`social-link-${key}`}
                  type="url"
                  value={form.social_links?.[key] ?? ""}
                  onChange={(e) => setSocialLink(key, e.target.value)}
                  placeholder={`https://${key === "x" ? "x.com" : `www.${key}.com`}/…`}
                  className="bg-zinc-900 border-zinc-700 text-sm"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {ADDITIONAL_FACT_FIELDS.map(({ key, label, multiline, hint, tip }) => (
            <div key={key} className={cn("flex flex-col gap-1.5", multiline && "sm:col-span-2")}>
              <Label>
                {label}
                <ProvenanceBadge entry={provenance[key as string]} />
                {tip && <FieldTip text={tip} />}
              </Label>
              {hint && <p className="text-xs text-zinc-500">{hint}</p>}
              {multiline ? (
                <Textarea
                  value={(form[key] as string) ?? ""}
                  onChange={(e) => set(key, e.target.value)}
                  rows={4}
                  className="bg-zinc-900 border-zinc-700"
                />
              ) : (
                <Input
                  value={(form[key] as string) ?? ""}
                  onChange={(e) => set(key, e.target.value)}
                  className="bg-zinc-900 border-zinc-700"
                />
              )}
            </div>
          ))}
        </div>
          </div>
        </details>
        )}
      </section>
      )}

      {/* ── Voice & editorial policy ──────────────────────────────── */}
      {sectionMode !== "profile" && (
      <section className="rounded-xl border border-purple-500/25 bg-purple-500/5 p-5">
        <h2 className="text-base font-semibold text-white">Voice &amp; editorial policy</h2>
        <p className="mt-1 mb-5 text-xs text-zinc-400">
          How the company sounds and what it may claim. Applied to every draft, on every channel, before any per-draft instruction.
        </p>

        <div className="rounded-xl border border-purple-500/25 bg-zinc-900/40 p-4 mb-5">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-semibold text-white">Channel Writing Styles</h3>
            <FieldTip text="Per-channel overrides for quirks only — hook style, length, hashtag policy. Your DNA voice and approved style analysis always win over anything written here." />
          </div>
          <p className="text-xs text-zinc-400 mb-4">
            Optional channel overrides. Company guidance and the global brand voice still take priority.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {CHANNEL_STYLE_FIELDS.map(({ key, label, hint }) => (
              <div key={key} className="flex flex-col gap-1.5">
                <Label htmlFor={`channel-style-${key}`}>{label}</Label>
                <Textarea
                  id={`channel-style-${key}`}
                  value={form.channel_styles?.[key] ?? ""}
                  onChange={(e) => setChannelStyle(key, e.target.value)}
                  rows={3}
                  placeholder={hint}
                  className="bg-zinc-900 border-zinc-700 text-sm"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="mb-5">
          <HardRulesEditor
            value={hardRules}
            onChange={(rules: ContentHardRule[]) => setForm((current) => ({ ...current, hard_rules: rules }))}
          />
        </div>

        <div className="grid grid-cols-1 gap-4">
          {VOICE_FIELDS.map(({ key, label, multiline, hint, tip }) => (
            <div key={key} className="flex flex-col gap-1.5">
              <Label>
                {label}
                <ProvenanceBadge entry={provenance[key as string]} />
                {tip && <FieldTip text={tip} />}
              </Label>
              {hint && <p className="text-xs text-zinc-500">{hint}</p>}
              {multiline ? (
                <Textarea
                  value={(form[key] as string) ?? ""}
                  onChange={(e) => set(key, e.target.value)}
                  rows={4}
                  className="bg-zinc-900 border-zinc-700"
                />
              ) : (
                <Input
                  value={(form[key] as string) ?? ""}
                  onChange={(e) => set(key, e.target.value)}
                  className="bg-zinc-900 border-zinc-700"
                />
              )}
            </div>
          ))}
        </div>
      </section>
      )}

      {updatedAt && (
        <p className="text-xs text-zinc-500">Last saved: <LocalTime value={updatedAt} /></p>
      )}
      <Button type="submit" disabled={saving} className="self-start">
        {saving ? "Saving…" : sectionMode === "voice" ? "Save voice settings" : "Save company profile"}
      </Button>
    </form>
  );
}
