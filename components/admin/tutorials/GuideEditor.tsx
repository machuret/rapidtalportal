"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, RotateCcw, Save, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { isLoomUrl } from "@/lib/loom";
import type { GuideGroup, GuideItem } from "@/lib/client-guide";

type GuideKey = "client" | "va";
interface GuideDoc { intro: string; groups: GuideGroup[] }
interface GetResp { doc: GuideDoc; isCustom: boolean; updatedAt: string | null; default: GuideDoc }

const emptyItem = (): GuideItem => ({ title: "New section", what: "", why: "", can: [], how: [], tip: "", video: "" });
const emptyGroup = (): GuideGroup => ({ heading: "New group", blurb: "", items: [emptyItem()] });

/** Structured editor for one audience's guide (intro + groups + items + per-item video). */
export function GuideEditor({ guideKey }: { guideKey: GuideKey }) {
  const [doc, setDoc] = useState<GuideDoc | null>(null);
  const [isCustom, setIsCustom] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.get<GetResp>(`${ROUTES.admin.guides()}?key=${guideKey}`)
      .then((r) => { if (active) { setDoc(r.doc); setIsCustom(r.isCustom); } })
      .catch(() => { /* toast handled by api-client */ })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [guideKey]);

  function patchGroup(gi: number, next: Partial<GuideGroup>) {
    setDoc((d) => d && { ...d, groups: d.groups.map((g, i) => (i === gi ? { ...g, ...next } : g)) });
  }
  function patchItem(gi: number, ii: number, next: Partial<GuideItem>) {
    setDoc((d) => d && {
      ...d,
      groups: d.groups.map((g, i) => i !== gi ? g : { ...g, items: g.items.map((it, j) => (j === ii ? { ...it, ...next } : it)) }),
    });
  }
  function removeGroup(gi: number) {
    setDoc((d) => d && { ...d, groups: d.groups.filter((_, i) => i !== gi) });
  }
  function addGroup() {
    setDoc((d) => d && { ...d, groups: [...d.groups, emptyGroup()] });
  }
  function addItem(gi: number) {
    setDoc((d) => d && { ...d, groups: d.groups.map((g, i) => (i === gi ? { ...g, items: [...g.items, emptyItem()] } : g)) });
  }
  function removeItem(gi: number, ii: number) {
    setDoc((d) => d && { ...d, groups: d.groups.map((g, i) => (i === gi ? { ...g, items: g.items.filter((_, j) => j !== ii) } : g)) });
  }

  async function save() {
    if (!doc) return;
    setSaving(true);
    // Drop blank bullet/step lines and trim empties only at save time, so typing
    // a new line mid-edit isn't fought by the field rewriting itself.
    const clean: GuideDoc = {
      intro: doc.intro,
      groups: doc.groups.map((g) => ({
        ...g,
        items: g.items.map((it) => ({
          ...it,
          can: it.can.map((s) => s.trim()).filter(Boolean),
          how: it.how.map((s) => s.trim()).filter(Boolean),
        })),
      })),
    };
    try {
      await api.patch(ROUTES.admin.guides(), { key: guideKey, data: clean });
      setDoc(clean);
      setIsCustom(true);
      toast.success("Guide saved — live within a few seconds.");
    } catch { /* toast handled by api-client */ } finally { setSaving(false); }
  }

  async function reset() {
    if (!confirm("Reset this guide to the built-in default? Your edits will be discarded.")) return;
    setSaving(true);
    try {
      await api.delete(`${ROUTES.admin.guides()}?key=${guideKey}`);
      const r = await api.get<GetResp>(`${ROUTES.admin.guides()}?key=${guideKey}`);
      setDoc(r.doc); setIsCustom(false);
      toast.success("Guide reset to default.");
    } catch { /* toast handled by api-client */ } finally { setSaving(false); }
  }

  if (loading || !doc) return <p className="text-sm text-zinc-500">Loading guide…</p>;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <span className={`text-xs font-medium rounded-full px-2.5 py-0.5 ${isCustom ? "text-emerald-400 bg-emerald-400/10 border border-emerald-400/20" : "text-zinc-400 bg-zinc-800 border border-zinc-700"}`}>
          {isCustom ? "Edited" : "Built-in default"}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={reset} disabled={saving}>
            <RotateCcw className="w-3.5 h-3.5" /> Reset to default
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            <Save className="w-3.5 h-3.5" /> {saving ? "Saving…" : "Save guide"}
          </Button>
        </div>
      </div>

      <div>
        <Label className="text-xs text-zinc-400">Intro</Label>
        <Textarea value={doc.intro} onChange={(e) => setDoc({ ...doc, intro: e.target.value })} rows={4} className="mt-1" />
      </div>

      {doc.groups.map((group, gi) => (
        <div key={gi} className="surface-card p-4 flex flex-col gap-3">
          <div className="flex items-start gap-2">
            <div className="flex-1 flex flex-col gap-2">
              <Input value={group.heading} onChange={(e) => patchGroup(gi, { heading: e.target.value })} placeholder="Group heading" className="font-semibold" />
              <Input value={group.blurb ?? ""} onChange={(e) => patchGroup(gi, { blurb: e.target.value })} placeholder="Short blurb (optional)" />
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => removeGroup(gi)} title="Delete group">
              <Trash2 className="w-4 h-4 text-red-400" />
            </Button>
          </div>

          <div className="flex flex-col gap-2 pl-1">
            {group.items.map((item, ii) => (
              <ItemEditor
                key={ii}
                item={item}
                onChange={(next) => patchItem(gi, ii, next)}
                onRemove={() => removeItem(gi, ii)}
              />
            ))}
            <Button variant="outline" size="sm" onClick={() => addItem(gi)} className="self-start">
              <Plus className="w-3.5 h-3.5" /> Add section
            </Button>
          </div>
        </div>
      ))}

      <Button variant="outline" size="sm" onClick={addGroup} className="self-start">
        <Plus className="w-3.5 h-3.5" /> Add group
      </Button>
    </div>
  );
}

/** A single collapsible guide section (item) editor with all fields + video. */
function ItemEditor({ item, onChange, onRemove }: { item: GuideItem; onChange: (next: Partial<GuideItem>) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const videoBad = !!item.video && !isLoomUrl(item.video);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40">
      <div className="flex items-center gap-2 px-3 py-2">
        <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 flex-1 text-left text-sm font-medium text-zinc-100">
          {open ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
          {item.title || "Untitled section"}
          {item.video && <span className="text-xs text-amber-400">• video</span>}
        </button>
        <Button variant="ghost" size="icon-sm" onClick={onRemove} title="Delete section">
          <Trash2 className="w-4 h-4 text-red-400" />
        </Button>
      </div>
      {open && (
        <div className="px-3 pb-3 pt-1 flex flex-col gap-3 border-t border-zinc-800">
          <Field label="Title">
            <Input value={item.title} onChange={(e) => onChange({ title: e.target.value })} />
          </Field>
          <Field label="Video tutorial (Loom link, optional)">
            <Input
              value={item.video ?? ""}
              onChange={(e) => onChange({ video: e.target.value })}
              placeholder="https://www.loom.com/share/…"
              aria-invalid={videoBad}
            />
            {videoBad && <p className="text-xs text-red-400 mt-1">That doesn&apos;t look like a Loom link.</p>}
          </Field>
          <Field label="What it is">
            <Textarea value={item.what} onChange={(e) => onChange({ what: e.target.value })} rows={2} />
          </Field>
          <Field label="Why it matters">
            <Textarea value={item.why} onChange={(e) => onChange({ why: e.target.value })} rows={2} />
          </Field>
          <Field label="What you can do (one per line)">
            <Textarea value={item.can.join("\n")} onChange={(e) => onChange({ can: splitLines(e.target.value) })} rows={3} />
          </Field>
          <Field label="How to use it (one step per line)">
            <Textarea value={item.how.join("\n")} onChange={(e) => onChange({ how: splitLines(e.target.value) })} rows={3} />
          </Field>
          <Field label="Tip (optional)">
            <Input value={item.tip ?? ""} onChange={(e) => onChange({ tip: e.target.value })} />
          </Field>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs text-zinc-400">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/** Raw split — blanks are kept while editing and pruned in save(). */
function splitLines(v: string): string[] {
  return v.split("\n");
}
