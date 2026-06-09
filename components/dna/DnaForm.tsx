"use client";

import { useState } from "react";
import type { DbCompanyDna } from "@/types/database";
import { useDna } from "@/hooks/useDna";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Copy, Check, Globe, Loader2 } from "lucide-react";

interface DnaFormProps {
  initialData: DbCompanyDna | null;
  clientId: string;
  readOnly: boolean;
}

const fields: { key: keyof DbCompanyDna; label: string; multiline?: boolean }[] = [
  { key: "company_name", label: "Company Name" },
  { key: "founders", label: "Founders" },
  { key: "location", label: "Location" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "website", label: "Website" },
  { key: "client_type", label: "Client Type" },
  { key: "target_demographic", label: "Target Demographic" },
  { key: "values", label: "Company Values", multiline: true },
  { key: "services", label: "Services Offered", multiline: true },
];

export function DnaForm({ initialData, clientId, readOnly }: DnaFormProps) {
  const { saveDna, isSaving: saving, scrapeDna, isScraping } = useDna();
  const [form, setForm] = useState<Partial<DbCompanyDna>>(initialData ?? {});
  const [updatedAt, setUpdatedAt] = useState(initialData?.updated_at ?? null);
  const [copied, setCopied] = useState(false);
  const [scrapingUrl, setScrapingUrl] = useState("");

  function set(key: keyof DbCompanyDna, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
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
        services: scrapedData.services || prev.services,
        values: scrapedData.values || prev.values,
        phone: scrapedData.phone || prev.phone,
        email: scrapedData.email || prev.email,
        website: scrapedData.website || prev.website,
        founders: scrapedData.founders || prev.founders,
        target_demographic: scrapedData.target_demographic || prev.target_demographic,
        client_type: scrapedData.client_type || prev.client_type,
      }));

      setUpdatedAt(scrapedData.updated_at ?? null);
      toast.success(`Company information extracted successfully (${data.tokensUsed} tokens used)`);
      setScrapingUrl("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to extract company information");
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    try {
      await saveDna({ form, clientId });
      toast.success("Company DNA saved.");
      setUpdatedAt(new Date().toISOString());
    } catch (err) {
      toast.error("Failed to save: " + (err instanceof Error ? err.message : "error"));
    }
  }

  async function copyAll() {
    const text = fields
      .map(({ key, label }) => `${label}: ${(form[key] as string) ?? "—"}`)
      .join("\n");
    await navigator.clipboard.writeText(text);
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
            {copied ? <><Check className="w-3.5 h-3.5 text-green-400" />Copied!</> : <><Copy className="w-3.5 h-3.5" />Copy all</>}
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {fields.map(({ key, label, multiline }) => {
            const value = (form[key] as string) ?? "";
            return (
              <div key={key} className={`rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 ${multiline ? "sm:col-span-2" : ""}`}>
                <p className="text-xs font-medium text-zinc-500 mb-1">{label}</p>
                <p className={`text-sm text-zinc-200 ${!value ? "text-zinc-600 italic" : ""} ${multiline ? "whitespace-pre-wrap" : ""}`}>
                  {value || "Not set"}
                </p>
              </div>
            );
          })}
        </div>
        {updatedAt && (
          <p className="text-xs text-zinc-600">Last updated: {new Date(updatedAt).toLocaleString()}</p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-5">
      {/* URL Scraping Section */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Globe className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-white">Auto-populate from Website</h3>
        </div>
        <p className="text-xs text-zinc-400 mb-3">
          Enter a company website URL to automatically extract company information using AI.
        </p>
        {/* NOTE: This is intentionally NOT a <form> — it lives inside the Save DNA form.
             Nested <form> elements are invalid HTML; browsers silently ignore inner forms.
             Using div + onClick instead. */}
        <div className="flex gap-2">
          <Input
            type="url"
            placeholder="https://example.com"
            value={scrapingUrl}
            onChange={(e) => setScrapingUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleUrlScrape(); } }}
            className="flex-1 bg-zinc-800 border-zinc-600"
            disabled={isScraping}
          />
          <Button
            type="button"
            onClick={() => void handleUrlScrape()}
            disabled={isScraping || !scrapingUrl.trim()}
            variant="outline"
            className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10"
          >
            {isScraping ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Extracting...
              </>
            ) : (
              "Extract"
            )}
          </Button>
        </div>
      </div>

      {fields.map(({ key, label, multiline }) => (
        <div key={key} className="flex flex-col gap-1.5">
          <Label>{label}</Label>
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
      {updatedAt && (
        <p className="text-xs text-zinc-500">Last saved: {new Date(updatedAt).toLocaleString()}</p>
      )}
      <Button type="submit" disabled={saving} className="self-start">
        {saving ? "Saving…" : "Save DNA"}
      </Button>
    </form>
  );
}
