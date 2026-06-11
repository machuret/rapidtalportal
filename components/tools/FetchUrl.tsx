"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { Input } from "@/components/ui/input";
import { Globe, Loader2, Download } from "lucide-react";

/** "Fetch from URL" helper — fills a tool's content field from a live page. */
export function FetchUrl({ clientId, onFetched }: { clientId: string; onFetched: (content: string) => void }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  async function fetchIt() {
    if (!url.trim() || loading) return;
    setLoading(true);
    try {
      const r = await api.post<{ content: string }>(ROUTES.tools.fetchUrl(),
        { clientId, url: url.trim() }, { showErrorToast: false });
      onFetched(r.content);
      toast.success("Page content loaded.");
      setUrl("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't fetch the page.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Globe className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <Input value={url} onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void fetchIt(); } }}
          aria-label="Fetch page content from a URL"
          type="url" inputMode="url"
          placeholder="…or fetch from a URL: https://client-site.com/page"
          className="bg-zinc-800 border-zinc-700 text-zinc-100 pl-9 h-8 text-sm" />
      </div>
      <button onClick={() => void fetchIt()} disabled={loading || !url.trim()}
        className="inline-flex items-center gap-1.5 px-3 rounded-md text-xs font-medium bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-50">
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Fetch
      </button>
    </div>
  );
}
