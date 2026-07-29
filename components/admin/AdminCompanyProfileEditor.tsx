"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, ExternalLink, Loader2, Save, Share2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface AdminCompanyProfile {
  company_name: string | null;
  company_description: string | null;
  website: string | null;
  address: string | null;
  location: string | null;
  phone: string | null;
  email: string | null;
  founders: string | null;
  client_type: string | null;
  services: string | null;
  target_demographic: string | null;
  social_links: Record<string, string>;
}

interface Props {
  clientId: string;
  clientName: string;
  initialProfile: AdminCompanyProfile | null;
}

const EMPTY_PROFILE: AdminCompanyProfile = {
  company_name: null,
  company_description: null,
  website: null,
  address: null,
  location: null,
  phone: null,
  email: null,
  founders: null,
  client_type: null,
  services: null,
  target_demographic: null,
  social_links: {},
};

const SOCIAL_FIELDS = [
  { key: "linkedin", label: "LinkedIn", placeholder: "https://www.linkedin.com/company/…" },
  { key: "facebook", label: "Facebook", placeholder: "https://www.facebook.com/…" },
  { key: "instagram", label: "Instagram", placeholder: "https://www.instagram.com/…" },
  { key: "x", label: "X / Twitter", placeholder: "https://x.com/…" },
  { key: "youtube", label: "YouTube", placeholder: "https://www.youtube.com/@…" },
] as const;

export function AdminCompanyProfileEditor({ clientId, clientName, initialProfile }: Props) {
  const [profile, setProfile] = useState<AdminCompanyProfile>({
    ...EMPTY_PROFILE,
    ...(initialProfile ?? {}),
    social_links: initialProfile?.social_links ?? {},
  });
  const [saving, setSaving] = useState(false);

  function setField(key: keyof Omit<AdminCompanyProfile, "social_links">, value: string) {
    setProfile((current) => ({ ...current, [key]: value || null }));
  }

  function setSocial(key: string, value: string) {
    setProfile((current) => ({
      ...current,
      social_links: { ...current.social_links, [key]: value },
    }));
  }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.patch(ROUTES.admin.client(clientId), { company_profile: profile });
      toast.success("Company profile saved to Company DNA and synced into the Vault.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save company profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={saveProfile} className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="flex flex-col gap-3 border-b border-zinc-800 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-white">Company profile and sources</h2>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-zinc-400">
            Admin-maintained identity for {clientName}. Saving updates Company DNA and a curated Vault profile so the Brain can use it immediately.
          </p>
        </div>
        <Link
          href={`/admin/vault?client=${clientId}`}
          className="inline-flex shrink-0 items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300"
        >
          Open client Vault <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="space-y-1.5">
          <Label>Company name</Label>
          <Input
            value={profile.company_name ?? ""}
            onChange={(event) => setField("company_name", event.target.value)}
            placeholder={clientName}
          />
        </label>
        <label className="space-y-1.5">
          <Label>Website</Label>
          <Input
            type="url"
            value={profile.website ?? ""}
            onChange={(event) => setField("website", event.target.value)}
            placeholder="https://company.com"
          />
        </label>
        <label className="space-y-1.5 md:col-span-2">
          <Label>Company description</Label>
          <Textarea
            value={profile.company_description ?? ""}
            onChange={(event) => setField("company_description", event.target.value)}
            placeholder="What the company does, its positioning and what makes it distinct."
            rows={3}
          />
        </label>
        <label className="space-y-1.5">
          <Label>Street address</Label>
          <Input
            value={profile.address ?? ""}
            onChange={(event) => setField("address", event.target.value)}
            placeholder="Street, suburb, state, postcode"
          />
        </label>
        <label className="space-y-1.5">
          <Label>Location / service area</Label>
          <Input
            value={profile.location ?? ""}
            onChange={(event) => setField("location", event.target.value)}
            placeholder="Sydney, Australia or nationwide"
          />
        </label>
        <label className="space-y-1.5">
          <Label>Phone</Label>
          <Input
            value={profile.phone ?? ""}
            onChange={(event) => setField("phone", event.target.value)}
            placeholder="+61 …"
          />
        </label>
        <label className="space-y-1.5">
          <Label>Company email</Label>
          <Input
            type="email"
            value={profile.email ?? ""}
            onChange={(event) => setField("email", event.target.value)}
            placeholder="hello@company.com"
          />
        </label>
        <label className="space-y-1.5">
          <Label>Founders / key people</Label>
          <Input
            value={profile.founders ?? ""}
            onChange={(event) => setField("founders", event.target.value)}
            placeholder="Names and roles"
          />
        </label>
        <label className="space-y-1.5">
          <Label>Company type / industry</Label>
          <Input
            value={profile.client_type ?? ""}
            onChange={(event) => setField("client_type", event.target.value)}
            placeholder="Construction recruitment, professional services…"
          />
        </label>
        <label className="space-y-1.5">
          <Label>Services</Label>
          <Textarea
            value={profile.services ?? ""}
            onChange={(event) => setField("services", event.target.value)}
            placeholder="Core services and offers"
            rows={4}
          />
        </label>
        <label className="space-y-1.5">
          <Label>Target audience</Label>
          <Textarea
            value={profile.target_demographic ?? ""}
            onChange={(event) => setField("target_demographic", event.target.value)}
            placeholder="Who they serve and the problems those people need solved"
            rows={4}
          />
        </label>
      </div>

      <div className="mt-6 border-t border-zinc-800 pt-5">
        <div className="mb-3 flex items-center gap-2">
          <Share2 className="h-4 w-4 text-orange-400" />
          <div>
            <h3 className="text-sm font-semibold text-white">Owned social channels</h3>
            <p className="text-xs text-zinc-500">These links are identity sources. LinkedIn post examples can be collected from Admin Vault.</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {SOCIAL_FIELDS.map((field) => (
            <label key={field.key} className="space-y-1.5">
              <Label>{field.label}</Label>
              <Input
                type="url"
                value={profile.social_links[field.key] ?? ""}
                onChange={(event) => setSocial(field.key, event.target.value)}
                placeholder={field.placeholder}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Saving and indexing…" : "Save profile and enrich Brain"}
        </Button>
      </div>
    </form>
  );
}
