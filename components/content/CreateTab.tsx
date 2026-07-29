"use client";

import { memo, useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Sparkles, Copy, Check, RefreshCw, ShieldCheck, Save, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BrainFeedback } from "@/components/brain/BrainFeedback";
import { toast } from "sonner";
import { useGenerateContent, useUpdateContentPiece } from "@/hooks/useContent";
import { CONTENT_TYPES, TONES, LENGTHS, TYPE_ICON_COLORS, TYPE_ICONS } from "@/types/content";
import type {
  ContentMarketIntelligenceProvenance,
  ContentType,
  ContentPiece,
  ContentSourceReference,
} from "@/types/content";
import {
  contentStyleWarnings,
  resolveContentStyle,
} from "@/supabase/functions/_shared/content-style";

interface CreateTabProps {
  clientId: string;
  brandStyle: Record<string, unknown>;
  initialType?: ContentType | null;
  initialTitle?: string;
  initialBrief?: string;
  initialKeyPoints?: string[];
  initialAdditionalGuidance?: string;
  initialMarketIntelligence?: ContentMarketIntelligenceProvenance | null;
  onContentGenerated: (piece: ContentPiece) => void;
}

const EMPTY_KEY_POINTS: string[] = [];

export const CreateTab = memo(function CreateTab({
  clientId,
  brandStyle,
  initialType = null,
  initialTitle = "",
  initialBrief = "",
  initialKeyPoints = EMPTY_KEY_POINTS,
  initialAdditionalGuidance = "",
  initialMarketIntelligence = null,
  onContentGenerated,
}: CreateTabProps) {
  const [selectedType, setSelectedType] = useState<ContentType | null>(
    initialType === "social" ? "linkedin" : initialType,
  );
  const [title, setTitle] = useState(initialTitle);
  const [brief, setBrief] = useState(initialBrief);
  const [audience, setAudience] = useState("");
  const [keyPoints, setKeyPoints] = useState(initialKeyPoints.join("\n"));
  const [additionalGuidance, setAdditionalGuidance] = useState(initialAdditionalGuidance);
  const [marketIntelligence, setMarketIntelligence] =
    useState<ContentMarketIntelligenceProvenance | null>(initialMarketIntelligence);
  const [callToAction, setCallToAction] = useState("");
  const [tone, setTone] = useState("Professional");
  const [length, setLength] = useState<"short" | "medium" | "long">("medium");
  const [output, setOutput] = useState<string | null>(null);
  const [generatedId, setGeneratedId] = useState<string | null>(null);
  const [generatedUpdatedAt, setGeneratedUpdatedAt] = useState<string | null>(null);
  const [draftDirty, setDraftDirty] = useState(false);
  const [critique, setCritique] = useState<{ issues: string[]; grounded: boolean } | null>(null);
  const [appliedStyle, setAppliedStyle] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [sources, setSources] = useState<ContentSourceReference[]>([]);
  const [copied, setCopied] = useState(false);

  const { generate, isGenerating } = useGenerateContent();
  const { updatePiece, isUpdating: isSavingDraft } = useUpdateContentPiece();
  const resolvedStylePreview = useMemo(
    () => resolveContentStyle(
      brandStyle,
      selectedType ?? "content",
      tone,
      length === "short" ? "Keep it brief and punchy." : length === "long" ? "Be comprehensive and detailed." : "Use a standard length for the format.",
    ),
    [brandStyle, selectedType, tone, length],
  );
  const stylePreview = resolvedStylePreview.summary;
  const displayedWarnings = useMemo(() => {
    const clientWarnings =
      output
        ? contentStyleWarnings(output, resolvedStylePreview)
        : [];
    return Array.from(new Set([...warnings, ...clientWarnings]));
  }, [output, resolvedStylePreview, warnings]);

  const generatingRef = useRef(false);

  // The tab remains mounted while hidden. Keep it in sync when a newly approved
  // topic is selected from the Ideas tab.
  useEffect(() => {
    setSelectedType(initialType === "social" ? "linkedin" : initialType);
    setTitle(initialTitle);
    setBrief(initialBrief);
    setAudience("");
    setKeyPoints(initialKeyPoints.join("\n"));
    setAdditionalGuidance(initialAdditionalGuidance);
    setMarketIntelligence(initialMarketIntelligence);
    setCallToAction("");
    setOutput(null);
    setGeneratedId(null);
    setGeneratedUpdatedAt(null);
    setDraftDirty(false);
    setCritique(null);
    setAppliedStyle([]);
    setWarnings([]);
    setSources([]);
  }, [
    initialType,
    initialTitle,
    initialBrief,
    initialKeyPoints,
    initialAdditionalGuidance,
    initialMarketIntelligence,
  ]);

  const handleGenerate = useCallback(async () => {
    if (!selectedType || !title.trim()) {
      toast.error("Add a topic and pick a content type.");
      return;
    }

    if (generatingRef.current) return;
    generatingRef.current = true;
    setOutput(null);
    setGeneratedId(null);
    setGeneratedUpdatedAt(null);
    setDraftDirty(false);
    setCritique(null);
    setAppliedStyle([]);
    setWarnings([]);
    setSources([]);

    try {
      const data = await generate({
        clientId,
        contentType: selectedType,
        title: title.trim(),
        // Brief is optional in the UI — fall back to the topic so the generator
        // (which requires a brief) always has something to work from.
        brief: {
          version: 1,
          objective: brief.trim() || title.trim(),
          audience: audience.trim() || null,
          keyPoints: keyPoints.split("\n").map((point) => point.trim()).filter(Boolean),
          callToAction: callToAction.trim() || null,
          tone: tone.toLowerCase() as "professional" | "friendly" | "persuasive" | "casual" | "authoritative",
          length,
          mode: "new",
          additionalGuidance: additionalGuidance || null,
          marketIntelligence,
        },
      });

      setOutput(data.body);
      setGeneratedId(data.id);
      setGeneratedUpdatedAt(data.updatedAt ?? null);
      setDraftDirty(false);
      setCritique(data.critique ?? null);
      setAppliedStyle(data.appliedStyle ?? []);
      setWarnings(data.warnings ?? []);
      setSources(data.sources ?? []);

      const newPiece: ContentPiece = {
        id: data.id,
        content_type: selectedType,
        title: title.trim(),
        status: "draft",
        created_at: new Date().toISOString(),
      };

      onContentGenerated(newPiece);
    } catch {
      // error toast handled by the mutation
    } finally {
      generatingRef.current = false;
    }
  }, [
    generate,
    clientId,
    selectedType,
    title,
    brief,
    audience,
    keyPoints,
    callToAction,
    tone,
    length,
    additionalGuidance,
    marketIntelligence,
    onContentGenerated,
  ]);

  const handleCopy = useCallback(async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [output]);

  const handleReset = useCallback(() => {
    setOutput(null);
    setGeneratedId(null);
    setGeneratedUpdatedAt(null);
    setDraftDirty(false);
    setCritique(null);
    setAppliedStyle([]);
    setWarnings([]);
    setSources([]);
    setTitle("");
    setBrief("");
    setAudience("");
    setKeyPoints("");
    setAdditionalGuidance("");
    setMarketIntelligence(null);
    setCallToAction("");
    setSelectedType(null);
    setTone("Professional");
    setLength("medium");
  }, []);

  const handleRegenerate = useCallback(() => {
    setOutput(null);
    setGeneratedId(null);
    setGeneratedUpdatedAt(null);
    setDraftDirty(false);
    handleGenerate();
  }, [handleGenerate]);

  const handleSaveDraft = useCallback(async () => {
    if (!generatedId || !output?.trim()) return;
    try {
      const updated = await updatePiece({
        client_id: clientId,
        id: generatedId,
        body: output,
        expected_updated_at: generatedUpdatedAt ?? undefined,
      });
      setGeneratedUpdatedAt(updated.updated_at ?? null);
      setDraftDirty(false);
      toast.success("Draft saved.");
    } catch {
      // mutation surfaces the error
    }
  }, [generatedId, generatedUpdatedAt, output, updatePiece, clientId]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left — form */}
      <div className="flex flex-col gap-5">
        <p className="text-sm text-zinc-400">
          Start from your own idea: add a topic, pick a content type and length,
          and we&apos;ll write the draft — grounded in your Vault and brand.
        </p>

        {/* Topic / seed idea */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="content-title">Topic</Label>
          <Input
            id="content-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Announcing our new cloud migration service"
            className="bg-zinc-900 border-zinc-700"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="content-audience">Audience</Label>
            <Input
              id="content-audience"
              value={audience}
              onChange={(event) => setAudience(event.target.value)}
              placeholder="e.g. Sydney small-business owners"
              className="bg-zinc-900 border-zinc-700"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="content-cta">Call to action</Label>
            <Input
              id="content-cta"
              value={callToAction}
              onChange={(event) => setCallToAction(event.target.value)}
              placeholder="e.g. Book a discovery call"
              className="bg-zinc-900 border-zinc-700"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="content-key-points">Key points</Label>
          <Textarea
            id="content-key-points"
            value={keyPoints}
            onChange={(event) => setKeyPoints(event.target.value)}
            rows={4}
            placeholder={"One required point per line\nEvidence or offer to include\nAnything that must not be omitted"}
            className="bg-zinc-900 border-zinc-700 text-sm"
          />
        </div>

        {/* Content Type */}
        <div>
          <Label className="label-section mb-2 block">Content Type</Label>
          <div className="grid grid-cols-2 gap-2">
            {CONTENT_TYPES.map((ct) => {
              const Icon = TYPE_ICONS[ct.id];
              const isSelected = selectedType === ct.id;

              return (
                <button
                  key={ct.id}
                  type="button"
                  onClick={() => setSelectedType(ct.id)}
                  className={`flex flex-col gap-2 p-3 rounded-xl border text-left transition-colors ${
                    isSelected
                      ? "border-zinc-500 bg-zinc-800"
                      : "border-zinc-800 bg-zinc-900 hover:bg-zinc-800/60"
                  }`}
                >
                  <Icon className={`w-5 h-5 ${TYPE_ICON_COLORS[ct.id]}`} />
                  <p className="text-sm font-semibold">{ct.label}</p>
                  <p className="text-xs text-zinc-500">{ct.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tone & Length */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="content-tone">Tone</Label>
            <select
              id="content-tone"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 rounded-md px-3 h-9 text-sm text-zinc-300"
            >
              {TONES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Length</Label>
            <div className="flex gap-1 mt-0.5">
              {LENGTHS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLength(l.id)}
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                    length === l.id
                      ? "bg-zinc-700 border-zinc-600 text-white"
                      : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Details (optional) */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="content-brief">
            Details <span className="text-zinc-500 font-normal">(optional)</span>
          </Label>
          <Textarea
            id="content-brief"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={4}
            placeholder="Add any key points, audience or goal — or leave blank and we'll work from the topic."
            className="bg-zinc-900 border-zinc-700 text-sm"
          />
        </div>

        {marketIntelligence && (
          <div className="rounded-lg border border-orange-500/25 bg-orange-500/5 px-4 py-3">
            <p className="text-xs font-medium text-orange-200">Verified market intelligence attached</p>
            <p className="mt-1 text-xs leading-5 text-zinc-400">
              {marketIntelligence.competitorSources.length} immutable competitor source
              {marketIntelligence.competitorSources.length === 1 ? "" : "s"} and{" "}
              {marketIntelligence.companyReferences.length} company/Vault comparison reference
              {marketIntelligence.companyReferences.length === 1 ? "" : "s"} will be saved with this draft.
            </p>
            {additionalGuidance && (
              <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-zinc-500">
                {additionalGuidance}
              </p>
            )}
          </div>
        )}

        {stylePreview.length > 0 && (
          <div className="rounded-lg border border-purple-500/25 bg-purple-500/5 px-4 py-3">
            <p className="text-xs font-medium text-purple-300 mb-1.5">Company DNA rules &amp; guidance that will be applied</p>
            <ul className="space-y-1">
              {stylePreview.map((rule) => (
                <li key={rule} className="text-xs text-zinc-400">• {rule}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Generate Button */}
        <Button
          onClick={handleGenerate}
          disabled={isGenerating || !selectedType || !title.trim()}
          className="w-full"
        >
          {isGenerating ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              Generate Content
            </>
          )}
        </Button>
      </div>

      {/* Right — output */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 flex flex-col min-h-96">
        {!output && !isGenerating && (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8 py-12">
            <Sparkles className="w-10 h-10 text-zinc-700 mb-3" />
            <p className="text-zinc-500 font-medium">Generated content will appear here</p>
            <p className="text-zinc-600 text-sm mt-1">Add a topic, pick a content type, and click Generate</p>
          </div>
        )}

        {isGenerating && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <RefreshCw className="w-8 h-8 text-zinc-500 animate-spin mx-auto mb-3" />
              <p className="text-zinc-400 text-sm">Writing your content…</p>
            </div>
          </div>
        )}

        {output && (
          <>
            <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
              <p className="text-sm font-semibold text-zinc-300">Generated Draft</p>
              <div className="flex items-center gap-2">
                <BrainFeedback clientId={clientId} surface="content_draft"
                  artifactId={generatedId}
                  artifactText={output ?? ""}
                  context={{ type: selectedType, title }} />
                {draftDirty && (
                  <button
                    onClick={handleSaveDraft}
                    disabled={isSavingDraft}
                    className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors px-2 py-1 rounded hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {isSavingDraft ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Save
                  </button>
                )}
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-zinc-800"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-green-400" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy
                    </>
                  )}
                </button>
                <button
                  onClick={handleRegenerate}
                  className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-zinc-800"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Regenerate
                </button>
                <button
                  onClick={handleReset}
                  className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded hover:bg-zinc-800"
                >
                  New
                </button>
              </div>
            </div>
            {critique && (
              <div className="px-5 py-2 border-b border-zinc-800 flex items-start gap-2 text-xs">
                <ShieldCheck className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" />
                <div className="text-zinc-400">
                  <span className="text-zinc-300 font-medium">
                    Self-checked{critique.grounded ? " using relevant Vault context" : ""}
                  </span>
                  {critique.issues.length > 0
                    ? <> — revised {critique.issues.length} issue{critique.issues.length === 1 ? "" : "s"}: {critique.issues.join("; ")}</>
                    : " — no issues found"}
                </div>
              </div>
            )}
            {appliedStyle.length > 0 && (
              <div className="px-5 py-3 border-b border-zinc-800 bg-purple-500/5">
                <p className="text-xs font-medium text-purple-300 mb-1.5">Applied Company DNA rules &amp; guidance</p>
                <ul className="space-y-1">
                  {appliedStyle.map((rule) => (
                    <li key={rule} className="text-xs text-zinc-400">• {rule}</li>
                  ))}
                </ul>
              </div>
            )}
            {sources.length > 0 && (
              <div className="px-5 py-3 border-b border-zinc-800">
                <p className="text-xs font-medium text-zinc-500 mb-1.5">Vault sources used</p>
                <div className="flex flex-wrap gap-1.5">
                  {sources.map((source) => (
                    <span
                      key={`${source.kind}:${source.itemId}`}
                      title={source.excerpt}
                      className="text-xs rounded-full bg-zinc-800 px-2.5 py-1 text-zinc-400"
                    >
                      {source.title}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {displayedWarnings.length > 0 && (
              <div className="px-5 py-3 border-b border-amber-500/20 bg-amber-500/5">
                <p className="text-xs font-medium text-amber-300 mb-1.5 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> Review before approval
                </p>
                {displayedWarnings.map((warning) => (
                  <p key={warning} className="text-xs text-amber-200/80">{warning}</p>
                ))}
              </div>
            )}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <Textarea
                value={output}
                onChange={(event) => {
                  setOutput(event.target.value);
                  setDraftDirty(true);
                }}
                rows={18}
                aria-label="Generated content draft"
                className="min-h-80 resize-y bg-zinc-950 border-zinc-700 font-sans text-sm text-zinc-300 leading-relaxed"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
});
