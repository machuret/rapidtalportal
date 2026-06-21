"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { useSops } from "@/hooks/useSops";
import { cn } from "@/lib/utils";
import { serializeSteps, parseSopSteps, type SopStep } from "@/lib/sop-steps";
import type { Sop } from "@/app/(portal)/sops/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sparkles, Loader2, ListChecks, Save, Wand2, ArrowLeft, Plus, Trash2,
  ChevronUp, ChevronDown, Lightbulb, PencilLine, X,
} from "lucide-react";

export interface ExistingSop {
  id: string;
  title: string;
  category: string;
  subcategory?: string | null;
  body: string;
  steps: SopStep[] | null;
  intro: string | null;
  prerequisites: string[] | null;
  visibility?: string | null;
  accessUserIds?: string[];
}

export interface VaOption { id: string; name: string }

interface Props {
  clientId: string | null; // null = global library SOP
  userId: string;
  categories?: string[];
  subcategories?: string[];
  /** VAs that can be granted access when a SOP is restricted. */
  vaOptions?: VaOption[];
  existing?: ExistingSop; // present → edit mode (PATCH + "Improve with AI")
  autoImprove?: boolean;  // open the Improve panel on load (from "Improve with AI")
  /** Prefill the brief (e.g. when created from a suggestion). */
  initialTopic?: string;
  initialCategory?: string;
}

interface Suggestion { title: string; scope: string; stepCount: number }
type Stage = "brief" | "suggesting" | "suggestions" | "generating" | "editor";
type Depth = "quick" | "standard" | "thorough";
type Audience = "new" | "experienced" | "any";

export function SopStudio({ clientId, categories = [], subcategories = [], vaOptions = [], existing, autoImprove = false, initialTopic, initialCategory }: Props) {
  const router = useRouter();
  const isGlobal = clientId === null;
  const isEdit = !!existing;
  const { createSop, isCreating, updateSop, isUpdating } = useSops(clientId);
  const saving = isCreating || isUpdating;

  // Editing an old text SOP with no structured steps → seed cards from its body.
  const seedSteps: SopStep[] = existing
    ? (existing.steps?.length ? existing.steps : parseSopSteps(existing.body).map((t) => ({ title: t, detail: "" })))
    : [];

  const [stage, setStage] = useState<Stage>(isEdit ? "editor" : "brief");

  // Brief
  const [topic, setTopic] = useState(existing?.title ?? initialTopic ?? "");
  const [category, setCategory] = useState(existing?.category ?? initialCategory ?? (isGlobal ? "" : "General"));
  const [subcategory, setSubcategory] = useState(existing?.subcategory ?? "");

  // Visibility: public (everyone in scope) or restricted to chosen VAs.
  const [visibility, setVisibility] = useState<"public" | "restricted">(existing?.visibility === "restricted" ? "restricted" : "public");
  const [accessIds, setAccessIds] = useState<Set<string>>(new Set(existing?.accessUserIds ?? []));
  const [vaFilter, setVaFilter] = useState("");
  const toggleVa = (id: string) => setAccessIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const filteredVas = vaOptions.filter((v) => v.name.toLowerCase().includes(vaFilter.trim().toLowerCase()));
  const [audience, setAudience] = useState<Audience>("any");
  const [depth, setDepth] = useState<Depth>("standard");

  // AI results
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  // Multi-select for mass-producing several angles at once.
  const [selAngles, setSelAngles] = useState<Set<number>>(new Set());
  const [producingAngles, setProducingAngles] = useState(false);
  const toggleAngle = (i: number) => setSelAngles((p) => {
    const n = new Set(p);
    if (n.has(i)) n.delete(i); else n.add(i);
    return n;
  });
  const allAnglesSelected = suggestions.length > 0 && suggestions.every((_, i) => selAngles.has(i));

  // Editor state
  const [title, setTitle] = useState(existing?.title ?? "");
  const [intro, setIntro] = useState(existing?.intro ?? "");
  const [prereqText, setPrereqText] = useState((existing?.prerequisites ?? []).join("\n"));
  const [steps, setSteps] = useState<SopStep[]>(seedSteps);
  const dragIdx = useRef<number | null>(null);

  // "Improve with AI" (edit mode)
  const [improveOpen, setImproveOpen] = useState(autoImprove && !!existing);
  const [instruction, setInstruction] = useState("");
  const [improving, setImproving] = useState(false);

  async function suggest() {
    if (topic.trim().length < 3) return;
    setStage("suggesting");
    try {
      const { suggestions } = await api.post<{ suggestions: Suggestion[] }>(
        ROUTES.sopSuggest(), { topic: topic.trim(), category: category.trim() || undefined, clientId }, { showErrorToast: false },
      );
      setSuggestions(suggestions);
      setStage("suggestions");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't get suggestions.");
      setStage("brief");
    }
  }

  async function generate(chosenTitle?: string) {
    setStage("generating");
    try {
      const res = await api.post<{ title: string; intro: string; prerequisites: string[]; steps: SopStep[] }>(
        ROUTES.sopGenerate(),
        { topic: topic.trim(), title: chosenTitle, category: category.trim() || undefined, audience, depth, clientId },
        { showErrorToast: false },
      );
      setTitle(res.title);
      setIntro(res.intro);
      setPrereqText(res.prerequisites.join("\n"));
      setSteps(res.steps.length ? res.steps : [{ title: "", detail: "" }]);
      setStage("editor");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed.");
      setStage(suggestions.length ? "suggestions" : "brief");
    }
  }

  // Mass-produce full SOPs from the selected angles (no per-one review) and
  // jump to the library to see them.
  async function produceSelectedAngles() {
    const picks = Array.from(selAngles).map((i) => suggestions[i]).filter(Boolean);
    if (!picks.length || producingAngles) return;
    setProducingAngles(true);
    try {
      const items = picks.map((s) => ({ title: s.title, category: category.trim() || undefined, subcategory: subcategory.trim() || undefined }));
      let total = 0;
      for (let i = 0; i < items.length; i += 8) {
        const res = await api.post<{ created: number }>(ROUTES.sopSuggestionsProduce(), { clientId, items: items.slice(i, i + 8) }, { showErrorToast: false });
        total += res.created;
      }
      toast.success(`Produced ${total} SOP${total !== 1 ? "s" : ""} — opening the library.`);
      router.push(isGlobal ? "/admin/sops" : "/sops");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't produce the SOPs.");
    } finally {
      setProducingAngles(false);
    }
  }

  function startBlank() {
    setTitle(topic.trim() || "");
    setIntro("");
    setPrereqText("");
    setSteps([{ title: "", detail: "" }]);
    setStage("editor");
  }

  // ── Step editing ──────────────────────────────────────────────
  const setStep = (i: number, patch: Partial<SopStep>) =>
    setSteps((p) => p.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const addStep = () => setSteps((p) => [...p, { title: "", detail: "" }]);
  const removeStep = (i: number) => setSteps((p) => p.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => setSteps((p) => {
    const j = i + dir;
    if (j < 0 || j >= p.length) return p;
    const next = [...p];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  function onDrop(target: number) {
    const from = dragIdx.current;
    dragIdx.current = null;
    if (from === null || from === target) return;
    setSteps((p) => {
      const next = [...p];
      const [moved] = next.splice(from, 1);
      next.splice(target, 0, moved);
      return next;
    });
  }

  // Improve the SOP currently in the editor — replaces the working draft only;
  // the saved SOP is untouched until the admin clicks Save.
  async function improve() {
    const current = serializeSteps(intro, prereqText.split("\n").map((l) => l.trim()).filter(Boolean), steps);
    setImproving(true);
    try {
      const res = await api.post<{ title: string; intro: string; prerequisites: string[]; steps: SopStep[] }>(
        ROUTES.sopGenerate(),
        { topic: title.trim() || topic.trim() || "this SOP", title: title.trim(), category: category.trim() || undefined,
          audience, depth, clientId, existing: current, instruction: instruction.trim() || undefined },
        { showErrorToast: false },
      );
      if (res.title) setTitle(res.title);
      setIntro(res.intro);
      setPrereqText(res.prerequisites.join("\n"));
      setSteps(res.steps.length ? res.steps : steps);
      setImproveOpen(false);
      setInstruction("");
      toast.success("Draft improved — review and save when you're happy.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't improve the SOP.");
    } finally {
      setImproving(false);
    }
  }

  async function save() {
    const cleanSteps = steps.map((s) => ({ title: s.title.trim(), detail: s.detail.trim(), ...(s.tip?.trim() ? { tip: s.tip.trim() } : {}) }))
      .filter((s) => s.title);
    if (!title.trim()) { toast.error("Give the SOP a title."); return; }
    if (cleanSteps.length === 0) { toast.error("Add at least one step."); return; }
    const prerequisites = prereqText.split("\n").map((l) => l.trim()).filter(Boolean);
    const body = serializeSteps(intro, prerequisites, cleanSteps);
    try {
      if (isEdit) {
        await updateSop({
          id: existing!.id, clientId, title: title.trim(), category: category.trim() || "General",
          subcategory: subcategory.trim() || null,
          body, steps: cleanSteps, intro: intro.trim(), prerequisites,
          visibility, accessUserIds: visibility === "restricted" ? Array.from(accessIds) : [],
        });
        toast.success("SOP updated.");
        router.push(`/sops/${existing!.id}`);
        router.refresh();
      } else {
        const created = await createSop({
          clientId, title: title.trim(), category: category.trim() || "General",
          subcategory: subcategory.trim() || null,
          body, steps: cleanSteps, intro: intro.trim(), prerequisites, order_index: 0,
          visibility, accessUserIds: visibility === "restricted" ? Array.from(accessIds) : [],
        });
        toast.success("SOP created.");
        router.push(`/sops/${(created as Sop).id}`);
        router.refresh();
      }
    } catch { /* api-client toasts */ }
  }

  // ── Header ────────────────────────────────────────────────────
  const header = (
    <div className="flex items-center gap-3 mb-6">
      <div className="w-10 h-10 rounded-lg bg-amber-400/10 border border-amber-400/20 flex items-center justify-center shrink-0">
        <ListChecks className="w-5 h-5 text-amber-400" />
      </div>
      <div>
        <h1 className="text-2xl font-bold">{isEdit ? "Edit SOP" : isGlobal ? "New Library SOP" : "New SOP"}</h1>
        <p className="text-sm text-zinc-400">
          {isEdit ? "Refine it by hand, or improve it with AI — nothing saves until you click Save."
            : isGlobal ? "A generic SOP available to every VA across all clients." : "Build it with AI, then refine."}
        </p>
      </div>
    </div>
  );

  // ── Brief stage ───────────────────────────────────────────────
  if (stage === "brief" || stage === "suggesting") {
    const busy = stage === "suggesting";
    return (
      <div>
        {header}
        <div className="surface-card px-6 py-6 flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="topic">What should this SOP cover?</Label>
            <Input
              id="topic" value={topic} onChange={(e) => setTopic(e.target.value)} disabled={busy}
              onKeyDown={(e) => { if (e.key === "Enter") void suggest(); }}
              placeholder="e.g. Migrating a WordPress site to a new host"
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cat">Category <span className="text-zinc-600 font-normal">(type a new one to create it)</span></Label>
              <Input id="cat" value={category} onChange={(e) => setCategory(e.target.value)} list="sop-cats" disabled={busy}
                placeholder="Type to create, e.g. WordPress" className="bg-zinc-800 border-zinc-700 text-zinc-100" />
              <datalist id="sop-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="subcat">Subcategory <span className="text-zinc-600 font-normal">(optional)</span></Label>
              <Input id="subcat" value={subcategory} onChange={(e) => setSubcategory(e.target.value)} list="sop-subcats" disabled={busy}
                placeholder="e.g. Rank Math" className="bg-zinc-800 border-zinc-700 text-zinc-100" />
              <datalist id="sop-subcats">{subcategories.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="aud">Written for</Label>
              <select id="aud" value={audience} onChange={(e) => setAudience(e.target.value as Audience)} disabled={busy}
                className="h-9 rounded-md border border-zinc-700 bg-zinc-800 text-zinc-100 px-3 text-sm">
                <option value="any">Any VA</option>
                <option value="new">Someone new to this</option>
                <option value="experienced">An experienced operator</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dep">Depth</Label>
              <select id="dep" value={depth} onChange={(e) => setDepth(e.target.value as Depth)} disabled={busy}
                className="h-9 rounded-md border border-zinc-700 bg-zinc-800 text-zinc-100 px-3 text-sm">
                <option value="quick">Quick (4-6 steps)</option>
                <option value="standard">Standard (6-10)</option>
                <option value="thorough">Thorough (10-16)</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button onClick={() => void suggest()} disabled={busy || topic.trim().length < 3} className="gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {busy ? "Thinking…" : "Suggest angles"}
            </Button>
            <Button variant="outline" onClick={() => void generate()} disabled={busy || topic.trim().length < 3} className="gap-2 border-zinc-700">
              <Wand2 className="w-4 h-4" /> Generate directly
            </Button>
            <button onClick={startBlank} disabled={busy} className="ml-auto text-sm text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1.5">
              <PencilLine className="w-3.5 h-3.5" /> Write manually
            </button>
          </div>
          <p className="text-xs text-zinc-600">
            <Lightbulb className="w-3 h-3 inline mr-1" />
            “Suggest angles” gives you a few framings to pick from first — the best way to get a sharp SOP.
          </p>
        </div>
      </div>
    );
  }

  // ── Suggestions stage ─────────────────────────────────────────
  if (stage === "suggestions") {
    return (
      <div>
        {header}
        <button onClick={() => setStage("brief")} className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white mb-4">
          <ArrowLeft className="w-4 h-4" /> Change the brief
        </button>
        <p className="text-sm text-zinc-400 mb-3">Click one to write &amp; refine it — or tick several and produce them all at once.</p>

        <div className="flex flex-wrap items-center gap-3 mb-3">
          <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
            <input type="checkbox" checked={allAnglesSelected} onChange={() => setSelAngles(allAnglesSelected ? new Set() : new Set(suggestions.map((_, i) => i)))} className="accent-amber-500" disabled={producingAngles} />
            Select all
          </label>
          <span className="text-xs text-zinc-600">{selAngles.size} selected</span>
          <Button size="sm" onClick={() => void produceSelectedAngles()} disabled={producingAngles || selAngles.size === 0} className="gap-1.5 ml-auto">
            {producingAngles ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListChecks className="w-4 h-4" />}
            {producingAngles ? "Producing…" : `Produce ${selAngles.size || ""} selected`}
          </Button>
        </div>

        <div className="flex flex-col gap-2.5">
          {suggestions.map((s, i) => (
            <div key={i} className={cn("surface-card flex items-start gap-3 px-4 py-3.5 transition-colors", selAngles.has(i) ? "border-amber-400/40 bg-zinc-800/30" : "")}>
              <input type="checkbox" checked={selAngles.has(i)} onChange={() => toggleAngle(i)} disabled={producingAngles}
                className="accent-amber-500 mt-1 shrink-0" aria-label={`Select ${s.title}`} />
              <button onClick={() => void generate(s.title)} disabled={producingAngles}
                className="text-left flex-1 min-w-0 group disabled:opacity-60">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-zinc-100 flex-1">{s.title}</p>
                  <span className="text-2xs text-zinc-500 shrink-0">{s.stepCount} steps</span>
                  <Wand2 className="w-4 h-4 text-zinc-600 group-hover:text-amber-400 transition-colors shrink-0" />
                </div>
                {s.scope && <p className="text-xs text-zinc-500 mt-1">{s.scope}</p>}
              </button>
            </div>
          ))}
        </div>
        <button onClick={startBlank} className="mt-4 text-sm text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1.5">
          <PencilLine className="w-3.5 h-3.5" /> None of these — write it myself
        </button>
      </div>
    );
  }

  // ── Generating stage ──────────────────────────────────────────
  if (stage === "generating") {
    return (
      <div>
        {header}
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Loader2 className="w-6 h-6 animate-spin text-amber-400 mb-3" />
          <p className="text-sm text-zinc-300 font-medium">Writing your SOP…</p>
          <p className="text-xs text-zinc-500 mt-1">Drafting clear, ordered steps. ~15 seconds.</p>
        </div>
      </div>
    );
  }

  // ── Editor stage ──────────────────────────────────────────────
  return (
    <div>
      {header}
      <div className="flex flex-col gap-5">
        <div className="surface-card px-6 py-5 flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px_180px] gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="t">Title</Label>
              <Input id="t" value={title} onChange={(e) => setTitle(e.target.value)} className="bg-zinc-800 border-zinc-700 text-zinc-100" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="c2">Category</Label>
              <Input id="c2" value={category} onChange={(e) => setCategory(e.target.value)} list="sop-cats2" placeholder="Type to create" className="bg-zinc-800 border-zinc-700 text-zinc-100" />
              <datalist id="sop-cats2">{categories.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sc2">Subcategory</Label>
              <Input id="sc2" value={subcategory} onChange={(e) => setSubcategory(e.target.value)} list="sop-subcats2" placeholder="optional" className="bg-zinc-800 border-zinc-700 text-zinc-100" />
              <datalist id="sop-subcats2">{subcategories.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="intro">Purpose</Label>
            <Textarea id="intro" value={intro} onChange={(e) => setIntro(e.target.value)} rows={2}
              placeholder="What this SOP achieves…" className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pre">Prerequisites <span className="text-zinc-600 font-normal">(one per line, optional)</span></Label>
            <Textarea id="pre" value={prereqText} onChange={(e) => setPrereqText(e.target.value)} rows={2}
              placeholder={"Admin access to the host\nA recent backup"} className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm" />
          </div>

          {vaOptions.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-zinc-800 pt-4">
              <Label>Who can see this SOP?</Label>
              <div className="flex flex-wrap gap-4 text-sm text-zinc-300">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="sop-visibility" checked={visibility === "public"} onChange={() => setVisibility("public")} className="accent-amber-500" />
                  Everyone {isGlobal ? "(all VAs)" : "(all this client's VAs)"}
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="sop-visibility" checked={visibility === "restricted"} onChange={() => setVisibility("restricted")} className="accent-amber-500" />
                  Specific VAs only
                </label>
              </div>
              {visibility === "restricted" && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2 flex flex-col gap-1">
                  <Input value={vaFilter} onChange={(e) => setVaFilter(e.target.value)} placeholder="Filter VAs…" className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm mb-1" />
                  <div className="max-h-52 overflow-y-auto flex flex-col gap-0.5">
                    {filteredVas.length === 0 && <p className="text-xs text-zinc-500 px-1 py-2">No VAs match.</p>}
                    {filteredVas.map((v) => (
                      <label key={v.id} className="flex items-center gap-2 text-sm text-zinc-300 px-1.5 py-1 rounded hover:bg-zinc-800/60 cursor-pointer">
                        <input type="checkbox" checked={accessIds.has(v.id)} onChange={() => toggleVa(v.id)} className="accent-amber-500" />
                        {v.name}
                      </label>
                    ))}
                  </div>
                  <p className="text-2xs text-zinc-600 px-1 pt-1">{accessIds.size} VA{accessIds.size !== 1 ? "s" : ""} selected — only these (and admins) will see it.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Step cards */}
        <div className="flex flex-col gap-3">
          {steps.map((s, i) => (
            <div key={i} draggable onDragStart={() => { dragIdx.current = i; }}
              onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(i)}
              className="surface-card px-4 py-3.5">
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center gap-1 pt-1 shrink-0">
                  <span className="w-6 h-6 rounded-full bg-amber-400/10 border border-amber-400/20 text-amber-400 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="text-zinc-600 hover:text-zinc-300 disabled:opacity-30"><ChevronUp className="w-3.5 h-3.5" /></button>
                  <button onClick={() => move(i, 1)} disabled={i === steps.length - 1} className="text-zinc-600 hover:text-zinc-300 disabled:opacity-30"><ChevronDown className="w-3.5 h-3.5" /></button>
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-2">
                  <Input value={s.title} onChange={(e) => setStep(i, { title: e.target.value })}
                    placeholder="Step title" className="bg-zinc-800 border-zinc-700 text-zinc-100 font-medium h-8" />
                  <Textarea value={s.detail} onChange={(e) => setStep(i, { detail: e.target.value })} rows={2}
                    placeholder="What to do, specifically…" className="bg-zinc-800 border-zinc-700 text-zinc-300 text-sm" />
                  {s.tip !== undefined ? (
                    <div className="flex items-center gap-2">
                      <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <Input value={s.tip} onChange={(e) => setStep(i, { tip: e.target.value })}
                        placeholder="Tip / watch out for…" className="bg-zinc-800 border-zinc-700 text-zinc-400 text-xs h-7" />
                      <button onClick={() => setStep(i, { tip: undefined })} className="text-zinc-600 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ) : (
                    <button onClick={() => setStep(i, { tip: "" })} className="self-start text-xs text-zinc-600 hover:text-amber-400 inline-flex items-center gap-1">
                      <Plus className="w-3 h-3" /> Add tip
                    </button>
                  )}
                </div>
                <button onClick={() => removeStep(i)} className="text-zinc-600 hover:text-red-400 shrink-0 pt-1"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
          <button onClick={addStep} className="surface-card border-dashed px-4 py-3 text-sm text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors inline-flex items-center justify-center gap-1.5">
            <Plus className="w-4 h-4" /> Add step
          </button>
        </div>

        {/* Improve with AI (edit mode) */}
        {isEdit && improveOpen && (
          <div className="surface-card px-4 py-3 flex flex-col gap-2">
            <Label htmlFor="instr" className="text-xs">What should the AI focus on? <span className="text-zinc-600 font-normal">(optional)</span></Label>
            <div className="flex gap-2">
              <Input id="instr" value={instruction} onChange={(e) => setInstruction(e.target.value)} disabled={improving}
                placeholder="e.g. add a QA step, make it clearer for beginners…" className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm" />
              <Button onClick={() => void improve()} disabled={improving} className="gap-2 shrink-0">
                {improving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Improve
              </Button>
            </div>
            <p className="text-2xs text-zinc-600">This rewrites the draft below for review — your saved SOP isn&apos;t touched until you Save.</p>
          </div>
        )}

        <div className="flex items-center gap-2">
          {isEdit ? (
            <button onClick={() => router.push(`/sops/${existing!.id}`)} className="text-sm text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1.5">
              <ArrowLeft className="w-3.5 h-3.5" /> Cancel
            </button>
          ) : (
            <button onClick={() => setStage("brief")} className="text-sm text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1.5">
              <ArrowLeft className="w-3.5 h-3.5" /> Start over
            </button>
          )}
          <Button
            onClick={() => (isEdit ? setImproveOpen((o) => !o) : void generate(title || undefined))}
            variant="outline" className="ml-auto gap-2 border-zinc-700"
          >
            <Sparkles className="w-4 h-4" /> {isEdit ? "Improve with AI" : "Regenerate"}
          </Button>
          <Button onClick={() => void save()} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {isEdit ? "Save changes" : "Save SOP"}
          </Button>
        </div>
      </div>
    </div>
  );
}
