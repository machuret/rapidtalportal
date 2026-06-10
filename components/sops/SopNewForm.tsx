"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Save, ListChecks, Loader2 } from "lucide-react";
import type { Sop } from "@/app/(portal)/sops/page";
import { useSops } from "@/hooks/useSops";

interface Props {
  clientId: string | null; // null = global library SOP
  userId: string;
  categories?: string[];
}

export function SopNewForm({ clientId, categories = [] }: Props) {
  const router = useRouter();
  const isGlobal = clientId === null;
  const { createSop, isCreating: saving } = useSops(clientId);
  const [form, setForm] = useState({ title: "", category: "General", body: "" });

  function setF(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  const wordCount = useMemo(() => form.body.trim().split(/\s+/).filter(Boolean).length, [form.body]);
  const charCount = form.body.length;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const created = await createSop({ clientId, ...form, order_index: 0 });
      toast.success("SOP created.");
      router.push(`/sops/${(created as Sop).id}`);
      router.refresh();
    } catch {
      // Error toast handled by the API client.
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-400/10 border border-amber-400/20 flex items-center justify-center shrink-0">
          <ListChecks className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{isGlobal ? "New Library SOP" : "New SOP"}</h1>
          <p className="text-sm text-zinc-400">
            {isGlobal
              ? "A generic SOP available to every VA across all clients."
              : "Create a new Standard Operating Procedure"}
          </p>
        </div>
      </div>

      <div className="surface-card px-6 py-6 flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Title <span className="text-red-400">*</span></Label>
            <Input
              id="title"
              value={form.title}
              onChange={e => setF("title", e.target.value)}
              required
              placeholder="e.g. Onboarding a New Client"
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="category">Category</Label>
            <Input
              id="category"
              value={form.category}
              onChange={e => setF("category", e.target.value)}
              list="sop-categories-new"
              placeholder="e.g. Sales, HR, Support"
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
            />
            <datalist id="sop-categories-new">
              {categories.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="body">
            Steps / Content <span className="text-red-400">*</span>
          </Label>
          <p className="text-xs text-zinc-500">
            Tip: start lines with <span className="font-mono bg-zinc-800 px-1.5 py-0.5 rounded">Step 1:</span> format for automatic step numbering.
          </p>
          <Textarea
            id="body"
            value={form.body}
            onChange={e => setF("body", e.target.value)}
            required
            rows={18}
            placeholder={"Step 1: Introduction\nStep 2: Gather requirements\nStep 3: Send proposal"}
            className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 font-mono text-sm leading-relaxed resize-y"
          />
          <p className="text-xs text-zinc-600 text-right">
            {wordCount.toLocaleString()} words &middot; {charCount.toLocaleString()} chars
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="submit" disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Creating…" : "Create SOP"}
          </Button>
        </div>
      </div>
    </form>
  );
}
