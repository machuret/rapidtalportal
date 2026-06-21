"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Save, X, Check, PlayCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { isLoomUrl } from "@/lib/loom";
import { GuideEditor } from "@/components/admin/tutorials/GuideEditor";

export interface FeatureVideoRow {
  slug: string;
  title: string;
  loomUrl: string | null;
}

/**
 * Super-admin tutorials console: per-feature "Video Tutorial" videos and the
 * editable Client / VA guides (each guide section can carry its own video).
 */
export function TutorialsManager({ features }: { features: FeatureVideoRow[] }) {
  return (
    <Tabs defaultValue="videos">
      <TabsList className="mb-6">
        <TabsTrigger value="videos">Feature videos</TabsTrigger>
        <TabsTrigger value="guides">Guides</TabsTrigger>
      </TabsList>

      <TabsContent value="videos">
        <p className="text-sm text-zinc-400 mb-4">
          Add a Loom video to any feature. Clients and VAs see a <span className="text-zinc-200 font-medium">Video Tutorial</span> button
          on that page; leave a feature blank to hide its button.
        </p>
        <div className="flex flex-col gap-2">
          {features.map((f) => (
            <FeatureVideoRowEditor key={f.slug} row={f} />
          ))}
        </div>
      </TabsContent>

      <TabsContent value="guides">
        <GuidesTab />
      </TabsContent>
    </Tabs>
  );
}

function FeatureVideoRowEditor({ row }: { row: FeatureVideoRow }) {
  const [url, setUrl] = useState(row.loomUrl ?? "");
  const [saved, setSaved] = useState(row.loomUrl ?? "");
  const [busy, setBusy] = useState(false);

  const dirty = url.trim() !== saved.trim();
  const bad = url.trim() !== "" && !isLoomUrl(url);

  async function save() {
    if (bad) { toast.error("That doesn't look like a Loom link."); return; }
    setBusy(true);
    try {
      if (url.trim() === "") {
        await api.delete(`${ROUTES.admin.featureVideos()}?slug=${row.slug}`);
        setSaved("");
        toast.success(`Removed the ${row.title} video.`);
      } else {
        await api.patch(ROUTES.admin.featureVideos(), { slug: row.slug, loom_url: url.trim() });
        setSaved(url.trim());
        toast.success(`Saved the ${row.title} video.`);
      }
    } catch { /* toast handled by api-client */ } finally { setBusy(false); }
  }

  return (
    <div className="surface-card flex items-center gap-3 px-4 py-3">
      <div className="w-40 shrink-0 min-w-0">
        <p className="text-sm font-medium text-zinc-100 truncate">{row.title}</p>
        <p className="text-xs text-zinc-500 truncate">/{row.slug}</p>
      </div>
      <div className="flex-1 min-w-0">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.loom.com/share/…"
          aria-invalid={bad}
        />
      </div>
      {saved && !dirty && (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-400 shrink-0">
          <Check className="w-3.5 h-3.5" /> Live
        </span>
      )}
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-zinc-500 hover:text-amber-400 transition-colors"
          title="Open video"
        >
          <PlayCircle className="w-4 h-4" />
        </a>
      )}
      <Button size="sm" onClick={save} disabled={busy || !dirty} className="shrink-0">
        {url.trim() === "" && saved ? <><X className="w-3.5 h-3.5" /> Clear</> : <><Save className="w-3.5 h-3.5" /> Save</>}
      </Button>
    </div>
  );
}

function GuidesTab() {
  const [key, setKey] = useState<"client" | "va">("client");
  return (
    <div className="flex flex-col gap-5">
      <div className="inline-flex rounded-lg border border-zinc-800 p-0.5 self-start">
        {(["client", "va"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKey(k)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${key === k ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
          >
            {k === "client" ? "Client guide" : "VA guide"}
          </button>
        ))}
      </div>
      {/* Remount on key change so the editor reloads that audience's doc. */}
      <GuideEditor key={key} guideKey={key} />
    </div>
  );
}
