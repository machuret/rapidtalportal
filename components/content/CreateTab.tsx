"use client";

import { memo, useState, useCallback, useRef } from "react";
import { Sparkles, Copy, Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BrainFeedback } from "@/components/brain/BrainFeedback";
import { toast } from "sonner";
import { useGenerateContent } from "@/hooks/useContent";
import { CONTENT_TYPES, TONES, LENGTHS, TYPE_ICON_COLORS, TYPE_ICONS } from "@/types/content";
import type { ContentType, ContentPiece } from "@/types/content";

interface CreateTabProps {
  clientId: string;
  userId: string;
  initialType?: ContentType | null;
  initialTitle?: string;
  initialBrief?: string;
  onContentGenerated: (piece: ContentPiece) => void;
}

export const CreateTab = memo(function CreateTab({
  clientId,
  userId,
  initialType = null,
  initialTitle = "",
  initialBrief = "",
  onContentGenerated,
}: CreateTabProps) {
  const [selectedType, setSelectedType] = useState<ContentType | null>(initialType);
  const [title, setTitle] = useState(initialTitle);
  const [brief, setBrief] = useState(initialBrief);
  const [tone, setTone] = useState("Professional");
  const [length, setLength] = useState<"short" | "medium" | "long">("medium");
  const [output, setOutput] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { generate, isGenerating } = useGenerateContent();

  const generatingRef = useRef(false);

  const handleGenerate = useCallback(async () => {
    if (!selectedType || !title.trim() || !brief.trim()) {
      toast.error("Please fill in all fields");
      return;
    }

    if (generatingRef.current) return;
    generatingRef.current = true;
    setOutput(null);

    try {
      const data = await generate({
        clientId,
        userId,
        contentType: selectedType,
        title: title.trim(),
        brief: brief.trim(),
        tone: tone.toLowerCase(),
        length,
      });

      setOutput(data.body);

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
  }, [generate, clientId, userId, selectedType, title, brief, tone, length, onContentGenerated]);

  const handleCopy = useCallback(async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [output]);

  const handleReset = useCallback(() => {
    setOutput(null);
    setTitle("");
    setBrief("");
    setSelectedType(null);
    setTone("Professional");
    setLength("medium");
  }, []);

  const handleRegenerate = useCallback(() => {
    setOutput(null);
    handleGenerate();
  }, [handleGenerate]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left — form */}
      <div className="flex flex-col gap-5">
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

        {/* Title */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="content-title">Title / Topic</Label>
          <Input
            id="content-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Announcing our new cloud migration service"
            className="bg-zinc-900 border-zinc-700"
          />
        </div>

        {/* Brief */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="content-brief">Brief</Label>
          <Textarea
            id="content-brief"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={4}
            placeholder="What should this content cover? Key points, audience, goal…"
            className="bg-zinc-900 border-zinc-700 text-sm"
          />
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

        {/* Generate Button */}
        <Button
          onClick={handleGenerate}
          disabled={isGenerating || !selectedType || !title.trim() || !brief.trim()}
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
            <p className="text-zinc-600 text-sm mt-1">Fill in the brief and click Generate</p>
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
                  artifactText={output ?? ""}
                  context={{ type: selectedType, title }} />
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
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <pre className="whitespace-pre-wrap font-sans text-sm text-zinc-300 leading-relaxed">
                {output}
              </pre>
            </div>
          </>
        )}
      </div>
    </div>
  );
});
