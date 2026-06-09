"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { vaultListKeys } from "@/hooks/useVaultList";
import { Upload, Globe, Type, CloudUpload, FileText, X, Plus, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

interface AddVaultItemProps {
  clientId: string;
  userId: string;
  onAdded?: () => void;
}

const INPUT_CLS = "bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500";

const CATEGORY_OPTIONS = [
  { value: "general",   label: "General" },
  { value: "process",   label: "Process" },
  { value: "policy",    label: "Policy" },
  { value: "service",   label: "Service" },
  { value: "contact",   label: "Contact" },
  { value: "reference", label: "Reference" },
];

function CategoryTagsFields({
  category, setCategory, tagInput, setTagInput,
}: {
  category: string;
  setCategory: (v: string) => void;
  tagInput: string;
  setTagInput: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="flex flex-col gap-1.5">
        <Label className="text-zinc-300 text-xs">Category</Label>
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="h-9 rounded-md border border-zinc-700 bg-zinc-800 text-zinc-100 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {CATEGORY_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-zinc-300 text-xs">Tags <span className="text-zinc-500 font-normal">(optional)</span></Label>
        <Input
          value={tagInput}
          onChange={e => setTagInput(e.target.value)}
          placeholder="onboarding, HR (comma-sep)"
          className={INPUT_CLS + " text-sm"}
        />
      </div>
    </div>
  );
}

export function AddVaultItem({ clientId, userId, onAdded }: AddVaultItemProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const [category, setCategory] = useState("general");
  const [tagInput, setTagInput] = useState("");

  const [textTitle, setTextTitle] = useState("");
  const [textContent, setTextContent] = useState("");

  const [urlTitle, setUrlTitle] = useState("");
  const [urlValue, setUrlValue] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const [fileTitle, setFileTitle] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function done() {
    // Reconcile the shared vault list (Realtime also invalidates it live).
    queryClient.invalidateQueries({ queryKey: vaultListKeys.all(clientId) });
    if (onAdded) {
      onAdded(); // Realtime handles the update in VaultClient
    } else {
      setTimeout(() => router.refresh(), 500); // Fallback for standalone use
    }
  }

  function parsedTags(): string[] {
    return tagInput.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
  }

  // ── Add text (JSON endpoint via api client) ───────────────────────────────
  const textMutation = useMutation({
    mutationFn: () =>
      api.post(ROUTES.vault.text(), { title: textTitle, content: textContent, clientId, userId, category, tags: parsedTags() }, { showErrorToast: false }),
    onSuccess: () => {
      toast.success("Text added to Vault. AI processing…");
      setTextTitle(""); setTextContent(""); setOpen(false); done();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Failed to add text.");
    },
  });

  // ── Add URL / standard crawl (JSON endpoint via api client) ───────────────
  const urlMutation = useMutation({
    mutationFn: () =>
      api.post(ROUTES.vault.url(), { title: urlTitle, url: urlValue, clientId, userId, category, tags: parsedTags() }, { showErrorToast: false }),
    onSuccess: () => {
      toast.success("URL queued for crawl.");
      setUrlTitle(""); setUrlValue(""); setOpen(false); done();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Failed to add URL.");
    },
  });

  // ── AI crawl (JSON endpoint via api client) ───────────────────────────────
  const crawlMutation = useMutation({
    mutationFn: () =>
      api.post<{ tokensUsed: number }>(ROUTES.vault.crawl(), {
        url: urlValue.trim(),
        title: urlTitle.trim() || undefined,
        clientId,
        tags: parsedTags(),
      }, { showErrorToast: false }),
    onSuccess: (data) => {
      toast.success(`Content crawled and added to vault (${data.tokensUsed} tokens used)`);
      setUrlTitle(""); setUrlValue(""); setOpen(false); done();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Failed to crawl URL");
    },
  });

  // ── Upload file (multipart/FormData — keeps fetch inside mutationFn) ───────
  const fileMutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append("file", file!);
      fd.append("title", fileTitle || file!.name);
      fd.append("clientId", clientId);
      fd.append("userId", userId);
      fd.append("category", category);
      fd.append("tags", JSON.stringify(parsedTags()));
      const res = await fetch("/api/vault/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Upload failed.");
      }
      return res;
    },
    onSuccess: () => {
      toast.success("File uploaded and AI processing started.");
      setFile(null); setFileTitle(""); setOpen(false); done();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    },
  });

  const isCrawling = crawlMutation.isPending;

  function submitText(e: React.FormEvent) {
    e.preventDefault();
    textMutation.mutate();
  }

  function submitUrl(e: React.FormEvent) {
    e.preventDefault();
    urlMutation.mutate();
  }

  function submitAiCrawl(e: React.FormEvent) {
    e.preventDefault();
    if (!urlValue.trim()) {
      toast.error("Please enter a valid URL");
      return;
    }
    crawlMutation.mutate();
  }

  function submitFile(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    fileMutation.mutate();
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) { setFile(dropped); if (!fileTitle) setFileTitle(dropped.name.replace(/\.[^.]+$/, "")); }
  }, [fileTitle]);

  const ACCEPTED = ".pdf,.docx,.txt";
  const fmt = (b: number) => b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`;

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 rounded-xl border border-dashed border-zinc-700 bg-zinc-900 hover:border-zinc-500 hover:bg-zinc-800/60 transition-all group"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Plus className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-zinc-200 group-hover:text-white transition-colors">Add to Vault</p>
            <p className="text-xs text-zinc-500">Paste text, add a URL, or upload a file</p>
          </div>
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 text-zinc-500" />
          : <ChevronDown className="w-4 h-4 text-zinc-500" />
        }
      </button>

      {open && (
        <div className="mt-2 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <Tabs defaultValue="text">
            <TabsList className="bg-zinc-800/80 mb-5 p-1 rounded-lg">
              <TabsTrigger value="text" className="gap-1.5 text-xs data-[state=active]:bg-zinc-700 data-[state=active]:text-white">
                <Type className="w-3.5 h-3.5" /> Paste Text
              </TabsTrigger>
              <TabsTrigger value="url" className="gap-1.5 text-xs data-[state=active]:bg-zinc-700 data-[state=active]:text-white">
                <Globe className="w-3.5 h-3.5" /> Add URL
              </TabsTrigger>
              <TabsTrigger value="file" className="gap-1.5 text-xs data-[state=active]:bg-zinc-700 data-[state=active]:text-white">
                <Upload className="w-3.5 h-3.5" /> Upload File
              </TabsTrigger>
            </TabsList>

            {/* ── Text ── */}
            <TabsContent value="text">
              <form onSubmit={submitText} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-zinc-300">Title <span className="text-red-400">*</span></Label>
                  <Input
                    value={textTitle}
                    onChange={e => setTextTitle(e.target.value)}
                    required
                    placeholder="e.g. Onboarding Process, FAQ, Product Info"
                    className={INPUT_CLS}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-zinc-300">Content <span className="text-red-400">*</span></Label>
                  <Textarea
                    value={textContent}
                    onChange={e => setTextContent(e.target.value)}
                    required
                    rows={6}
                    placeholder="Paste your content here — meeting notes, processes, FAQs, product descriptions…"
                    className={`${INPUT_CLS} resize-y`}
                  />
                  <p className="text-xs text-zinc-600">{textContent.length.toLocaleString()} characters</p>
                </div>
                <CategoryTagsFields category={category} setCategory={setCategory} tagInput={tagInput} setTagInput={setTagInput} />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} className="text-zinc-400">Cancel</Button>
                  <Button type="submit" disabled={textMutation.isPending} className="gap-2">
                    {textMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Type className="w-4 h-4" />}
                    {textMutation.isPending ? "Saving…" : "Add Text"}
                  </Button>
                </div>
              </form>
            </TabsContent>

            {/* ── URL ── */}
            <TabsContent value="url">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-zinc-300">Title <span className="text-zinc-500 font-normal">(optional for AI crawl)</span></Label>
                  <Input
                    value={urlTitle}
                    onChange={e => setUrlTitle(e.target.value)}
                    placeholder="e.g. About Us Page, Pricing Page"
                    className={INPUT_CLS}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-zinc-300">URL <span className="text-red-400">*</span></Label>
                  <Input
                    type="url"
                    value={urlValue}
                    onChange={e => setUrlValue(e.target.value)}
                    required
                    placeholder="https://example.com/about"
                    className={INPUT_CLS}
                  />
                  <p className="text-xs text-zinc-600">Choose how to add this URL to your vault:</p>
                </div>
                <CategoryTagsFields category={category} setCategory={setCategory} tagInput={tagInput} setTagInput={setTagInput} />
                
                <div className="grid grid-cols-1 gap-3">
                  {/* AI Crawl Option */}
                  <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Globe className="w-4 h-4 text-blue-400" />
                      <h4 className="text-sm font-semibold text-white">AI-Powered Crawl</h4>
                    </div>
                    <p className="text-xs text-zinc-400 mb-3">
                      Uses AI to extract, organize, and summarize the most important information from the webpage.
                    </p>
                    <form onSubmit={submitAiCrawl}>
                      <Button 
                        type="submit" 
                        disabled={isCrawling || !urlValue.trim()} 
                        className="w-full gap-2 bg-blue-600 hover:bg-blue-700"
                      >
                        {isCrawling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                        {isCrawling ? "Crawling with AI..." : "Crawl with AI"}
                      </Button>
                    </form>
                  </div>

                  {/* Standard Crawl Option */}
                  <div className="rounded-xl border border-zinc-700 bg-zinc-800/30 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <CloudUpload className="w-4 h-4 text-zinc-400" />
                      <h4 className="text-sm font-semibold text-white">Standard Crawl</h4>
                    </div>
                    <p className="text-xs text-zinc-400 mb-3">
                      Basic web crawling that extracts raw content from the page.
                    </p>
                    <form onSubmit={submitUrl}>
                      <Button
                        type="submit"
                        disabled={urlMutation.isPending || !urlValue.trim() || !urlTitle.trim()}
                        variant="outline"
                        className="w-full gap-2 border-zinc-600 hover:bg-zinc-800"
                      >
                        {urlMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                        {urlMutation.isPending ? "Queueing..." : "Queue Standard Crawl"}
                      </Button>
                    </form>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} className="text-zinc-400">Cancel</Button>
                </div>
              </div>
            </TabsContent>

            {/* ── File ── */}
            <TabsContent value="file">
              <form onSubmit={submitFile} className="flex flex-col gap-4">
                {/* Drop zone */}
                <div
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  onClick={() => !file && fileInputRef.current?.click()}
                  className={`relative rounded-xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center py-10 gap-3
                    ${dragging ? "border-blue-400 bg-blue-500/5" : "border-zinc-700 bg-zinc-800/40 hover:border-zinc-500 hover:bg-zinc-800/70"}
                    ${file ? "cursor-default" : ""}`}
                >
                  {file ? (
                    <div className="flex items-center gap-3">
                      <FileText className="w-8 h-8 text-blue-400 shrink-0" />
                      <div>
                        <p className="font-medium text-zinc-100 text-sm">{file.name}</p>
                        <p className="text-xs text-zinc-500">{fmt(file.size)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); setFile(null); setFileTitle(""); }}
                        className="ml-4 p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-500 hover:text-red-400 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="w-12 h-12 rounded-xl bg-zinc-700/60 flex items-center justify-center">
                        <CloudUpload className="w-6 h-6 text-zinc-400" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-medium text-zinc-200">Drop a file here or <span className="text-blue-400 underline">browse</span></p>
                        <p className="text-xs text-zinc-500 mt-1">PDF, DOCX, TXT — max 25 MB</p>
                      </div>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED}
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0] ?? null;
                      setFile(f);
                      if (f && !fileTitle) setFileTitle(f.name.replace(/\.[^.]+$/, ""));
                    }}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label className="text-zinc-300">Title <span className="text-zinc-500 font-normal">(optional)</span></Label>
                  <Input
                    value={fileTitle}
                    onChange={e => setFileTitle(e.target.value)}
                    placeholder="Leave blank to use filename"
                    className={INPUT_CLS}
                  />
                </div>
                <CategoryTagsFields category={category} setCategory={setCategory} tagInput={tagInput} setTagInput={setTagInput} />

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} className="text-zinc-400">Cancel</Button>
                  <Button type="submit" disabled={fileMutation.isPending || !file} className="gap-2">
                    {fileMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {fileMutation.isPending ? "Uploading…" : "Upload File"}
                  </Button>
                </div>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
